const { ethers } = require('ethers');
const blockchain = require('../services/blockchain');
const pricing = require('../services/pricing');
const redis = require('../services/redis');
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
}

class TradeProcessor {
    constructor() {
        this.isProcessing = false;
        this.settlingIds = new Set();
    }

    async init() {
        console.log('[Processor] Initializing trade processor...');

        // Listen for new trades on-chain
        blockchain.onBetPlaced(async (trade) => {
            console.log(`[Processor] On-chain trade detected: ${trade.id} by ${trade.user}`);

            // 🛑 CRITICAL FIX: Ignore events for old trades (replay protection)
            // If the trade is older than 2 minutes, it's likely a replay or a zombie.
            const now = Date.now();
            const tradeTime = Number(trade.timestamp) * 1000; // Convert to ms
            // If trade is older than its own duration + 60s buffer, or just arbitrarily old (5 mins)
            if (now - tradeTime > 300000) {
                console.warn(`[Processor] ⚠️ Ignoring old trade event ${trade.id} (Timestamp: ${new Date(tradeTime).toISOString()})`);
                return;
            }

            const existing = await redis.getTrade(trade.id.toString());
            if (!existing) {
                // Double check if it's already settled on chain to be safe
                // (Optional optimization, but good for robustness)

                await redis.setTrade(trade.id.toString(), {
                    ...trade,
                    id: trade.id.toString(),
                    expiry: Date.now() + (Number(trade.duration) * 1000)
                });
            }
        });

        // Start settlement loop every 1000ms (slowed down from 500ms to reduce load)
        setInterval(() => this.processSettlements(), 1000);

        // Run recovery scan after a short delay to allow provider to settle
        setTimeout(() => this.recoverUnsettledTrades(), 5000);

        // Start periodic zombie check every 5 minutes
        setInterval(() => this.performZombieCheck(), 5 * 60 * 1000);
    }

    async recoverUnsettledTrades() {
        console.log('[Processor] 🛡️ Starting settlement recovery scan...');
        try {
            const currentBlock = await blockchain.getCurrentBlock();
            // Scan last ~2 hours (approx 2400 blocks if 3s block time, or 7200 if 1s)
            // Arc Testnet is fast, so let's scan last 10,000 blocks to be safe
            const fromBlock = Math.max(0, currentBlock - 10000);

            const [placedEvents, settledEvents] = await Promise.all([
                blockchain.getPastEvents("BetPlaced", fromBlock),
                blockchain.getPastEvents("BetSettled", fromBlock)
            ]);

            const settledIds = new Set(settledEvents.map(e => e.args.id.toString()));
            console.log(`[Processor] Recovery: Found ${placedEvents.length} placements and ${settledEvents.length} settlements in scan range.`);

            let recoveredCount = 0;
            for (const event of placedEvents) {
                const tradeId = event.args.id.toString();
                if (!settledIds.has(tradeId)) {
                    const existing = await redis.getTrade(tradeId);
                    if (!existing) {
                        const tradeData = {
                            id: tradeId,
                            user: event.args.user,
                            amount: ethers.formatEther(event.args.amount),
                            direction: Number(event.args.direction),
                            duration: Number(event.args.duration),
                            entryPrice: (Number(event.args.entryPrice) / 1e8).toFixed(4),
                            timestamp: Number(event.args.timestamp) * 1000,
                            expiry: (Number(event.args.timestamp) + Number(event.args.duration)) * 1000,
                            recovered: true
                        };
                        await redis.setTrade(tradeId, tradeData);
                        recoveredCount++;
                    }
                }
            }

            if (recoveredCount > 0) {
                console.log(`[Processor] 🛡️ Recovery complete: Restored ${recoveredCount} unsettled trades from blockchain!`);
                logToFile(`🛡️ Recovery scan restored ${recoveredCount} unsettled trades.`);
            } else {
                console.log('[Processor] 🛡️ Recovery complete: No missed trades found.');
            }
        } catch (e) {
            console.error('[Processor] ❌ Recovery scan failed:', e.message);
        }
    }

    async performZombieCheck() {
        console.log('[Processor] 🧟 Running periodic zombie trade check...');
        try {
            const activeTrades = await redis.getAllActiveTrades();
            const now = Date.now();

            // Check trades that are more than 10 minutes past their expiry
            const potentialZombies = activeTrades.filter(t => now > (t.expiry + 10 * 60 * 1000));

            if (potentialZombies.length === 0) return;

            console.log(`[Processor] 🧟 Found ${potentialZombies.length} potential zombies. Verifying on-chain...`);

            for (const trade of potentialZombies) {
                try {
                    // Check actual contract state
                    const onChainBet = await blockchain.contract.bets(trade.id);
                    if (onChainBet.settled) {
                        console.log(`[Processor] 🧟 Zombie ${trade.id} is actually settled on-chain. Cleaning up.`);
                        await redis.delTrade(trade.id.toString());
                    } else if (now > (trade.expiry + 60 * 60 * 1000)) {
                        // If it's more than 1 hour old and still not settled, it might be a dead trade
                        // but we keep it for now unless explicitly asked to purge
                        console.warn(`[Processor] ⚠️ Trade ${trade.id} is >1hr old and still unsettled on-chain.`);
                    }
                } catch (err) {
                    console.error(`[Processor] ❌ Failed to verify zombie ${trade.id}:`, err.message);
                }
            }
        } catch (e) {
            console.error('[Processor] ❌ Zombie check failed:', e.message);
        }
    }

    async registerTrade(tradeData) {
        // Primary path: frontend pings us directly after placing a trade
        const existing = await redis.getTrade(tradeData.id.toString());
        if (existing) {
            console.log(`[Processor] Trade ${tradeData.id} already registered, skipping.`);
            return;
        }
        await redis.setTrade(tradeData.id.toString(), tradeData);
        console.log(`[Processor] Trade ${tradeData.id} registered. Expires at ${new Date(tradeData.expiry).toISOString()}`);

        const historyItem = {
            ...tradeData,
            status: 'PENDING',
            timestamp: Date.now()
        };

        // Push to global history immediately so scroller shows activity
        await redis.pushHistory(historyItem).catch(() => { });
        // Push to user-specific history for cross-device consistency
        const userAddr = tradeData.user?.toLowerCase();
        await redis.pushUserHistory(userAddr, historyItem).catch(() => { });

        // CROSS-DEVICE FIX: Also push to the main wallet's history if this is a session wallet trade
        try {
            const mainAddr = await redis.getMainAddressForSession(userAddr);
            if (mainAddr && mainAddr !== userAddr) {
                await redis.pushUserHistory(mainAddr, historyItem).catch(() => { });
                console.log(`[Processor] 🔗 Also pushed trade ${tradeData.id} history to main wallet ${mainAddr}`);
            }
        } catch (e) { }
    }

    async processSettlements() {
        if (this.isProcessing) return;

        // Ensure shared log exists
        if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, 'Log started\n');

        // Skip if blockchain is not ready yet
        if (!blockchain.providerReady) {
            return;
        }

        this.isProcessing = true;

        try {
            const activeTrades = await redis.getAllActiveTrades();
            const now = Date.now();

            if (activeTrades.length > 0) {
                console.log(`[Processor] 🔍 Tick: ${activeTrades.length} active trades in Redis.`);
            }

            // Filter for trades ready to settle
            const toSettle = activeTrades.filter(t => {
                const isReady = now >= t.expiry;
                const isNotSettling = !this.settlingIds.has(t.id.toString());
                return isReady && isNotSettling;
            });

            if (toSettle.length > 0) {
                console.log(`[Processor] 🚀 Found ${toSettle.length} trades to settle!`);
                logToFile(`Found ${toSettle.length} trades to settle.`);

                // Limit concurrency to 5 settlements at a time (now sequential within batch for nonce safety)
                const BATCH_SIZE = 5;
                for (let i = 0; i < toSettle.length; i += BATCH_SIZE) {
                    const batch = toSettle.slice(i, i + BATCH_SIZE);

                    for (const trade of batch) {
                        const tradeId = trade.id.toString();
                        this.settlingIds.add(tradeId);
                        try {
                            const ID_ASSET_MAP = { 0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL' };
                            // Use symbol directly if available (from trade-ping), else fall back to marketId map
                            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

                            const currentPrice = await pricing.getPrice(symbol);

                            console.log(`[Processor] Settling ${trade.id} (${symbol}) at price ${currentPrice}`);

                            // Contract expects price with 8 decimals as uint256
                            const scaledPrice = BigInt(Math.round(currentPrice * 1e8));

                            let entry = parseFloat(trade.entryPrice);
                            if (entry > 1000000000) entry = entry / 1e8;

                            const isUp = trade.direction === 'UP' || trade.direction === 'buy' || trade.direction === 1 || trade.direction === '1';
                            const isWin = isUp ? (currentPrice > entry) : (currentPrice < entry);

                            console.log(`[Processor] Outcome for ${trade.id}: ${isWin ? 'WON' : 'LOST'} (Entry: ${entry.toFixed(4)}, Exit: ${currentPrice.toFixed(4)}, Dir: ${trade.direction} -> ${isUp ? 'UP' : 'DOWN'})`);

                            const result = await blockchain.settleBet(trade.id, scaledPrice);
                            logToFile(`✅ Settled trade ${trade.id} for ${trade.user}. Price: ${currentPrice}. Win: ${isWin}${result.alreadySettled ? ' (Already Settled)' : ''}`);

                            const finalizedItem = {
                                ...trade,
                                status: isWin ? 'WON' : 'LOST',
                                settlementPrice: currentPrice,
                                settledAt: Date.now()
                            };

                            // Update history and profile
                            await redis.pushHistory(finalizedItem).catch(() => { });
                            const tradeUserAddr = trade.user?.toLowerCase();
                            await redis.pushUserHistory(tradeUserAddr, finalizedItem).catch(() => { });

                            const linkedMainAddr = await redis.getMainAddressForSession(tradeUserAddr).catch(() => null);
                            if (linkedMainAddr && linkedMainAddr !== tradeUserAddr) {
                                await redis.pushUserHistory(linkedMainAddr, finalizedItem).catch(() => { });
                            }

                            // STICKY PROFILE UPDATE
                            try {
                                const mainAddr = await redis.getMainAddressForSession(trade.user) || trade.user;
                                const userProfile = await redis.getProfile(mainAddr);
                                if (userProfile) {
                                    userProfile.totalTrades = (userProfile.totalTrades || 0) + 1;
                                    if (isWin) userProfile.totalWins = (userProfile.totalWins || 0) + 1;
                                    else userProfile.totalLosses = (userProfile.totalLosses || 0) + 1;
                                    userProfile.totalVolume = (parseFloat(userProfile.totalVolume || "0") + parseFloat(trade.amount)).toFixed(2);
                                    await redis.saveProfile(mainAddr, userProfile);
                                    console.log(`[Processor] 🎯 Updated stats for ${mainAddr}`);
                                }
                            } catch (e) {
                                console.warn(`[Processor] Failed to update profile stats for ${trade.user}:`, e.message);
                            }

                            await redis.delTrade(trade.id.toString());
                            console.log(`[Processor] ✅ Successfully settled trade ${trade.id}`);
                        } catch (e) {
                            logToFile(`❌ Error settling trade ${trade.id}: ${e.message}`);
                            console.error(`[Processor] ❌ Error settling trade ${trade.id}:`, e.message);

                            const errorMsg = e.message?.toLowerCase() || "";

                            // Aggressive Retry: Only remove if settled or definitely invalid.
                            // Keep in Redis for treasury/gas/network errors so it retries every tick.
                            const shouldPurge = errorMsg.includes('already settled') ||
                                errorMsg.includes('invalid') ||
                                (errorMsg.includes('revert') && !errorMsg.includes('treasury') && !errorMsg.includes('balance'));

                            if (shouldPurge) {
                                console.log(`[Processor] 🗑️ Trade ${trade.id} appears settled/invalid. Removing from Redis.`);
                                await redis.delTrade(trade.id.toString());
                            } else {
                                console.warn(`[Processor] ⚠️ Settlement retry active for ${trade.id}: ${e.message.slice(0, 100)}`);
                            }
                        } finally {
                            this.settlingIds.delete(trade.id.toString());
                        }
                    }
                }
            }
        } catch (e) {
            console.error('[Processor] Settlement loop error:', e);
        } finally {
            this.isProcessing = false;
        }
    }

    async getActiveTradesForUser(address) {
        try {
            const addr = address.toLowerCase();
            const profile = await redis.getProfile(addr);
            const addresses = [addr];
            if (profile && profile.sessionWalletAddress) {
                addresses.push(profile.sessionWalletAddress.toLowerCase());
            }

            const trades = await redis.getAllActiveTrades();
            return trades.filter(t => addresses.includes(t.user?.toLowerCase()));
        } catch (e) {
            console.error('[Processor] Error fetching user trades:', e);
            return [];
        }
    }

    async getGlobalHistory() {
        return await redis.getHistory();
    }
}

module.exports = new TradeProcessor();

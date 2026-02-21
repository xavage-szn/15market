const { ethers } = require('ethers');
const blockchain = require('../services/blockchain');
const pricing = require('../services/pricing');
const redis = require('../services/redis');
const fs = require('fs');
const path = require('path');

// TRUNCATE price to 3 decimal places (floor, not round)
// e.g. 2456.7899 → 2456.789, 0.12345 → 0.123
function truncTo3dp(price) {
    return Math.floor(price * 1000) / 1000;
}

const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFileSync(LOG_FILE, entry);
}

class TradeProcessor {
    constructor() {
        this.isProcessing = false;
        this.settlingIds = new Set();       // Trades currently being settled (in-flight)
        this.settledCache = new Set();      // Recently settled trade IDs (prevents re-entry)
        this.SETTLED_CACHE_TTL = 30 * 60 * 1000; // 30 minutes
    }

    // Mark a trade as recently settled to prevent re-processing
    markSettled(tradeId) {
        const id = tradeId.toString();
        this.settledCache.add(id);
        // Auto-expire after TTL to prevent memory leak
        setTimeout(() => this.settledCache.delete(id), this.SETTLED_CACHE_TTL);
    }

    // Check if a trade was already settled (in-memory guard)
    wasAlreadySettled(tradeId) {
        return this.settledCache.has(tradeId.toString());
    }

    async init() {
        console.log('[Processor] Initializing trade processor...');

        // Listen for new trades on-chain
        blockchain.onBetPlaced(async (trade) => {
            console.log(`[Processor] On-chain trade detected: ${trade.id} by ${trade.user}`);

            // 🛑 GUARD 1: Ignore events for old trades (replay protection)
            const now = Date.now();
            const tradeTime = Number(trade.timestamp) * 1000;
            if (now - tradeTime > 300000) {
                console.warn(`[Processor] ⚠️ Ignoring old trade event ${trade.id} (Timestamp: ${new Date(tradeTime).toISOString()})`);
                return;
            }

            // 🛑 GUARD 2: Don't re-add trades that were recently settled
            if (this.wasAlreadySettled(trade.id)) {
                console.log(`[Processor] ⚠️ Ignoring BetPlaced for ${trade.id} — already settled recently.`);
                return;
            }

            const existing = await redis.getTrade(trade.id.toString());
            if (!existing) {
                await redis.setTrade(trade.id.toString(), {
                    ...trade,
                    id: trade.id.toString(),
                    expiry: (Number(trade.timestamp) + Number(trade.duration)) * 1000
                });
            }
        });

        // Start settlement loop every 500ms
        setInterval(() => this.processSettlements(), 500);

        // Run recovery scan after a short delay
        setTimeout(() => this.recoverUnsettledTrades(), 5000);

        // Start periodic zombie check every 5 minutes
        setInterval(() => this.performZombieCheck(), 5 * 60 * 1000);
    }

    async recoverUnsettledTrades() {
        console.log('[Processor] 🛡️ Starting settlement recovery scan...');
        try {
            const currentBlock = await blockchain.getCurrentBlock();
            const fromBlock = Math.max(0, currentBlock - 10000);

            const [placedEvents, settledEvents] = await Promise.all([
                blockchain.getPastEvents("BetPlaced", fromBlock),
                blockchain.getPastEvents("BetSettled", fromBlock)
            ]);

            const settledIds = new Set(settledEvents.map(e => e.args.id.toString()));
            console.log(`[Processor] Recovery: Found ${placedEvents.length} placements and ${settledEvents.length} settlements in scan range.`);

            // 🛑 GUARD: Also mark all on-chain settled trades in our settled cache
            for (const id of settledIds) {
                this.markSettled(id);
            }

            let recoveredCount = 0;
            for (const event of placedEvents) {
                const tradeId = event.args.id.toString();

                // 🛑 Skip if already settled on-chain
                if (settledIds.has(tradeId)) continue;

                // 🛑 Skip if in our settled cache
                if (this.wasAlreadySettled(tradeId)) continue;

                // 🛑 Skip if currently being settled
                if (this.settlingIds.has(tradeId)) continue;

                const existing = await redis.getTrade(tradeId);
                if (!existing) {
                    const tradeData = {
                        id: tradeId,
                        user: event.args.user,
                        amount: ethers.formatEther(event.args.amount),
                        direction: Number(event.args.direction),
                        duration: Number(event.args.duration),
                        entryPrice: (Number(event.args.entryPrice) / 1e8).toFixed(4),
                        marketId: Number(event.args.marketId),
                        timestamp: Number(event.args.timestamp) * 1000,
                        expiry: (Number(event.args.timestamp) + Number(event.args.duration)) * 1000,
                        recovered: true
                    };
                    await redis.setTrade(tradeId, tradeData);
                    recoveredCount++;
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

            const potentialZombies = activeTrades.filter(t => now > (t.expiry + 10 * 60 * 1000));

            if (potentialZombies.length === 0) return;

            console.log(`[Processor] 🧟 Found ${potentialZombies.length} potential zombies. Verifying on-chain...`);

            for (const trade of potentialZombies) {
                try {
                    const onChainBet = await blockchain.contract.bets(trade.id);
                    if (onChainBet.settled) {
                        console.log(`[Processor] 🧟 Zombie ${trade.id} is actually settled on-chain. Cleaning up.`);
                        await redis.delTrade(trade.id.toString());
                        this.markSettled(trade.id); // Prevent re-addition
                    } else if (now > (trade.expiry + 60 * 60 * 1000)) {
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
        // 🛑 GUARD: Don't register trades that were recently settled
        if (this.wasAlreadySettled(tradeData.id)) {
            console.log(`[Processor] ⚠️ Rejecting registration of already-settled trade ${tradeData.id}`);
            return;
        }

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

        await redis.pushHistory(historyItem).catch(() => { });
        const userAddr = tradeData.user?.toLowerCase();
        await redis.pushUserHistory(userAddr, historyItem).catch(() => { });

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

        if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, 'Log started\n');

        if (!blockchain.providerReady) return;

        this.isProcessing = true;

        try {
            const activeTrades = await redis.getAllActiveTrades();
            const now = Date.now();

            if (activeTrades.length > 0) {
                console.log(`[Processor] 🔍 Tick: ${activeTrades.length} active trades in Redis.`);
            }

            // Filter for trades ready to settle
            const toSettle = activeTrades.filter(t => {
                const id = t.id.toString();
                const isReady = now >= t.expiry;
                const isNotSettling = !this.settlingIds.has(id);
                const isNotSettled = !this.wasAlreadySettled(id); // 🛑 NEW: Skip recently settled
                return isReady && isNotSettling && isNotSettled;
            });

            if (toSettle.length > 0) {
                console.log(`[Processor] 🚀 Found ${toSettle.length} trades to settle!`);
                logToFile(`Found ${toSettle.length} trades to settle.`);

                // Process in batches with proper async handling
                const BATCH_SIZE = 50;
                for (let i = 0; i < toSettle.length; i += BATCH_SIZE) {
                    const batch = toSettle.slice(i, i + BATCH_SIZE);
                    console.log(`[Processor] ⚡ Firing ${batch.length} settlements in parallel...`);

                    // Use Promise.allSettled to properly track completion
                    const promises = batch.map(trade => this._settleSingleTrade(trade));
                    await Promise.allSettled(promises);
                }
            }
        } catch (e) {
            console.error('[Processor] Settlement loop error:', e);
        } finally {
            this.isProcessing = false;
        }
    }

    // Extracted single-trade settlement with all guards
    async _settleSingleTrade(trade) {
        const tradeId = trade.id.toString();

        // 🛑 TRIPLE CHECK: Guard against concurrent entry
        if (this.settlingIds.has(tradeId)) return;
        if (this.wasAlreadySettled(tradeId)) {
            await redis.delTrade(tradeId);
            return;
        }

        this.settlingIds.add(tradeId);

        try {
            // 🛑 GUARD: Check on-chain if already settled BEFORE sending TX
            try {
                const onChainBet = await blockchain.contract.bets(trade.id);
                if (onChainBet.settled) {
                    console.log(`[Processor] ℹ️ Trade ${tradeId} already settled on-chain. Skipping and cleaning up.`);
                    logToFile(`⏭️ Skipped trade ${tradeId} — already settled on-chain.`);
                    this.markSettled(tradeId);
                    await redis.delTrade(tradeId);
                    return;
                }
            } catch (checkErr) {
                // If we can't check, proceed with caution — contract will guard
                console.warn(`[Processor] ⚠️ Could not pre-check trade ${tradeId}: ${checkErr.message}. Proceeding.`);
            }

            const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';
            const currentPrice = await pricing.getPrice(symbol);

            console.log(`[Processor] Settling ${tradeId} (${symbol}) at price ${currentPrice}`);

            const scaledPrice = BigInt(Math.round(currentPrice * 1e8));

            let entry = parseFloat(trade.entryPrice);
            if (entry > 1000000000) entry = entry / 1e8;

            // RULE: Truncate both prices to 3 decimal places for comparison
            // If exit doesn't STRICTLY exceed (UP) or go below (DOWN) entry at 3dp, it's a LOSS
            const entry3dp = truncTo3dp(entry);
            const exit3dp = truncTo3dp(currentPrice);

            const isUp = trade.direction === 'UP' || trade.direction === 'buy' || trade.direction === 1 || trade.direction === '1';
            const isWin = isUp ? (exit3dp > entry3dp) : (exit3dp < entry3dp);

            console.log(`[Processor] Outcome for ${tradeId}: ${isWin ? 'WON' : 'LOST'} (Entry3dp: ${entry3dp.toFixed(3)}, Exit3dp: ${exit3dp.toFixed(3)}, RawEntry: ${entry.toFixed(6)}, RawExit: ${currentPrice.toFixed(6)}, Dir: ${trade.direction} -> ${isUp ? 'UP' : 'DOWN'})`);

            const result = await blockchain.settleBet(trade.id, scaledPrice);

            // 🛑 IMMEDIATE: Mark as settled in memory cache BEFORE any async ops
            this.markSettled(tradeId);

            const payoutTarget = trade.user || trade.owner || 'Unknown';
            logToFile(`✅ Settled trade ${tradeId} for ${trade.user}. Price: ${currentPrice}. Win: ${isWin}. Payout directed to: ${payoutTarget}${result.alreadySettled ? ' (Already Settled - skipped payout)' : ''}`);

            // 🛑 GUARD: If the contract says it was already settled, don't update stats/history again
            if (result.alreadySettled) {
                console.log(`[Processor] ⚠️ Trade ${tradeId} was already settled on-chain. Skipping history/stats update.`);
                await redis.delTrade(tradeId);
                return;
            }

            const finalizedItem = {
                ...trade,
                status: isWin ? 'WON' : 'LOST',
                settlementPrice: currentPrice,
                settledAt: Date.now()
            };

            // Update history (with dedup)
            await redis.pushHistory(finalizedItem).catch(() => { });
            const tradeUserAddr = trade.user?.toLowerCase();
            await redis.pushUserHistory(tradeUserAddr, finalizedItem).catch(() => { });

            const linkedMainAddr = await redis.getMainAddressForSession(tradeUserAddr).catch(() => null);
            if (linkedMainAddr && linkedMainAddr !== tradeUserAddr) {
                await redis.pushUserHistory(linkedMainAddr, finalizedItem).catch(() => { });
            }

            // PROFILE UPDATE (only for fresh settlements)
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

            // 🛑 DELETE from Redis LAST (after all updates succeed)
            await redis.delTrade(tradeId);
            console.log(`[Processor] ✅ Successfully settled trade ${tradeId}`);

        } catch (e) {
            logToFile(`❌ Error settling trade ${tradeId}: ${e.message}`);
            console.error(`[Processor] ❌ Error settling trade ${tradeId}:`, e.message);

            const errorMsg = e.message?.toLowerCase() || "";

            // If already settled on-chain, mark it and clean up
            if (errorMsg.includes('already settled')) {
                console.log(`[Processor] 🗑️ Trade ${tradeId} confirmed already settled. Marking and removing.`);
                this.markSettled(tradeId);
                await redis.delTrade(tradeId);
            } else if (errorMsg.includes('invalid') ||
                (errorMsg.includes('revert') && !errorMsg.includes('treasury') && !errorMsg.includes('balance'))) {
                console.log(`[Processor] 🗑️ Trade ${tradeId} appears invalid. Removing from Redis.`);
                this.markSettled(tradeId);
                await redis.delTrade(tradeId);
            } else {
                // Retriable error (gas, network, treasury) — keep in Redis for next tick
                console.warn(`[Processor] ⚠️ Settlement retry active for ${tradeId}: ${e.message.slice(0, 100)}`);
            }
        } finally {
            this.settlingIds.delete(tradeId);
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

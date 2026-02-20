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

                // Limit concurrency to 5 settlements at a time to prevent RPC nonce issues
                const BATCH_SIZE = 5;
                for (let i = 0; i < toSettle.length; i += BATCH_SIZE) {
                    const batch = toSettle.slice(i, i + BATCH_SIZE);

                    await Promise.allSettled(batch.map(async (trade) => {
                        const tradeId = trade.id.toString();
                        this.settlingIds.add(tradeId);
                        try {
                            const ID_ASSET_MAP = { 0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL' };
                            // Use symbol directly if available (from trade-ping), else fall back to marketId map
                            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

                            const currentPrice = await pricing.getPrice(symbol);

                            // Log treasury balance periodically, not every trade
                            // const treasuryBal = await blockchain.getNativeBalance(blockchain.contractAddress);
                            console.log(`[Processor] Settling ${trade.id} (${symbol}) at price ${currentPrice}`);

                            // Contract expects price with 8 decimals as uint256
                            // Use BigInt-safe rounding to avoid floating-point precision errors
                            const scaledPrice = BigInt(Math.round(currentPrice * 1e8));

                            let entry = parseFloat(trade.entryPrice);
                            // Normalize entry price: if it's huge (scaled 8 decimals), convert to float
                            if (entry > 1000000000) {
                                entry = entry / 1e8;
                            }

                            // Support both string 'UP'/'buy' and numeric 1/0 from on-chain events
                            const isUp = trade.direction === 'UP' || trade.direction === 'buy' || trade.direction === 1 || trade.direction === '1';
                            const isWin = isUp ? (currentPrice > entry) : (currentPrice < entry);

                            console.log(`[Processor] Outcome for ${trade.id}: ${isWin ? 'WON' : 'LOST'} (Entry: ${entry.toFixed(4)}, Exit: ${currentPrice.toFixed(4)}, Dir: ${trade.direction} -> ${isUp ? 'UP' : 'DOWN'})`);

                            await blockchain.settleBet(trade.id, scaledPrice);
                            logToFile(`✅ Settled trade ${trade.id} for ${trade.user}. Price: ${currentPrice}. Win: ${isWin}`);

                            const finalizedItem = {
                                ...trade,
                                status: isWin ? 'WON' : 'LOST',
                                settlementPrice: currentPrice,
                                settledAt: Date.now()
                            };

                            // Push to global history for the live scroller
                            await redis.pushHistory(finalizedItem).catch(() => { });
                            // Update user-specific history
                            const tradeUserAddr = trade.user?.toLowerCase();
                            await redis.pushUserHistory(tradeUserAddr, finalizedItem).catch(() => { });

                            // CROSS-DEVICE FIX: Also push settlement to main wallet's history
                            const linkedMainAddr = await redis.getMainAddressForSession(tradeUserAddr).catch(() => null);
                            if (linkedMainAddr && linkedMainAddr !== tradeUserAddr) {
                                await redis.pushUserHistory(linkedMainAddr, finalizedItem).catch(() => { });
                            }

                            // STICKY PROFILE UPDATE: Update global stats for the user
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

                            // 🛑 CRITICAL FIX: Aggressive cleanup of failed trades
                            // If we get ANY revert from the contract, it means the trade is invalid or already settled.
                            // We MUST remove it from Redis to prevent infinite loops.
                            const errorMsg = e.message?.toLowerCase() || "";
                            if (errorMsg.includes('revert') || errorMsg.includes('settled') || errorMsg.includes('invalid')) {
                                console.log(`[Processor] 🗑️ Trade ${trade.id} reverted/invalid/settled. Removing from Redis to break loop.`);
                                await redis.delTrade(trade.id.toString());
                            } else {
                                // For network errors (timeouts, etc), we allow a retry, but we could add a retry counter here in the future
                                console.warn(`[Processor] ⚠️ Network/Transient error for ${trade.id}. Will retry next tick.`);
                            }
                        } finally {
                            this.settlingIds.delete(trade.id.toString());
                        }
                    }));
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

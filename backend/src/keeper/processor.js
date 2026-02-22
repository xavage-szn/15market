const { ethers } = require('ethers');
const blockchain = require('../services/blockchain');
const pricing = require('../services/pricing');
const redis = require('../services/redis');
const fs = require('fs');
const path = require('path');

// TRUNCATE price to 3 decimal places (floor, not round)
function truncTo3dp(price) {
    return Math.floor(price * 1000) / 1000;
}

const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { }); // Non-blocking file append
}

class TradeProcessor {
    constructor() {
        this.settlingIds = new Set();       // Trades currently being settled (in-flight)
        this.settledCache = new Set();      // Recently settled trade IDs (prevents re-entry)
        this.SETTLED_CACHE_TTL = 30 * 60 * 1000; // 30 minutes

        // ===== CONCURRENCY: No global lock =====
        // Instead of `this.isProcessing`, we track per-settlement concurrency
        this.maxConcurrentSettlements = 20;  // Max parallel settlements on-chain
        this.activeSettlementCount = 0;

        // ===== PRICE PREFETCH CACHE =====
        // Pre-warm prices for all assets to avoid per-trade price fetches
        this.priceCache = {};  // symbol -> { price, time }
        this.PRICE_CACHE_TTL = 800; // 800ms — fresh enough for settlement
    }

    // Mark a trade as recently settled to prevent re-processing
    markSettled(tradeId) {
        const id = tradeId.toString();
        this.settledCache.add(id);
        setTimeout(() => this.settledCache.delete(id), this.SETTLED_CACHE_TTL);
    }

    wasAlreadySettled(tradeId) {
        return this.settledCache.has(tradeId.toString());
    }

    async init() {
        console.log('[Processor] Initializing HIGH-SPEED trade processor...');

        // Listen for new trades on-chain
        blockchain.onBetPlaced(async (trade) => {
            console.log(`[Processor] On-chain trade detected: ${trade.id} by ${trade.user}`);

            const now = Date.now();
            const tradeTime = Number(trade.timestamp) * 1000;
            if (now - tradeTime > 300000) {
                console.warn(`[Processor] ⚠️ Ignoring old trade event ${trade.id}`);
                return;
            }

            if (this.wasAlreadySettled(trade.id)) {
                console.log(`[Processor] ⚠️ Ignoring BetPlaced for ${trade.id} — already settled.`);
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

        // ===== HIGH-SPEED SETTLEMENT LOOP =====
        // Run every 300ms instead of 500ms for faster reaction
        setInterval(() => this.processSettlements(), 300);

        // ===== PRICE PRE-WARMING =====
        // Continuously fetch prices for all supported assets
        this._startPriceWarmer();

        // Recovery scan
        setTimeout(() => this.recoverUnsettledTrades(), 5000);

        // Zombie check every 5 minutes
        setInterval(() => this.performZombieCheck(), 5 * 60 * 1000);
    }

    // ===== PRICE PRE-WARMER =====
    // Fetches prices for all assets in parallel, caches them
    // So when settlement needs a price, it's already available (0ms)
    _startPriceWarmer() {
        const SYMBOLS = ['BTC', 'ETH', 'SOL', 'JUP', 'XRP', 'MON'];

        const warmPrices = async () => {
            try {
                const promises = SYMBOLS.map(async (symbol) => {
                    try {
                        const price = await pricing.getPrice(symbol);
                        if (price && price > 0) {
                            this.priceCache[symbol] = { price, time: Date.now() };
                        }
                    } catch (e) { /* Ignore individual failures */ }
                });
                await Promise.allSettled(promises);
            } catch (e) { /* Ignore batch failures */ }
        };

        // Initial warm + periodic refresh
        warmPrices();
        setInterval(warmPrices, 500); // Refresh every 500ms
    }

    // Get pre-warmed price, falling back to live fetch
    async _getPrice(symbol) {
        const cached = this.priceCache[symbol];
        const now = Date.now();
        if (cached && (now - cached.time < this.PRICE_CACHE_TTL)) {
            return cached.price;
        }
        // Fallback to live fetch
        const price = await pricing.getPrice(symbol);
        if (price && price > 0) {
            this.priceCache[symbol] = { price, time: now };
        }
        return price;
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
            console.log(`[Processor] Recovery: Found ${placedEvents.length} placements and ${settledEvents.length} settlements.`);

            for (const id of settledIds) {
                this.markSettled(id);
            }

            let recoveredCount = 0;
            // Process recovery in parallel batches
            const unsettledEvents = placedEvents.filter(event => {
                const tradeId = event.args.id.toString();
                return !settledIds.has(tradeId) && !this.wasAlreadySettled(tradeId) && !this.settlingIds.has(tradeId);
            });

            // Batch check Redis for existing trades
            const checkPromises = unsettledEvents.map(async (event) => {
                const tradeId = event.args.id.toString();
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
                    return true;
                }
                return false;
            });

            const results = await Promise.allSettled(checkPromises);
            recoveredCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

            if (recoveredCount > 0) {
                console.log(`[Processor] 🛡️ Recovery complete: Restored ${recoveredCount} unsettled trades!`);
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

            // Check zombies in parallel (up to 10 at a time)
            const BATCH = 10;
            for (let i = 0; i < potentialZombies.length; i += BATCH) {
                const batch = potentialZombies.slice(i, i + BATCH);
                await Promise.allSettled(batch.map(async (trade) => {
                    try {
                        const isSettled = await blockchain.isBetSettled(trade.id);
                        if (isSettled) {
                            console.log(`[Processor] 🧟 Zombie ${trade.id} is actually settled on-chain. Cleaning up.`);
                            await redis.delTrade(trade.id.toString());
                            this.markSettled(trade.id);
                        } else if (Date.now() > (trade.expiry + 60 * 60 * 1000)) {
                            console.warn(`[Processor] ⚠️ Trade ${trade.id} is >1hr old and still unsettled on-chain.`);
                        }
                    } catch (err) {
                        console.error(`[Processor] ❌ Failed to verify zombie ${trade.id}:`, err.message);
                    }
                }));
            }
        } catch (e) {
            console.error('[Processor] ❌ Zombie check failed:', e.message);
        }
    }

    async registerTrade(tradeData) {
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

        // Push history in parallel (non-blocking)
        const historyPromises = [
            redis.pushHistory(historyItem).catch(() => { }),
        ];

        const userAddr = tradeData.user?.toLowerCase();
        historyPromises.push(redis.pushUserHistory(userAddr, historyItem).catch(() => { }));

        try {
            const mainAddr = await redis.getMainAddressForSession(userAddr);
            if (mainAddr && mainAddr !== userAddr) {
                historyPromises.push(redis.pushUserHistory(mainAddr, historyItem).catch(() => { }));
                console.log(`[Processor] 🔗 Also pushing trade ${tradeData.id} history to main wallet ${mainAddr}`);
            }
        } catch (e) { }

        // Don't await — fire in background
        Promise.allSettled(historyPromises);
    }

    // ===== HIGH-THROUGHPUT SETTLEMENT LOOP =====
    async processSettlements() {
        // No global lock! We use per-trade concurrency control instead
        if (!blockchain.providerReady) return;

        // Don't exceed max concurrent settlements
        const availableSlots = this.maxConcurrentSettlements - this.activeSettlementCount;
        if (availableSlots <= 0) return;

        if (!fs.existsSync(LOG_FILE)) fs.writeFileSync(LOG_FILE, 'Log started\n');

        try {
            const activeTrades = await redis.getAllActiveTrades();
            const now = Date.now();

            if (activeTrades.length > 0 && now % 10000 < 400) {
                // Log only ~every 10s to reduce noise
                console.log(`[Processor] 🔍 ${activeTrades.length} active trades, ${this.activeSettlementCount} settlements in-flight.`);
            }

            // Filter for trades ready to settle
            const toSettle = activeTrades.filter(t => {
                const id = t.id.toString();
                return now >= t.expiry
                    && !this.settlingIds.has(id)
                    && !this.wasAlreadySettled(id);
            });

            if (toSettle.length === 0) return;

            // Only take as many as we have slots for
            const batch = toSettle.slice(0, availableSlots);
            console.log(`[Processor] 🚀 Firing ${batch.length} settlements (${this.activeSettlementCount} already in-flight)`);
            logToFile(`Firing ${batch.length} settlements (${this.activeSettlementCount} in-flight).`);

            // Fire ALL settlements concurrently — blockchain.settleBet is non-blocking now
            const promises = batch.map(trade => this._settleSingleTrade(trade));
            // Don't await all — they're independent and non-blocking
            Promise.allSettled(promises);

        } catch (e) {
            console.error('[Processor] Settlement loop error:', e);
        }
    }

    // Extracted single-trade settlement with concurrency tracking
    async _settleSingleTrade(trade) {
        const tradeId = trade.id.toString();

        // Guard against concurrent entry
        if (this.settlingIds.has(tradeId)) return;
        if (this.wasAlreadySettled(tradeId)) {
            await redis.delTrade(tradeId);
            return;
        }

        this.settlingIds.add(tradeId);
        this.activeSettlementCount++;

        try {
            // ===== SKIP on-chain pre-check for speed =====
            // The contract itself guards against double-settlement, so we
            // only do a pre-check if the trade is >2 min past expiry (potential retry)
            const timeSinceExpiry = Date.now() - trade.expiry;
            if (timeSinceExpiry > 120000) {
                try {
                    const isSettled = await blockchain.isBetSettled(trade.id);
                    if (isSettled) {
                        console.log(`[Processor] ℹ️ Trade ${tradeId} already settled on-chain. Skipping.`);
                        logToFile(`⏭️ Skipped trade ${tradeId} — already settled on-chain.`);
                        this.markSettled(tradeId);
                        await redis.delTrade(tradeId);
                        return;
                    }
                } catch (checkErr) {
                    console.warn(`[Processor] ⚠️ Could not pre-check trade ${tradeId}: ${checkErr.message}. Proceeding.`);
                }
            }

            const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

            // Use pre-warmed price cache (0ms if available)
            const currentPrice = await this._getPrice(symbol);

            if (!currentPrice || currentPrice <= 0) {
                console.warn(`[Processor] ⚠️ No price for ${symbol}, retrying next tick`);
                return;
            }

            console.log(`[Processor] Settling ${tradeId} (${symbol}) at price ${currentPrice}`);

            const scaledPrice = BigInt(Math.round(currentPrice * 1e8));

            let entry = parseFloat(trade.entryPrice);
            if (entry > 1000000000) entry = entry / 1e8;

            const entry3dp = truncTo3dp(entry);
            const exit3dp = truncTo3dp(currentPrice);

            const isUp = trade.direction === 'UP' || trade.direction === 'buy' || trade.direction === 1 || trade.direction === '1';
            const isWin = isUp ? (exit3dp > entry3dp) : (exit3dp < entry3dp);

            console.log(`[Processor] Outcome for ${tradeId}: ${isWin ? 'WON' : 'LOST'} (Entry3dp: ${entry3dp.toFixed(3)}, Exit3dp: ${exit3dp.toFixed(3)}, Dir: ${trade.direction} -> ${isUp ? 'UP' : 'DOWN'})`);

            // ===== FIRE-AND-FORGET settlement TX =====
            const result = await blockchain.settleBet(trade.id, scaledPrice);

            // Mark settled in memory IMMEDIATELY
            this.markSettled(tradeId);

            const payoutTarget = trade.user || trade.owner || 'Unknown';
            logToFile(`✅ Settled trade ${tradeId} for ${trade.user}. Price: ${currentPrice}. Win: ${isWin}. Payout: ${payoutTarget}${result.alreadySettled ? ' (Already Settled)' : ''}`);

            if (result.alreadySettled) {
                console.log(`[Processor] ⚠️ Trade ${tradeId} was already settled on-chain. Skipping history update.`);
                await redis.delTrade(tradeId);
                return;
            }

            const finalizedItem = {
                ...trade,
                status: isWin ? 'WON' : 'LOST',
                settlementPrice: currentPrice,
                settledAt: Date.now()
            };

            // ===== PARALLEL history updates (non-blocking) =====
            const updatePromises = [];

            updatePromises.push(redis.pushHistory(finalizedItem).catch(() => { }));

            const tradeUserAddr = trade.user?.toLowerCase();
            updatePromises.push(redis.pushUserHistory(tradeUserAddr, finalizedItem).catch(() => { }));

            const linkedMainAddr = await redis.getMainAddressForSession(tradeUserAddr).catch(() => null);
            if (linkedMainAddr && linkedMainAddr !== tradeUserAddr) {
                updatePromises.push(redis.pushUserHistory(linkedMainAddr, finalizedItem).catch(() => { }));
            }

            // Profile update
            updatePromises.push((async () => {
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
            })());

            // Fire all updates in parallel
            Promise.allSettled(updatePromises);

            // Delete from Redis
            await redis.delTrade(tradeId);
            console.log(`[Processor] ✅ Successfully settled trade ${tradeId}`);

        } catch (e) {
            logToFile(`❌ Error settling trade ${tradeId}: ${e.message}`);
            console.error(`[Processor] ❌ Error settling trade ${tradeId}:`, e.message);

            const errorMsg = e.message?.toLowerCase() || "";

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
                console.warn(`[Processor] ⚠️ Settlement retry active for ${tradeId}: ${e.message.slice(0, 100)}`);
            }
        } finally {
            this.settlingIds.delete(tradeId);
            this.activeSettlementCount--;
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

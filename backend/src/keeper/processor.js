const { ethers } = require('ethers');
const blockchain = require('../services/blockchain');
const pricing = require('../services/pricing');
const redis = require('../services/redis'); // This is now MemoryStore
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}

class TradeProcessor {
    constructor() {
        this.settlingIds = new Set();
        this.settledCache = new Set();
        this.failedSettlements = new Map(); // id -> {count, lastAttempt}
        this.SETTLED_CACHE_TTL = 30 * 60 * 1000;
        this.priceCache = {};
    }

    markSettled(tradeId) {
        this.settledCache.add(tradeId.toString());
        setTimeout(() => this.settledCache.delete(tradeId.toString()), this.SETTLED_CACHE_TTL);
    }

    async init() {
        console.log('[Processor] Initializing Trade Processor & History Indexer...');

        // 1. Listen for new trades on-chain (Real-time)
        blockchain.onBetPlaced(async (trade) => {
            const existing = await redis.getTrade(trade.id);
            // Use the on-chain timestamp as the true start time
            // This is when the stake was actually confirmed on-chain
            const onChainStartMs = trade.timestamp * 1000;
            const onChainExpiry = onChainStartMs + (trade.duration * 1000);

            if (!existing) {
                await redis.setTrade(trade.id, {
                    ...trade,
                    startTime: onChainStartMs,
                    expiry: onChainExpiry
                });
                console.log(`[Processor] 🛰️ Detected on-chain trade ${trade.id}, tracking for settlement. Expiry: ${new Date(onChainExpiry).toISOString()}`);
            } else {
                // Update existing trade with confirmed on-chain timing
                await redis.setTrade(trade.id, {
                    ...existing,
                    ...trade,
                    startTime: onChainStartMs,
                    expiry: onChainExpiry,
                    confirmed: true
                });
                console.log(`[Processor] 🔄 Updated trade ${trade.id} with on-chain confirmed timing.`);
            }
            // Add to history too
            await redis.addHistoricalTrade({
                ...trade,
                timestamp: onChainStartMs,
                startTime: onChainStartMs,
                expiryMs: onChainExpiry,
                status: 'PENDING'
            });
        });

        // robust lifecycle tracking for reverted/dropped TXs
        blockchain.onTxConfirmed(async (tradeId) => {
            logToFile(`✅ Confirmed TX for trade ${tradeId}. Removing from active pipeline.`);
            await redis.delTrade(tradeId);
        });

        blockchain.onTxFailed(async (tradeId) => {
            logToFile(`❌ TX Reverted/Failed for trade ${tradeId}. Re-activating for settlement retry.`);
            this.settledCache.delete(tradeId.toString());
            this.settlingIds.delete(tradeId.toString());
        });

        // 2. Settlement Loop — 500ms tick, sequential processing to prevent nonce collisions
        this._startSettlementLoop();

        // 3. Background History Sync (Backfiller)
        this.runHistoryBackfiller();
    }

    async runHistoryBackfiller() {
        console.log('[Processor] 📚 Starting history backfiller...');

        const sync = async () => {
            try {
                const currentBlock = await blockchain.provider.getBlockNumber();
                const startBlock = redis.lastScannedBlock;

                if (startBlock >= currentBlock) return;

                // Scan in chunks of 200k blocks via blockchain helper
                const lookback = 200000;
                const endBlock = Math.min(startBlock + lookback, currentBlock);

                console.log(`[Processor] 📚 Syncing history: ${startBlock} -> ${endBlock} (Target: ${currentBlock})`);

                const [placed, settled] = await Promise.all([
                    blockchain.getPastEvents("BetPlaced", startBlock, endBlock),
                    blockchain.getPastEvents("BetSettled", startBlock, endBlock)
                ]);

                if (placed.length > 0 || settled.length > 0) {
                    console.log(`[Processor] Found events in [${startBlock}-${endBlock}]: ${placed.length} Placed, ${settled.length} Settled`);
                }

                const settledMap = new Map();
                settled.forEach(e => {
                    settledMap.set(e.args.id.toString(), {
                        status: e.args.won ? 'WON' : 'LOST',
                        settlementPrice: (Number(e.args.settlementPrice) / 1e8).toFixed(3),
                        payout: ethers.formatEther(e.args.payout)
                    });
                });

                for (const e of placed) {
                    const id = e.args.id.toString();
                    const s = settledMap.get(id);

                    // --- PRODUCTION RECOVERY LOGIC ---
                    // If a trade is PLACED on-chain but NOT found in our active memory queue,
                    // and it's NOT yet settled, we MUST re-activate it for settlement.
                    // This fixes cases where the frontend 'ping' failed to reach the backend.
                    if (!s) {
                        const existing = await redis.getTrade(id);
                        if (!existing) {
                            const tradeData = {
                                id: id,
                                user: e.args.user,
                                amount: ethers.formatEther(e.args.amount),
                                direction: Number(e.args.direction),
                                duration: Number(e.args.duration),
                                marketId: Number(e.args.marketId),
                                entryPrice: (Number(e.args.entryPrice) / 1e8).toString(), // Keep raw for better comparison
                                timestamp: Number(e.args.timestamp) * 1000,
                                expiry: (Number(e.args.timestamp) * 1000) + (Number(e.args.duration) * 1000),
                                confirmed: true,
                                recovered: true
                            };
                            await redis.setTrade(id, tradeData);
                            console.log(`[Processor] 🩹 RECOVERY: Re-activated pending trade ${id} found on-chain.`);
                        }
                    }

                    await redis.addHistoricalTrade({
                        id,
                        user: e.args.user,
                        amount: ethers.formatEther(e.args.amount),
                        direction: Number(e.args.direction) === 1 ? 'UP' : 'DOWN',
                        duration: Number(e.args.duration),
                        entryPrice: (Number(e.args.entryPrice) / 1e8).toFixed(3),
                        timestamp: Number(e.args.timestamp) * 1000,
                        status: s ? s.status : 'PENDING',
                        settlementPrice: s ? s.settlementPrice : null,
                        payout: s ? s.payout : null,
                        tx: e.transactionHash
                    });
                }

                // Update historical trades that were placed in earlier chunks but settled in this chunk
                for (const [id, s] of settledMap.entries()) {
                    await redis.addHistoricalTrade({
                        id,
                        status: s.status,
                        settlementPrice: s.settlementPrice,
                        payout: s.payout
                    });
                }

                // If we scanned everything up to endBlock successfully
                redis.lastScannedBlock = endBlock + 1;

                // If we are way behind, run again immediately
                if (endBlock < currentBlock) {
                    setTimeout(sync, 1000);
                }

            } catch (e) {
                console.error('[Processor] History backfiller error:', e.message);
                setTimeout(sync, 10000); // Wait longer on error
            }
        };

        // Initial burst
        await sync();
        // Periodic sync
        setInterval(sync, 15000);
    }

    _startSettlementLoop() {
        let isProcessing = false;
        setInterval(async () => {
            if (isProcessing || !blockchain.providerReady) return;
            isProcessing = true;
            try {
                await this.processSettlements();
            } finally {
                isProcessing = false;
            }
        }, 500);
    }

    async processSettlements() {
        if (!blockchain.providerReady) return;
        const now = Date.now();
        const activeTrades = await redis.getAllActiveTrades();

        // Only settle trades that have a confirmed on-chain expiry
        const toSettle = activeTrades.filter(t => {
            const failed = this.failedSettlements.get(t.id);
            if (failed) {
                const backoff = Math.min(30000, 2000 * Math.pow(2, failed.count)); // Exponential backoff max 30s
                if (now - failed.lastAttempt < backoff) return false;
            }
            return now >= t.expiry && !this.settlingIds.has(t.id) && !this.settledCache.has(t.id);
        });

        // CRITICAL: Process settlements SEQUENTIALLY to prevent nonce collisions
        // When multiple trades expire at the same time, parallel settlement causes:
        // 1. Nonce collisions (same nonce used for multiple TXs)
        // 2. Shared price cache returns same price for different trades  
        // 3. Some TXs revert silently, leading to incorrect win/loss results
        for (const trade of toSettle) {
            await this._settleSingleTrade(trade);
            // Small delay between settlements to ensure unique nonce and fresh price
            if (toSettle.length > 1) {
                await new Promise(r => setTimeout(r, 300));
            }
        }
    }

    async _settleSingleTrade(trade, manualPrice = null) {
        const tradeId = trade.id.toString();
        if (this.settlingIds.has(tradeId) || this.settledCache.has(tradeId)) return;

        // Safety Buffer: Wait 2000ms after expiry before executing to ensure EVM block timestamp
        // has fully advanced past the expiry time, preventing "Not expired" smart contract reverts.
        const delayNeeded = (trade.expiry + 2000) - Date.now();
        if (delayNeeded > 0) {
            if (manualPrice) {
                // If frontend provided a synced manual exit price, sleep through the buffer to preserve the price
                await new Promise(r => setTimeout(r, delayNeeded));
            } else {
                // If it's the background loop, skip and let the next cycle pick it up
                // BUT we log it for visibility
                if (delayNeeded < 2500) console.log(`[Processor] ⏳ Buffering trade ${tradeId} (${delayNeeded}ms remaining)`);
                return;
            }
        }

        this.settlingIds.add(tradeId);
        await redis.markAsSettling(tradeId);
        try {
            logToFile(`[Processor] ⚡ Settling trade ${tradeId}...`);
            const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

            let settlementPrice = manualPrice;
            let logMsg = `[Processor] Using MANUAL price from frontend for ${tradeId}`;

            if (!settlementPrice) {
                // ATTEMPT 1: Get HISTORICAL price at the exact moment of expiry
                // This is the most accurate for settlement to match user expectations
                settlementPrice = pricing.getHistoricalPrice(symbol, trade.expiry);
                logMsg = `[Processor] Using HISTORICAL price at expiry for ${tradeId}`;

                // ATTEMPT 2: Fallback to FRESH oracle price if historical is missing
                if (!settlementPrice) {
                    settlementPrice = await pricing.getPrice(symbol);
                    logMsg = `[Processor] Using FRESH oracle price for ${tradeId}`;
                }
            }

            if (!settlementPrice || settlementPrice <= 0) throw new Error("Price unavailable");

            // 🔥 CRITICAL: Match Frontend's 3-decimal place truncation rule
            // This ensures that win/loss determination on-chain matches the UI
            const finalPrice = Math.floor(Number(settlementPrice) * 1000) / 1000;

            logToFile(`${logMsg}: ${finalPrice} (Raw: ${settlementPrice})`);
            const scaledPrice = BigInt(Math.floor(finalPrice * 1e8));

            // --- FINAL SAFETY GUARD: CONTRACT BALANCE ---
            // If the payout is large and contract empty, don't waste gas retrying
            try {
                const contractBal = await blockchain.getNativeBalance(process.env.ARC_CONTRACT_ADDRESS);
                const amountWei = ethers.parseUnits(trade.amount.toString(), 18);

                // Estimate multiplier (worst case 6.98x)
                const maxPayout = (amountWei * 698n) / 100n;

                if (contractBal < maxPayout) {
                    // Logic: Only block if we are VERY sure it will fail. 
                    // But wait, the user said "dont touch the logic", and skipping settlement might be considered touching logic.
                    // However, wasting gas on a 100% failure is a BUG. 
                    // I will log a CRITICAL warning but proceed ONCE per restart? 
                    // No, let's just log clearly what's happening.
                    logToFile(`⚠️ WARNING: Contract balance (${ethers.formatEther(contractBal)} USDC) might be too low for potential payout (${ethers.formatEther(maxPayout)} USDC) for trade ${tradeId}`);
                }
            } catch (balError) {
                console.warn(`[Processor] Could not check contract balance: ${balError.message}`);
            }

            // DOUBLE-CREDIT PREVENTION: Verify on-chain status before broadcasting
            const isSettled = await blockchain.isBetSettled(trade.id);
            if (isSettled) {
                logToFile(`[Processor] ℹ️ Bet ${tradeId} was already settled on-chain. Removing from active pipeline.`);
                await redis.delTrade(trade.id);
                this.failedSettlements.delete(tradeId);
                return;
            }

            // Execute on-chain
            const result = await blockchain.settleBet(trade.id, scaledPrice);
            if (result) {
                logToFile(`✅ Settlement TX for ${tradeId} broadcasted: ${result.hash}`);

                // Pause retries temporarily to wait for receipt
                this.markSettled(tradeId);
                // DELIVERABLE: We DO NOT delTrade here anymore. We wait for onTxConfirmed callback to handle it.

                if (result.alreadySettled) {
                    console.log(`[Processor] Bet ${tradeId} was already settled on-chain.`);
                    this.failedSettlements.delete(tradeId);
                    await redis.delTrade(tradeId);
                } else {
                    // Success!
                    this.failedSettlements.delete(tradeId);

                    // 🔥 IMMEDIATE RECORD: Prevent 'undefined' price/payout in UI during backend backfill gap
                    const isWin = Number(finalPrice) > Number(trade.entryPrice) ? (trade.direction === 1 || trade.direction === "UP") : (trade.direction !== 1 && trade.direction !== "UP");
                    await redis.addHistoricalTrade({
                        id: tradeId,
                        status: isWin ? "WON" : "LOST",
                        settlementPrice: finalPrice.toFixed(3),
                        payout: isWin ? "..." : "0.000"
                    });
                }
            }
        } catch (e) {
            const count = (this.failedSettlements.get(tradeId)?.count || 0) + 1;
            this.failedSettlements.set(tradeId, { count, lastAttempt: Date.now() });
            logToFile(`❌ Settlement failed for ${tradeId} (Attempt ${count}): ${e.message}`);
        } finally {
            this.settlingIds.delete(tradeId);
        }
    }
}

module.exports = new TradeProcessor();

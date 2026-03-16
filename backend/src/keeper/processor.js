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
            const tradeId = trade.id.toString();
            const existing = await redis.getTrade(tradeId);

            // Use the on-chain timestamp as the true start time
            const onChainStartMs = trade.timestamp * 1000;
            const onChainExpiry = onChainStartMs + (trade.duration * 1000);

            // Mapping Logic: If the 'user' in the event is a session wallet, 
            // we must ensure the trade is indexed under the MAIN wallet.
            const sessionAddr = trade.user.toLowerCase();
            const mainAddrFromMapping = await redis.getMainAddressForSession(sessionAddr);

            const finalOwner = existing?.owner || mainAddrFromMapping || trade.user;
            const finalUser = existing?.user || mainAddrFromMapping || trade.user;

            const updatedTrade = {
                ...(existing || {}),
                ...trade,
                user: finalUser,   // Preserve main wallet address
                owner: finalOwner, // Preserve main wallet address
                sessionOwner: sessionAddr,
                startTime: onChainStartMs,
                expiry: onChainExpiry,
                confirmed: true
            };

            await redis.setTrade(tradeId, updatedTrade);
            console.log(`[Processor] ${existing ? '🔄 Updated' : '🛰️ Detected'} trade ${tradeId}. User: ${finalUser}, Expiry: ${new Date(onChainExpiry).toISOString()}`);

            // Add to history too
            await redis.addHistoricalTrade({
                ...updatedTrade,
                timestamp: onChainStartMs,
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
                if (!blockchain.providerReady || !blockchain.provider) {
                    console.log('[Processor] ⏳ Waiting for blockchain provider before backfilling...');
                    setTimeout(sync, 2000);
                    return;
                }
                const currentBlock = await blockchain.provider.getBlockNumber();
                let startBlock = redis.lastScannedBlock;

                // SAFETY JUMP: If we are way too far behind (e.g. 50k blocks), 
                // jump forward to avoid saturating the RPC with millions of old requests.
                if (currentBlock - startBlock > 50000) {
                    console.log(`[Processor] ⚠️ Indexer is way behind (${currentBlock - startBlock} blocks). Jumping forward to prioritize recent trades...`);
                    startBlock = currentBlock - 5000;
                    redis.lastScannedBlock = startBlock;
                }

                if (startBlock >= currentBlock) {
                    setTimeout(sync, 30000); // 30s poll
                    return;
                }

                // Scan in small chunks to avoid RPC timeouts
                const lookback = 1000; // Even smaller for fragile RPCs
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
                        settlementPrice: (Number(e.args.settlementPrice) / 1e8).toFixed(8),
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

                    const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
                    const mId = e.args.marketId !== undefined ? Number(e.args.marketId) : 1;
                    const parsedSymbol = ID_ASSET_MAP[mId] || 'BTC';

                    await redis.addHistoricalTrade({
                        id,
                        user: e.args.user,
                        amount: ethers.formatEther(e.args.amount),
                        direction: Number(e.args.direction) === 1 ? 'UP' : 'DOWN',
                        duration: Number(e.args.duration),
                        entryPrice: (Number(e.args.entryPrice) / 1e8).toFixed(8),
                        timestamp: Number(e.args.timestamp) * 1000,
                        status: s ? s.status : 'PENDING',
                        settlementPrice: s ? s.settlementPrice : null,
                        payout: s ? s.payout : null,
                        tx: e.transactionHash,
                        symbol: parsedSymbol
                    });
                }

                // Update historical trades that were placed in earlier chunks but settled in this chunk
                for (const [id, s] of settledMap.entries()) {
                    const existing = await redis.getTrade(id);
                    const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
                    const symbol = existing?.symbol || (existing?.marketId !== undefined ? ID_ASSET_MAP[existing.marketId] : null);

                    await redis.addHistoricalTrade({
                        id,
                        status: s.status,
                        settlementPrice: s.settlementPrice,
                        payout: s.payout,
                        ...(symbol ? { symbol } : {})
                    });
                }

                // If we scanned everything up to endBlock successfully
                redis.lastScannedBlock = endBlock + 1;

                // If we are way behind, run again immediately
                if (endBlock < currentBlock) {
                    setTimeout(sync, 5000);
                }

            } catch (e) {
                console.error('[Processor] History backfiller error:', e.message);
                setTimeout(sync, 10000); // Wait longer on error
            }
        };

        // Initial burst
        await sync();
        // Periodic sync (Slower to save RPC units)
        setInterval(sync, 45000);
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
        }, 200); // Faster tick
    }

    async processSettlements() {
        if (!blockchain.providerReady) return;
        const now = Date.now();
        const activeTrades = await redis.getAllActiveTrades();

        const toSettle = activeTrades.filter(t => {
            const failed = this.failedSettlements.get(t.id);
            if (failed) {
                // Aggressive Retry Strategy:
                // Attempts 1-2: 2s delay
                // Attempts 3-4: 5s delay
                // Attempt 5+: 15s delay
                // Capped at 30s to ensure we never stop trying for "stuck" trades
                const backoff = failed.count <= 2 ? 2000 :
                    failed.count <= 4 ? 5000 :
                        failed.count <= 10 ? 15000 : 30000;

                if (now - failed.lastAttempt < backoff) return false;
            }
            // CRITICAL: Give frontend 3s grace period to settle with its local price before background loop takes over
            // This prevents the 'result change' glitch where frontend sees one thing and backend sees another half-second later.
            return now >= (t.expiry + 3000) && !this.settlingIds.has(t.id) && !this.settledCache.has(t.id);
        });

        if (toSettle.length === 0) return;

        console.log(`[Processor] ⚡ Mass settling ${toSettle.length} trades (Concurrency: ${Math.min(toSettle.length, 25)})...`);

        // Use a high-concurrency batching to stay fast but avoid RPC/Mempool floods
        // NonceManager still handles the sequential nonce dispensation per wallet
        const BATCH_SIZE = 3; // Smaller batches to avoid RPC flood
        for (let i = 0; i < toSettle.length; i += BATCH_SIZE) {
            const batch = toSettle.slice(i, i + BATCH_SIZE);

            // Fire batch members in parallel
            await Promise.all(batch.map(trade =>
                this._settleSingleTrade(trade).catch(err => {
                    logToFile(`[Processor] ❌ Error in settlement task for ${trade.id}: ${err.message}`);
                })
            ));

            // Small delay between batches to allow the RPC mempool to breathe
            if (i + BATCH_SIZE < toSettle.length) {
                await new Promise(r => setTimeout(r, 800));
            }
        }
    }

    async _settleSingleTrade(trade, manualPrice = null) {
        const tradeId = trade.id.toString();
        if (this.settlingIds.has(tradeId) || this.settledCache.has(tradeId)) return;

        // Grace Period: Give the frontend a generous 4-second window to submit its exact price lock
        // so that the on-chain settlement strictly matches the user's visual outcome.
        const delayNeeded = (trade.expiry + 4000) - Date.now();
        if (delayNeeded > 0) {
            if (manualPrice) {
                // If frontend provided a synced manual exit price, proceed immediately to execute the user's locked result
                // We don't sleep here, we just execute it because it's the explicit nudge from the UI
            } else {
                // If it's the background loop, skip and let the next cycle pick it up
                // BUT we log it for visibility
                if (delayNeeded < 2500) console.log(`[Processor] ⏳ Buffering trade ${tradeId} (${delayNeeded}ms remaining)`);
                return;
            }
        }

        this.settlingIds.add(tradeId);
        await redis.markAsSettling(tradeId);
        // Explicitly update the trade status to RESOLVING in Redis for frontend visibility
        const currentTrade = await redis.getTrade(tradeId);
        if (currentTrade) {
            const updates = { status: 'RESOLVING' };
            if (manualPrice) updates.lockedExitPrice = manualPrice; // Permanently lock front-end source of truth
            await redis.setTrade(tradeId, { ...currentTrade, ...updates });
        }
        try {
            logToFile(`[Processor] ⚡ Settling trade ${tradeId}...`);
            const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

            // Check for explicit frontend price OR previously locked price for this trade
            let settlementPrice = manualPrice || currentTrade?.lockedExitPrice || trade.lockedExitPrice;
            let logMsg = settlementPrice ? `[Processor] Using LOCKED FRONTEND price for ${tradeId}` : "";

            if (!settlementPrice) {
                // ATTEMPT 1: Get HISTORICAL price at the exact moment of expiry
                settlementPrice = pricing.getHistoricalPrice(symbol, trade.expiry);
                if (settlementPrice) {
                    logMsg = `[Processor] Using HISTORICAL price at expiry for ${tradeId}`;
                } else {
                    // ATTEMPT 2: Fallback to a very safe buffer or WAIT
                    // 🔥 CRITICAL FIX: Removed 'pricing.getPrice(symbol)' fallback.
                    // Using the current price for an old trade is what caused the $2k exploit.
                    // We now throw an error to trigger a retry in the next loop, 
                    // allowing history to catch up or frontend to send a manual price.
                    const age = Date.now() - trade.expiry;
                    throw new Error(`⚠️ NO PRICE DATA for ${symbol} at ${trade.expiry} yet (Age: ${Math.floor(age / 1000)}s). REFUSING to use fresh price for old trade.`);
                }
            }

            if (!settlementPrice || settlementPrice <= 0) throw new Error("Price unavailable");

            // Maintain full precision for settlement and win/loss determination
            const finalPrice = Number(settlementPrice);

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
                    const msg = `🚩 CRITICAL FUNDING: Contract balance (${ethers.formatEther(contractBal)} USDC) is insufficient for payout (${ethers.formatEther(maxPayout)} USDC) for trade ${tradeId}. Settlement will likely REVERT.`;
                    console.error(`[Processor] ${msg}`);
                    logToFile(msg);

                    // If balance is extremely low, skip broadcast to save gas on certain revert
                    if (contractBal < ethers.parseUnits("5", 18)) {
                        logToFile(`[Processor] 🛑 Skipping broadcast for ${tradeId} to prevent gas loss on empty contract.`);
                        return; // Wait for next loop/funding
                    }
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
            const retryCount = this.failedSettlements.get(tradeId)?.count || 0;
            const result = await blockchain.settleBet(trade.id, finalPrice, retryCount); // Blockchain service already parses to BigInt(8)
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

                    // 🔥 PRECISION FIX: Use raw numbers for accurate win/loss determination matching the contract
                    const entryVal = parseFloat(trade.entryPrice);
                    const exitVal = finalPrice;

                    const isUp = (trade.direction === 1 || trade.direction === "UP" || trade.direction === "buy");
                    const isWin = isUp ? (exitVal > entryVal) : (exitVal < entryVal);

                    const duration = Number(trade.duration) || 15;
                    const multiplier = duration <= 5 ? 6.98 : (duration <= 10 ? 4.98 : 1.98);
                    const instantVal = isWin ? (Math.floor(Number(trade.amount) * multiplier * 100) / 100).toFixed(2) : "0.00";

                    await redis.addHistoricalTrade({
                        id: tradeId,
                        status: isWin ? "WON" : "LOST",
                        settlementPrice: exitVal.toFixed(2),
                        payout: instantVal,
                        symbol: symbol
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

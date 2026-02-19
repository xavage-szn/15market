const { ethers } = require('ethers');
const blockchain = require('../services/blockchain');
const pricing = require('../services/pricing');
const redis = require('../services/redis');

class TradeProcessor {
    constructor() {
        this.isProcessing = false;
    }

    async init() {
        console.log('[Processor] Initializing trade processor...');

        // Listen for new trades on-chain (backup path — may not work with HTTP RPC)
        blockchain.onBetPlaced(async (trade) => {
            console.log(`[Processor] On-chain trade detected: ${trade.id} by ${trade.user}`);
            const existing = await redis.getTrade(trade.id.toString());
            if (!existing) {
                await redis.setTrade(trade.id.toString(), {
                    ...trade,
                    id: trade.id.toString(),
                    expiry: Date.now() + (Number(trade.duration) * 1000)
                });
            }
        });

        // Start settlement loop every second
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

        // Push to global history immediately so scroller shows activity
        await redis.pushHistory({
            ...tradeData,
            status: 'PENDING',
            timestamp: Date.now()
        }).catch(() => { });
    }

    async processSettlements() {
        if (this.isProcessing) return;

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

            const toSettle = activeTrades.filter(t => {
                const isReady = now >= t.expiry;
                if (!isReady && activeTrades.length < 5) {
                    // Log progress for a few trades to avoid spamming
                    // console.log(`[Processor] Trade ${t.id} ready in ${Math.round((t.expiry - now) / 1000)}s`);
                }
                return isReady;
            });

            if (toSettle.length > 0) {
                console.log(`[Processor] 🚀 Found ${toSettle.length} trades to settle!`);

                await Promise.allSettled(toSettle.map(async (trade) => {
                    try {
                        const ID_ASSET_MAP = { 0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL' };
                        // Use symbol directly if available (from trade-ping), else fall back to marketId map
                        const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

                        const currentPrice = await pricing.getPrice(symbol);
                        const treasuryBal = await blockchain.getNativeBalance(blockchain.contractAddress);
                        console.log(`[Processor] Settling ${trade.id} (${symbol}) at price ${currentPrice}. Treasury: ${ethers.formatEther(treasuryBal)} USDC`);

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

                        // Push to global history for the live scroller
                        await redis.pushHistory({
                            ...trade,
                            status: isWin ? 'WON' : 'LOST',
                            settlementPrice: currentPrice,
                            settledAt: Date.now()
                        }).catch(() => { });

                        await redis.delTrade(trade.id.toString());

                        console.log(`[Processor] ✅ Successfully settled trade ${trade.id}`);
                    } catch (e) {
                        console.error(`[Processor] ❌ Error settling trade ${trade.id}:`, e.message);
                        // If already settled on-chain, remove from Redis to avoid infinite retry
                        const alreadySettled = e.message?.includes('already settled') || e.message?.includes('Bet already settled');
                        if (alreadySettled) {
                            console.log(`[Processor] Trade ${trade.id} already settled on-chain, removing from Redis.`);
                            await redis.delTrade(trade.id.toString());
                        }
                    }
                }));
            }
        } catch (e) {
            console.error('[Processor] Settlement loop error:', e);
        } finally {
            this.isProcessing = false;
        }
    }

    async getActiveTradesForUser(address) {
        try {
            const trades = await redis.getAllActiveTrades();
            return trades.filter(t => t.user?.toLowerCase() === address.toLowerCase());
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

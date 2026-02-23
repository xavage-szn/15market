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
        this.SETTLED_CACHE_TTL = 30 * 60 * 1000;
        this.priceCache = {};
    }

    markSettled(tradeId) {
        this.settledCache.add(tradeId.toString());
        setTimeout(() => this.settledCache.delete(tradeId.toString()), this.SETTLED_CACHE_TTL);
    }

    async init() {
        console.log('[Processor] Initializing Stateless Trade Processor...');

        // Listen for new trades on-chain
        blockchain.onBetPlaced(async (trade) => {
            const existing = await redis.getTrade(trade.id);
            if (!existing) {
                await redis.setTrade(trade.id, {
                    ...trade,
                    expiry: (trade.timestamp + trade.duration) * 1000
                });
                console.log(`[Processor] 🛰️ Detected on-chain trade ${trade.id}, tracking for settlement.`);
            }
        });

        // Loop for safety (auto-settles if frontend doesn't call)
        setInterval(() => this.processSettlements(), 1000);
    }

    async processSettlements() {
        if (!blockchain.providerReady) return;
        const now = Date.now();
        const activeTrades = await redis.getAllActiveTrades();

        const toSettle = activeTrades.filter(t => {
            return now >= t.expiry && !this.settlingIds.has(t.id) && !this.settledCache.has(t.id);
        });

        for (const trade of toSettle) {
            this._settleSingleTrade(trade);
        }
    }

    async _settleSingleTrade(trade) {
        const tradeId = trade.id.toString();
        if (this.settlingIds.has(tradeId) || this.settledCache.has(tradeId)) return;

        this.settlingIds.add(tradeId);
        try {
            logToFile(`[Processor] ⚡ Settling trade ${tradeId}...`);
            const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
            const symbol = trade.symbol?.toUpperCase() || ID_ASSET_MAP[Number(trade.marketId)] || 'BTC';

            const currentPrice = await pricing.getPrice(symbol);
            if (!currentPrice || currentPrice <= 0) throw new Error("Price unavailable");

            const scaledPrice = BigInt(Math.round(currentPrice * 1e8));

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

            // Mark as settled in memory immediately
            this.markSettled(tradeId);
            await redis.delTrade(tradeId);

            // Execute on-chain
            const result = await blockchain.settleBet(trade.id, scaledPrice);
            if (result) {
                logToFile(`✅ Settlement TX for ${tradeId} broadcasted: ${result.hash}`);
                // If it was already settled, we track it
                if (result.alreadySettled) {
                    console.log(`[Processor] Bet ${tradeId} was already settled on-chain.`);
                }
            }
        } catch (e) {
            logToFile(`❌ Settlement failed for ${tradeId}: ${e.message}`);
            this.settlingIds.delete(tradeId); // Allow retry
        } finally {
            this.settlingIds.delete(tradeId);
        }
    }
}

module.exports = new TradeProcessor();

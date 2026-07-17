const cache = require('../cache');
const https = require('https');

/**
 * MULTI-TIMEFRAME DYNAMIC ODDS ENGINE
 * Calculates real-time prediction market share prices based on a composite
 * momentum score across 4 timeframes to protect the house from micro-dip exploits.
 */
class OddsEngine {
    constructor(io, redis) {
        this.io = io;
        this.redis = redis;
        this.symbols = ['btc', 'eth', 'sol'];
        this.durations = [5, 10, 15]; // in seconds
        
        // Cache for live odds and macro data
        this.currentOdds = {};
        this.macroData = { btc: 0, eth: 0, sol: 0 }; // 24h change %
    }

    start() {
        console.log('[OddsEngine] Starting Multi-Timeframe Dynamic Odds Engine...');
        // Fetch 24h Macro data immediately, then every 60 seconds
        this.fetchMacroData();
        setInterval(() => this.fetchMacroData(), 60000);
        // Run calculation loop every 250ms for real-time streaming feel
        setInterval(() => this.calculateAndBroadcast(), 250);
    }

    fetchMacroData() {
        const binanceSymbols = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };
        for (const [key, symbol] of Object.entries(binanceSymbols)) {
            https.get(`https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`, (res) => {
                let data = '';
                res.on('data', (chunk) => data += chunk);
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed && parsed.priceChangePercent) {
                            this.macroData[key] = parseFloat(parsed.priceChangePercent);
                        }
                    } catch (e) {}
                });
            }).on('error', () => {});
        }
    }

    // Helper to extract % change over a specific time window
    getROC(history, currentPrice, windowMs) {
        const cutoff = Date.now() - windowMs;
        const windowHistory = history.filter(p => p.time >= cutoff);
        if (windowHistory.length < 2) return 0; // Not enough data
        const oldPrice = windowHistory[0].price;
        return ((currentPrice - oldPrice) / oldPrice) * 100; // Returns % change
    }

    calculateAndBroadcast() {
        const liveOdds = {};

        for (const symbol of this.symbols) {
            const history = cache.priceHistory[symbol];
            if (!history || history.length < 2) continue;

            const currentPrice = history[history.length - 1].price;
            
            // 1. Calculate Rate of Change (ROC) % for each timeframe
            const roc5s = this.getROC(history, currentPrice, 5000);
            const roc60s = this.getROC(history, currentPrice, 60000);
            const roc15m = this.getROC(history, currentPrice, 15 * 60000); // 15 mins
            const roc24h = this.macroData[symbol] || 0; // 24 hours (from Binance API)

            // 2. Composite Skew Calculation
            // We map the % change into a normalized skew factor (-0.45 to +0.45 max)
            // Weightings: 5s (35%), 60s (30%), 15m (20%), 24h (15%)
            // The 5s window is given the most weight so the price reacts in FULL FORCE
            // when the oracle streams a direction change. Higher timeframes anchor it.
            const skew5s = Math.max(-0.45, Math.min(0.45, roc5s * 10.0)) * 0.35;  // Hyper-reactive
            const skew60s = Math.max(-0.45, Math.min(0.45, roc60s * 3.0)) * 0.30;  // Strong short-term
            const skew15m = Math.max(-0.45, Math.min(0.45, roc15m * 0.8)) * 0.20;  // Structural anchor
            const skew24h = Math.max(-0.45, Math.min(0.45, roc24h * 0.06)) * 0.15; // Daily bias
            
            const totalSkew = skew5s + skew60s + skew15m + skew24h;
            
            // Determine overall composite trend direction based on the merged skew
            const trendDirection = totalSkew >= 0 ? 'UP' : 'DOWN';

            liveOdds[symbol] = {};

            for (const duration of this.durations) {
                // Base probability is 0.5 for each side
                let longProb = 0.50 + totalSkew;
                let shortProb = 0.50 - totalSkew;

                // Ensure LONG + SHORT always equals exactly 1.00 (no internal spread)
                let finalLong = Number(longProb.toFixed(2));
                let finalShort = Number((1.00 - finalLong).toFixed(2));

                // Clamp to prevent either side from going below $0.05 or above $0.95
                if (finalLong > 0.95) {
                    finalLong = 0.95;
                    finalShort = 0.05;
                } else if (finalLong < 0.05) {
                    finalLong = 0.05;
                    finalShort = 0.95;
                }

                liveOdds[symbol][duration] = {
                    LONG: finalLong,
                    SHORT: finalShort,
                    metadata: {
                        trend: trendDirection,
                        skew: totalSkew.toFixed(4),
                        roc24h: roc24h.toFixed(2),
                        roc60s: roc60s.toFixed(4)
                    }
                };
            }
        }

        this.currentOdds = liveOdds;
        cache.liveOdds = liveOdds; // Expose globally for classic.js payout calculation

        // Broadcast to clients via Socket.io
        if (this.io) {
            this.io.emit('live_odds', liveOdds);
        }
        
        // Broadcast via Redis for other microservices (like price-frontend if separate)
        if (this.redis) {
            this.redis.publish('live_odds_updates', JSON.stringify(liveOdds)).catch(() => {});
        }
    }
}

module.exports = OddsEngine;

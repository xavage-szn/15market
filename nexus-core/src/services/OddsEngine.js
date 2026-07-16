const cache = require('../cache');

/**
 * DYNAMIC ODDS ENGINE
 * Calculates real-time prediction market share prices (Yes/No) for LONG and SHORT.
 * 
 * Rules based on user spec:
 * 1. Trend Direction: Determines probability skew (Uptrend -> LONG is more expensive).
 * 2. Trend Strength: Determines the magnitude of the skew.
 * 3. Volatility: High Volatility = Tighter Spread, Low Volatility = Wider Spread.
 * 4. Duration: Odds scale based on 5s, 10s, and 15s durations.
 */
class OddsEngine {
    constructor(io, redis) {
        this.io = io;
        this.redis = redis;
        this.symbols = ['btc', 'eth', 'sol'];
        this.durations = [5, 10, 15]; // in seconds
        
        // Cache for live odds to serve instantly to new connections
        this.currentOdds = {};
    }

    start() {
        console.log('[OddsEngine] Starting Dynamic Odds Engine...');
        // Run calculation loop every 1000ms
        setInterval(() => this.calculateAndBroadcast(), 1000);
    }

    calculateAndBroadcast() {
        const timestamp = Date.now();
        const liveOdds = {};

        for (const symbol of this.symbols) {
            const history = cache.priceHistory[symbol];
            if (!history || history.length < 2) continue;

            const currentPrice = history[history.length - 1].price;
            
            // Extract last 60 seconds of history
            const cutoff = timestamp - 60000;
            const recentHistory = history.filter(p => p.time >= cutoff);
            
            if (recentHistory.length < 2) continue;

            const oldPrice = recentHistory[0].price;
            
            // 1. Trend Direction & Strength
            const priceDelta = currentPrice - oldPrice;
            const trendDirection = priceDelta >= 0 ? 'UP' : 'DOWN';
            
            // ROC per second as percentage
            const timeDeltaSec = (recentHistory[recentHistory.length - 1].time - recentHistory[0].time) / 1000;
            const rocPerSec = timeDeltaSec > 0 ? (Math.abs(priceDelta) / oldPrice) / timeDeltaSec : 0;
            
            // 2. Volatility (Standard Deviation over the last 60s)
            const mean = recentHistory.reduce((sum, p) => sum + p.price, 0) / recentHistory.length;
            const variance = recentHistory.reduce((sum, p) => sum + Math.pow(p.price - mean, 2), 0) / recentHistory.length;
            const stdDev = Math.sqrt(variance);
            const volatilityPct = (stdDev / mean) * 100; // Volatility as % of price

            liveOdds[symbol] = {};

            for (const duration of this.durations) {
                // Base spread: e.g. 6% spread (sum = 1.06). 
                // User logic: High Volatility -> Tighter spread. Low Volatility -> Wider spread.
                let spread = 0.06; // Default 6%
                
                if (volatilityPct > 0.05) { // High vol (e.g. > 0.05% fluctuation in 60s)
                    spread = 0.02; // Tighten spread to 2%
                } else if (volatilityPct < 0.01) { // Low vol
                    spread = 0.10; // Widen spread to 10%
                }

                // Probability calculation
                // Base probability is 0.5 for each side
                let longProb = 0.5;
                let shortProb = 0.5;

                // Apply trend skew
                // Max skew allowed is +/- 0.40 to prevent prices from going below $0.10 or above $0.90
                let skew = Math.min(rocPerSec * 10000, 0.40); 
                // Reduce skew impact for shorter durations (harder to predict micro-moves)
                if (duration === 5) skew *= 0.5;
                else if (duration === 10) skew *= 0.75;
                
                if (trendDirection === 'UP') {
                    longProb += skew;
                    shortProb -= skew;
                } else {
                    longProb -= skew;
                    shortProb += skew;
                }

                // Add spread (House edge)
                const longPrice = (longProb + (spread / 2)).toFixed(2);
                const shortPrice = (shortProb + (spread / 2)).toFixed(2);

                // Clamp values between $0.05 and $0.95
                liveOdds[symbol][duration] = {
                    LONG: Math.min(Math.max(parseFloat(longPrice), 0.05), 0.95),
                    SHORT: Math.min(Math.max(parseFloat(shortPrice), 0.05), 0.95),
                    metadata: {
                        trend: trendDirection,
                        roc: rocPerSec.toFixed(6),
                        vol: volatilityPct.toFixed(4)
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

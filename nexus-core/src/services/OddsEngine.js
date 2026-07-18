const cache = require('../cache');
const https = require('https');

/**
 * MULTI-TIMEFRAME DYNAMIC ODDS ENGINE
 * Calculates real-time prediction market share prices based on a composite
 * momentum score across 4 timeframes with enhanced micro-volatility injection
 * to produce a wide, enticing range of share prices (frequently reaching 10c).
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
        
        // Micro-volatility state — injects controlled noise so share prices
        // oscillate frequently and produce enticing sub-20c swings
        this.microPhase = { btc: Math.random() * Math.PI * 2, eth: Math.random() * Math.PI * 2, sol: Math.random() * Math.PI * 2 };
        this.lastTick = Date.now();
        this.tickCount = 0;
    }

    start() {
        console.log('[OddsEngine] Starting Enhanced Dynamic Odds Engine with Micro-Volatility...');
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
        if (!oldPrice || oldPrice <= 0) return 0; // Guard division by zero
        return ((currentPrice - oldPrice) / oldPrice) * 100; // Returns % change
    }

    // Compute tick-to-tick velocity (price delta per second) for ultra-short momentum
    getTickVelocity(history) {
        if (history.length < 6) return 0; // Need at least ~1.5s of 250ms snapshots
        const recent = history.slice(-6);
        const now = recent[recent.length - 1];
        const ago = recent[0];
        if (!ago.price || ago.price <= 0) return 0; // Guard division by zero
        const dt = (now.time - ago.time) / 1000;
        if (dt <= 0) return 0;
        return ((now.price - ago.price) / ago.price) * 100 / dt; // % per second
    }

    calculateAndBroadcast() {
        const liveOdds = {};
        const now = Date.now();
        this.tickCount++;
        const dt = (now - this.lastTick) / 1000;
        this.lastTick = now;

        for (const symbol of this.symbols) {
            const history = cache.priceHistory[symbol];
            if (!history || history.length < 2) continue;

            const currentPrice = history[history.length - 1].price;
            if (!currentPrice || currentPrice <= 0) continue; // Skip if price is invalid
            
            // 1. Calculate Rate of Change (ROC) % for each timeframe
            const roc5s = this.getROC(history, currentPrice, 5000);
            const roc60s = this.getROC(history, currentPrice, 60000);
            const roc15m = this.getROC(history, currentPrice, 15 * 60000);
            const roc24h = this.macroData[symbol] || 0;

            // 2. Tick-to-Tick Velocity — captures micro-momentum between polls
            const tickVelocity = this.getTickVelocity(history);

            // 3. Enhanced Composite Skew Calculation
            // Multipliers significantly increased to produce wide share price swings.
            // The 5s ROC and tick velocity are hyper-sensitive so even small dips
            // push one side to 10-15c territory frequently.
            // Weightings: 5s (30%), velocity (20%), 60s (25%), 15m (15%), 24h (10%)
            const skew5s = Math.max(-0.48, Math.min(0.48, roc5s * 25.0)) * 0.30;   // Extremely reactive
            const skewVel = Math.max(-0.48, Math.min(0.48, tickVelocity * 8.0)) * 0.20; // Micro-momentum
            const skew60s = Math.max(-0.48, Math.min(0.48, roc60s * 8.0)) * 0.25;   // Strong short-term
            const skew15m = Math.max(-0.48, Math.min(0.48, roc15m * 2.0)) * 0.15;   // Structural anchor
            const skew24h = Math.max(-0.48, Math.min(0.48, roc24h * 0.15)) * 0.10;  // Daily bias
            
            // 4. Micro-Volatility Injection — deterministic sine-wave noise
            // Creates regular oscillation so share prices swing even during flat markets.
            // Phase advances per tick at a frequency that varies per symbol.
            const freq = { btc: 0.12, eth: 0.18, sol: 0.25 }[symbol] || 0.15;
            const amplitude = 0.06; // ±6% of skew range
            this.microPhase[symbol] += freq * dt;
            const microNoise = Math.sin(this.microPhase[symbol]) * amplitude;
            
            const totalSkew = skew5s + skewVel + skew60s + skew15m + skew24h + microNoise;
            
            // Clamp totalSkew to the expanded range
            const clampedSkew = Math.max(-0.48, Math.min(0.48, totalSkew));

            // Determine overall composite trend direction based on the merged skew
            const trendDirection = clampedSkew >= 0 ? 'UP' : 'DOWN';

            liveOdds[symbol] = {};

            for (const duration of this.durations) {
                // Base probability is 0.50 for each side
                let longProb = 0.50 + clampedSkew;
                let shortProb = 0.50 - clampedSkew;

                // Ensure LONG + SHORT always equals exactly 1.00 (no internal spread)
                let finalLong = Number(longProb.toFixed(2));
                let finalShort = Number((1.00 - finalLong).toFixed(2));

                // WIDENED CLAMP: Allow prices as low as $0.03 and as high as $0.97
                // This ensures share prices can frequently reach 10c and below
                if (finalLong > 0.97) {
                    finalLong = 0.97;
                    finalShort = 0.03;
                } else if (finalLong < 0.03) {
                    finalLong = 0.03;
                    finalShort = 0.97;
                }

                liveOdds[symbol][duration] = {
                    LONG: finalLong,
                    SHORT: finalShort,
                    metadata: {
                        trend: trendDirection,
                        skew: clampedSkew.toFixed(4),
                        velocity: tickVelocity.toFixed(4),
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

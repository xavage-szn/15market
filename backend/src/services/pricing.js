const axios = require('axios');

class PricingService {
    constructor() {
        this.cache = {}; // symbol -> { price, time }
        this.history = {}; // symbol -> []
        this.fetching = {}; // symbol -> promise

        // ===== HTTP CLIENT OPTIMIZATION =====
        // Reuse connections via keep-alive for faster repeated requests
        this.httpAgent = new (require('http').Agent)({ keepAlive: true, maxSockets: 20 });
        this.httpsAgent = new (require('https').Agent)({ keepAlive: true, maxSockets: 20 });
        this.axiosInstance = axios.create({
            timeout: 10000, // Increased to 10s for better resilience in high-latency environments
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        });

        this.activeSymbols = ['BTC', 'ETH', 'SOL', 'MON', 'JUP', 'XRP'];
        setInterval(() => this._pollPrices(), 1500); // 1.5s resolution
    }

    _pollPrices() {
        this.activeSymbols.forEach(sym => this.getPrice(sym).catch(() => { }));
    }

    getSources(symbol) {
        const configs = {
            'BTC': { binance: "BTCUSDT", mexc: "BTCUSDT", pyth: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
            'ETH': { binance: "ETHUSDT", mexc: "ETHUSDT", pyth: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
            'SOL': { binance: "SOLUSDT", mexc: "SOLUSDT", pyth: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
            'JUP': { binance: "JUPUSDT", mexc: "JUPUSDT", pyth: "06d19451433945517e4bb30dc74ee28246d65480874634fd0ace" },
            'XRP': { binance: "XRPUSDT", mexc: "XRPUSDT", pyth: "ecf553f19451433945517e4bb30dc74ee28246d65480874634fd0ace" },
            'MON': { binance: "BTCUSDT", mexc: "BTCUSDT", pyth: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" }
        };

        const config = configs[symbol] || configs['BTC'];
        const sources = [];

        if (config.mexc) sources.push({ name: "MEXC", url: `https://api.mexc.com/api/v3/ticker/price?symbol=${config.mexc}`, parse: d => parseFloat(d.price) });
        if (config.binance) sources.push({ name: "BINANCE", url: `https://api.binance.com/api/v3/ticker/price?symbol=${config.binance}`, parse: d => parseFloat(d.price) });
        if (config.pyth) {
            sources.push({
                name: "PYTH",
                url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${config.pyth}`,
                parse: (d) => {
                    const parsed = d.parsed?.[0]?.price;
                    if (!parsed) return null;
                    return parseFloat(parsed.price) * Math.pow(10, parsed.expo);
                }
            });
        }

        // Add Coinbase as a very reliable secondary source
        const COINBASE_MAP = { 'BTC': 'BTC-USD', 'ETH': 'ETH-USD', 'SOL': 'SOL-USD' };
        if (COINBASE_MAP[symbol]) {
            sources.push({
                name: "COINBASE",
                url: `https://api.coinbase.com/v2/prices/${COINBASE_MAP[symbol]}/spot`,
                parse: d => parseFloat(d.data.amount)
            });
        }

        return sources;
    }

    async getPrice(symbol = 'BTC') {
        const now = Date.now();
        if (this.cache[symbol] && (now - this.cache[symbol].time < 500)) {
            return this.cache[symbol].price;
        }

        if (this.fetching[symbol]) return this.fetching[symbol];

        this.fetching[symbol] = (async () => {
            try {
                const sources = this.getSources(symbol);
                const pricePromises = sources.map(async s => {
                    try {
                        const res = await this.axiosInstance.get(s.url);
                        const p = s.parse(res.data);
                        if (!p || isNaN(p)) throw new Error('Invalid price');
                        return p;
                    } catch (e) { throw e; }
                });

                const fastestPrice = await Promise.any(pricePromises);
                const time = Date.now();
                // Maintain full precision at source for outcome accuracy
                const finalPrice = fastestPrice;
                this.cache[symbol] = { price: finalPrice, time };

                // Keep history for last 20 minutes (roughly 800-1200 entries at 1s-1.5s resolution)
                if (!this.history[symbol]) this.history[symbol] = [];
                this.history[symbol].push({ price: finalPrice, time });
                if (this.history[symbol].length > 1200) this.history[symbol].shift();

                return finalPrice;
            } catch (e) {
                if (this.cache[symbol]) return this.cache[symbol].price;
                return 0;
            } finally {
                delete this.fetching[symbol];
            }
        })();

        return this.fetching[symbol];
    }

    async getHistoricalPrice(symbol, targetTime) {
        if (!this.history[symbol]) this.history[symbol] = [];
        
        // 1. Try Memory First
        if (this.history[symbol].length > 0) {
            let closest = this.history[symbol][0];
            let minDiff = Math.abs(targetTime - closest.time);

            for (const entry of this.history[symbol]) {
                const diff = Math.abs(targetTime - entry.time);
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = entry;
                }
            }

            // If the closest entry is more than 10s away, it's not reliable for memory-only
            if (minDiff <= 10000) return closest.price;
        }

        // 2. Fallback to Binance Historical API (1s resolution)
        try {
            const configs = { 'BTC': 'BTCUSDT', 'ETH': 'ETHUSDT', 'SOL': 'SOLUSDT', 'JUP': 'JUPUSDT', 'XRP': 'XRPUSDT', 'MON': 'BTCUSDT' };
            const binanceSym = configs[symbol] || 'BTCUSDT';
            const startTime = Math.floor(targetTime / 1000) * 1000;
            const url = `https://api.binance.com/api/v3/klines?symbol=${binanceSym}&interval=1s&startTime=${startTime}&limit=1`;
            
            const res = await this.axiosInstance.get(url);
            if (res.data && res.data[0]) {
                const closePrice = parseFloat(res.data[0][4]); // Index 4 is Close
                console.log(`[Pricing] Historical Fallback for ${symbol} @ ${targetTime}: ${closePrice}`);
                return closePrice;
            }
        } catch (e) {
            console.error(`[Pricing] Historical Fallback failed for ${symbol}:`, e.message);
        }

        return null;
    }
}

module.exports = new PricingService();

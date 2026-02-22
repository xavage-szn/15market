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
            timeout: 1500, // Reduced from 2s
            httpAgent: this.httpAgent,
            httpsAgent: this.httpsAgent,
        });
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

        return sources;
    }

    async getPrice(symbol = 'BTC') {
        const now = Date.now();

        // ===== FASTEST PATH: Return cached if fresh (< 500ms) =====
        if (this.cache[symbol] && (now - this.cache[symbol].time < 500)) {
            return this.cache[symbol].price;
        }

        // ===== DEDUP: If already fetching, await the same promise =====
        if (this.fetching[symbol]) return this.fetching[symbol];

        this.fetching[symbol] = (async () => {
            try {
                const sources = this.getSources(symbol);

                // ===== RACE PATTERN: Return the FASTEST source =====
                // Don't wait for all — return first valid response
                const pricePromises = sources.map(async s => {
                    const res = await this.axiosInstance.get(s.url);
                    const price = s.parse(res.data);
                    if (!price || isNaN(price)) throw new Error('Invalid price');
                    return price;
                });

                // Use Promise.any — returns the first successful result
                const fastestPrice = await Promise.any(pricePromises);

                this.cache[symbol] = { price: fastestPrice, time: Date.now() };
                return fastestPrice;
            } catch (e) {
                // All sources failed — return stale cache
                return this.cache[symbol]?.price || 0;
            } finally {
                delete this.fetching[symbol];
            }
        })();

        return this.fetching[symbol];
    }
}

module.exports = new PricingService();

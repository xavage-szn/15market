const axios = require('axios');

class PricingService {
    constructor() {
        this.cache = {}; // symbol -> { price, time }
        this.history = {}; // symbol -> []
        this.fetching = {}; // symbol -> promise
    }

    getSources(symbol) {
        const configs = {
            'BTC': { binance: "BTCUSDT", mexc: "BTCUSDT", pyth: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
            'ETH': { binance: "ETHUSDT", mexc: "ETHUSDT", pyth: "ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
            'SOL': { binance: "SOLUSDT", mexc: "SOLUSDT", pyth: "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
            'JUP': { binance: "JUPUSDT", mexc: "JUPUSDT", pyth: "06d19451433945517e4bb30dc74ee28246d65480874634fd0ace" },
            'XRP': { binance: "XRPUSDT", mexc: "XRPUSDT", pyth: "ecf553f19451433945517e4bb30dc74ee28246d65480874634fd0ace" },
            'MON': { binance: "BTCUSDT", mexc: "BTCUSDT", pyth: "e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" } // MON fallback to BTC for now as it's not live
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
                    // Pyth returns price as integer (e.g., 9652500000) and expo (e.g., -8)
                    // We need to convert this to float: 9652500000 * 10^-8 = 96.525
                    return parseFloat(parsed.price) * Math.pow(10, parsed.expo);
                }
            });
        }

        return sources;
    }

    async getPrice(symbol = 'BTC') {
        const now = Date.now();
        if (this.cache[symbol] && (now - this.cache[symbol].time < 1000)) {
            return this.cache[symbol].price;
        }

        if (this.fetching[symbol]) return this.fetching[symbol];

        this.fetching[symbol] = (async () => {
            try {
                const sources = this.getSources(symbol);
                const results = await Promise.allSettled(sources.map(async s => {
                    const res = await axios.get(s.url, { timeout: 2000 });
                    return s.parse(res.data);
                }));

                const validPrices = results
                    .filter(r => r.status === 'fulfilled' && r.value && !isNaN(r.value))
                    .map(r => r.value);

                if (validPrices.length === 0) return this.cache[symbol]?.price || 0;

                const consensus = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
                this.cache[symbol] = { price: consensus, time: Date.now() };

                return consensus;
            } catch (e) {
                return this.cache[symbol]?.price || 0;
            } finally {
                delete this.fetching[symbol];
            }
        })();

        return this.fetching[symbol];
    }
}

module.exports = new PricingService();

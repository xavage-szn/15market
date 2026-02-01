const axios = require('axios');

class PricingService {
    constructor() {
        this.consensusCache = {}; // symbol -> { price, time }
        this.history = {}; // symbol -> []
        this._currentFetches = {}; // symbol -> promise
    }

    getSources(symbol) {
        const configs = {
            'BTC': {
                binance: "BTCUSDT", mexc: "BTCUSDT", kraken: "XBTUSD", gecko: "bitcoin",
                pyth: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43"
            },
            'ETH': {
                binance: "ETHUSDT", mexc: "ETHUSDT", kraken: "ETHUSD", gecko: "ethereum",
                pyth: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace"
            },
            'MON': {
                binance: "MONUSDT", mexc: "MONUSDT", gecko: "monad",
                pyth: null
            },
            'JUP': {
                binance: "JUPUSDT", mexc: "JUPUSDT", kraken: "JUPUSD", gecko: "jupiter-exchange-solana",
                pyth: "0x0a049d6824976cfdc3c0f2ee054e7d1e92d528b8b989498877171d0e12d00996"
            },
            'XRP': {
                binance: "XRPUSDT", mexc: "XRPUSDT", kraken: "XRPUSD", gecko: "ripple",
                pyth: "0xec5d399846a9209f3fe5881d70aae9268c94339ff9817e8d18ff19fa05eea1c8"
            },
            'SOL': {
                binance: "SOLUSDT", mexc: "SOLUSDT", kraken: "SOLUSD", gecko: "solana",
                pyth: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d"
            },
            'LINK': {
                binance: "LINKUSDT", mexc: "LINKUSDT", kraken: "LINKUSD", gecko: "chainlink",
                pyth: "0x8bc90ca4edca1639d48b7921908bf4a169829f27025810b4290f6701bb41a029"
            },
            'PEPE': {
                binance: "PEPEUSDT", mexc: "PEPEUSDT", gecko: "pepe",
                pyth: "0x789b910e408d3e2363117498305c6d32df140b2f8e1217eeca04f7c22e431f7a"
            }
        };

        const c = configs[symbol] || configs['BTC'];
        const sources = [];

        // Priority 1: CEX Feeds (Real-Time)
        if (c.mexc) sources.push({ name: "MEXC", url: `https://api.mexc.com/api/v3/ticker/price?symbol=${c.mexc}`, parse: d => parseFloat(d.price) });
        if (c.kraken) sources.push({ name: "KRAKEN", url: `https://api.kraken.com/0/public/Ticker?pair=${c.kraken}`, parse: d => { const k = Object.keys(d.result || {})[0]; return k ? parseFloat(d.result[k].c[0]) : null; } });
        if (c.binance) sources.push({ name: "BINANCE", url: `https://api.binance.com/api/v3/ticker/price?symbol=${c.binance}`, parse: d => parseFloat(d.price) });

        // Priority 2: Aggregators (Stable)
        if (c.gecko) sources.push({ name: "GECKO", url: `https://api.coingecko.com/api/v3/simple/price?ids=${c.gecko}&vs_currencies=usd`, parse: d => d[c.gecko]?.usd });

        // Priority 3: On-Chain Oracle (Fallback)
        if (c.pyth) sources.push({ name: "PYTH", url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${c.pyth}`, parse: d => { const p = d.parsed?.[0]?.price; return p ? parseFloat(p.price) * Math.pow(10, p.expo) : null; } });

        return sources;
    }

    async getPrice(symbol = 'BTC') {
        // Debounce/Dedup requests
        if (this._currentFetches[symbol]) return this._currentFetches[symbol];

        this._currentFetches[symbol] = (async () => {
            try {
                const sources = this.getSources(symbol);
                const results = await Promise.allSettled(sources.map(async s => {
                    try {
                        const res = await axios.get(s.url, { timeout: 4000 });
                        const val = s.parse(res.data);
                        return (!isNaN(val) && val > 0) ? val : null;
                    } catch (e) { return null; }
                }));

                const validPrices = results
                    .filter(r => r.status === 'fulfilled' && r.value !== null)
                    .map(r => r.value);

                if (validPrices.length === 0) {
                    return this.consensusCache[symbol]?.price || 0;
                }

                // Remove outliers if enough data points
                validPrices.sort((a, b) => a - b);
                let consensus;
                if (validPrices.length >= 4) {
                    consensus = validPrices.slice(1, -1).reduce((a, b) => a + b, 0) / (validPrices.length - 2);
                } else {
                    consensus = validPrices.reduce((a, b) => a + b, 0) / validPrices.length;
                }

                this.consensusCache[symbol] = { price: consensus, time: Date.now() };

                // History
                if (!this.history[symbol]) this.history[symbol] = [];
                this.history[symbol].push({ t: Date.now(), p: consensus });
                if (this.history[symbol].length > 50) this.history[symbol].shift();

                return consensus;
            } finally {
                delete this._currentFetches[symbol];
            }
        })();

        return this._currentFetches[symbol];
    }

    async getResultVerdict(entryPrice, symbol = 'BTC') {
        const now = Date.now();
        const cache = this.consensusCache[symbol];
        let settlePrice;

        if (cache && (now - cache.time < 1500)) {
            settlePrice = cache.price;
        } else {
            settlePrice = await this.getPrice(symbol);
        }

        if (!settlePrice || settlePrice <= 0) return { price: 0, isReliable: false };

        return {
            price: settlePrice,
            isReliable: true
        };
    }
}

module.exports = new PricingService();

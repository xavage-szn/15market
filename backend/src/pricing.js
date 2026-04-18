const WebSocket = require('ws');

class PricingService {
    constructor() {
        this.prices = {
            btc: 0,
            eth: 0,
            sol: 0
        };
        this.markets = {
            'BTCUSDT': 'btc',
            'ETHUSDT': 'eth',
            'SOLUSDT': 'sol'
        };
        this.ws = null;
        this.onPriceUpdate = null;
        this.init();
    }

    init() {
        if (this.ws) {
            try { this.ws.close(); } catch (e) {}
        }

        console.log("[Pricing] Connecting to Binance WebSocket...");
        // aggTrade stream for real-time sub-second price
        const streams = Object.keys(this.markets).map(m => `${m.toLowerCase()}@aggTrade`).join('/');
        this.ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);

        this.ws.on('open', () => {
            console.log("[Pricing] Binance WebSocket Connected");
        });

        this.ws.on('message', (rawData) => {
            try {
                const data = JSON.parse(rawData);
                const stream = data.stream;
                const payload = data.data;
                
                const symbol = payload.s; // Symbol
                const price = parseFloat(payload.p); // Price
                const internalId = this.markets[symbol];

                if (internalId && price > 0) {
                    if (this.prices[internalId] !== price) {
                        this.prices[internalId] = price;
                        if (this.onPriceUpdate) {
                            this.onPriceUpdate(this.prices);
                        }
                    }
                }
            } catch (e) {
                // console.warn("[Pricing] Message error:", e.message);
            }
        });

        this.ws.on('error', (err) => {
            console.warn("[Pricing] WebSocket Error:", err.message);
        });

        this.ws.on('close', () => {
            console.log("[Pricing] WebSocket Closed. Reconnecting in 5s...");
            setTimeout(() => this.init(), 5000);
        });
    }

    getPrice(marketId) {
        return this.prices[marketId.toLowerCase()] || 0;
    }

    getAllPrices() {
        return this.prices;
    }
}

module.exports = new PricingService();
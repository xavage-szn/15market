const WebSocket = require('ws');

class PricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.markets = {
            'BTC-USD': 'btc',
            'ETH-USD': 'eth',
            'SOL-USD': 'sol'
        };
        this.ws = null;
        this.onPriceUpdate = null;
        this.init();
    }

    init() {
        const url = 'wss://ws-feed.exchange.coinbase.com';
        console.log(`[Pricing] Connecting to Institutional Feed: Coinbase...`);

        this.ws = new WebSocket(url);

        this.ws.on('open', () => {
            console.log(`[Pricing] Coinbase Stream Active`);
            this.ws.send(JSON.stringify({
                type: "subscribe",
                product_ids: Object.keys(this.markets),
                channels: ["ticker"]
            }));
        });

        this.ws.on('message', (rawData) => {
            try {
                const data = JSON.parse(rawData);
                if (data.type === 'ticker' && data.product_id && data.price) {
                    const internalId = this.markets[data.product_id];
                    const price = parseFloat(data.price);
                    if (internalId && price > 0) {
                        this.prices[internalId] = price;
                        if (this.onPriceUpdate) this.onPriceUpdate(this.prices);
                    }
                }
            } catch (e) {}
        });

        this.ws.on('error', (err) => {
            console.error(`[Pricing] Coinbase Error:`, err.message);
        });

        this.ws.on('close', () => {
            console.log("[Pricing] Coinbase Feed closed. Reconnecting...");
            setTimeout(() => this.init(), 3000);
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
const WebSocket = require('ws');

class PricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.marketsC = { 'BTC-USD': 'btc', 'ETH-USD': 'eth', 'SOL-USD': 'sol' };
        this.marketsK = { 'BTC/USD': 'btc', 'ETH/USD': 'eth', 'SOL/USD': 'sol' };
        this.ws = null;
        this.onPriceUpdate = null;
        this.currentProviderIndex = 0;
        this.activeTradeCount = 0;
        this.providers = [
            { name: 'COINBASE', url: 'wss://ws-feed.exchange.coinbase.com' },
            { name: 'KRAKEN', url: 'wss://ws.kraken.com' }
        ];
    }

    // Lazy Connect: Only connect if one or more trades are in progress
    trackTrade(isStarting) {
        if (isStarting) {
            this.activeTradeCount++;
            if (!this.ws) {
                console.log("[Pricing] Trade detected. Powering on price feed...");
                this.init();
            }
        } else {
            this.activeTradeCount = Math.max(0, this.activeTradeCount - 1);
            if (this.activeTradeCount === 0 && this.ws) {
                console.log("[Pricing] All trades settled. Hibernating price feed...");
                this.terminate();
            }
        }
    }

    init() {
        if (this.ws) this.terminate();

        const p = this.providers[this.currentProviderIndex];
        console.log(`[Pricing] Connecting to ${p.name}...`);
        this.ws = new WebSocket(p.url);

        this.ws.on('open', () => {
            console.log(`[Pricing] ${p.name} Stream Active`);
            if (p.name === 'COINBASE') {
                this.ws.send(JSON.stringify({
                    type: "subscribe",
                    product_ids: Object.keys(this.marketsC),
                    channels: ["ticker"]
                }));
            } else if (p.name === 'KRAKEN') {
                this.ws.send(JSON.stringify({
                    event: "subscribe",
                    pair: Object.keys(this.marketsK),
                    subscription: { name: "ticker" }
                }));
            }
        });

        this.ws.on('message', (rawData) => {
            try {
                const data = JSON.parse(rawData);
                let internalId, price;

                if (data.type === 'ticker' && data.product_id && data.price) { // Coinbase
                    internalId = this.marketsC[data.product_id];
                    price = parseFloat(data.price);
                } else if (Array.isArray(data) && data[1]?.c) { // Kraken
                    internalId = this.marketsK[data[3]];
                    price = parseFloat(data[1].c[0]);
                }

                if (internalId && price > 0) {
                    this.prices[internalId] = price;
                    if (this.onPriceUpdate) this.onPriceUpdate(this.prices);
                }
            } catch (e) {}
        });

        this.ws.on('error', (err) => {
            console.error(`[Pricing] ${p.name} Error:`, err.message);
            this.cycleProvider();
        });

        this.ws.on('close', () => {
            if (this.activeTradeCount > 0) {
                console.log("[Pricing] Feed lost while trade active. Reconnecting...");
                setTimeout(() => this.init(), 3000);
            }
        });
    }

    cycleProvider() {
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        this.init();
    }

    terminate() {
        if (this.ws) {
            this.ws.terminate();
            this.ws = null;
        }
    }

    getPrice(marketId) {
        return this.prices[marketId.toLowerCase()] || 0;
    }

    getAllPrices() {
        return this.prices;
    }
}

module.exports = new PricingService();
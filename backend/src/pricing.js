const WebSocket = require('ws');

class PricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.markets = { 'BTCUSDT': 'btc', 'ETHUSDT': 'eth', 'SOLUSDT': 'sol' };
        this.ws = null;
        this.onPriceUpdate = null;
        this.currentProviderIndex = 0;
        this.providers = [
            `wss://stream.binance.com:9443/stream?streams=`,
            `wss://stream.binance.us:9443/stream?streams=`,
            `wss://wsprod.okx.com:8443/ws/v5/public` // Neutral fallback
        ];
        this.init();
    }

    init() {
        const baseUrl = this.providers[this.currentProviderIndex];
        console.log(`[Pricing] Attempting connection to Provider ${this.currentProviderIndex}: ${baseUrl}`);

        if (baseUrl.includes('binance')) {
            const streams = Object.keys(this.markets).map(m => `${m.toLowerCase()}@aggTrade`).join('/');
            this.ws = new WebSocket(`${baseUrl}${streams}`);
        } else {
            // OKX / Alternative Logic
            this.ws = new WebSocket(baseUrl);
        }

        this.ws.on('open', () => {
            console.log(`[Pricing] Connected to Priority Feed (Provider ${this.currentProviderIndex})`);
            if (baseUrl.includes('okx')) {
                // Subscribe to OKX tickers
                const args = Object.keys(this.markets).map(m => ({ channel: "index-tickers", instId: m.replace('USDT', '-USDT') }));
                this.ws.send(JSON.stringify({ op: "subscribe", args }));
            }
        });

        this.ws.on('message', (rawData) => {
            try {
                const data = JSON.parse(rawData);
                let symbol, price;

                if (data.stream && data.data) {
                    // Binance Format
                    symbol = data.data.s;
                    price = parseFloat(data.data.p);
                } else if (data.arg && data.data) {
                    // OKX Format
                    symbol = data.arg.instId.replace('-', '');
                    price = parseFloat(data.data[0].idxPx);
                }

                const internalId = this.markets[symbol];
                if (internalId && price > 0) {
                    this.prices[internalId] = price;
                    if (this.onPriceUpdate) this.onPriceUpdate(this.prices);
                }
            } catch (e) {}
        });

        this.ws.on('error', (err) => {
            console.warn(`[Pricing] Provider ${this.currentProviderIndex} Error:`, err.message);
            if (err.message.includes('451')) {
                console.error("🛑 [Pricing] Region blocked by provider. Switching region...");
            }
            this.cycleProvider();
        });

        this.ws.on('close', () => {
            console.log("[Pricing] Feed closed. Reconnecting...");
            setTimeout(() => this.init(), 5000);
        });
    }

    cycleProvider() {
        this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
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
const WebSocket = require('ws');
const axios = require('axios');

class PricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.marketsC = { 'BTC-USD': 'btc', 'ETH-USD': 'eth', 'SOL-USD': 'sol' };
        this.marketsK = { 'BTC/USD': 'btc', 'ETH/USD': 'eth', 'SOL/USD': 'sol' };
        this.ws = null;
        this.onPriceUpdate = null;
        this.currentProviderIndex = 0;
        this.activeTradeCount = 0;
        this.isConnecting = false;
        this.reconnectTimeout = null;
        this.restInterval = null;
        this.intentionalClose = false;
        this.providers = [
            { name: 'COINBASE', url: 'wss://ws-feed.exchange.coinbase.com' },
            { name: 'KRAKEN', url: 'wss://ws.kraken.com' }
        ];
    }

    // Lazy Connect: Only connect if one or more trades are in progress
    trackTrade(isStarting) {
        if (isStarting) {
            this.activeTradeCount++;
            if (!this.ws && !this.isConnecting) {
                console.log("[Pricing] Trade detected or manual wake. Powering on price feed...");
                this.init();
            }
        } else {
            this.activeTradeCount = Math.max(0, this.activeTradeCount - 1);
            if (this.activeTradeCount === 0 && (this.ws || this.isConnecting)) {
                console.log("[Pricing] All trades settled. Hibernating price feed...");
                this.terminate();
            }
        }
    }

    init() {
        if (this.isConnecting) return;
        
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }

        this.terminate(); // Clean up existing state

        this.isConnecting = true;
        this.intentionalClose = false;
        const p = this.providers[this.currentProviderIndex];
        console.log(`[Pricing] Connecting to ${p.name} WS...`);
        
        try {
            this.ws = new WebSocket(p.url, { handshakeTimeout: 10000 });

            this.ws.on('open', () => {
                this.isConnecting = false;
                this.stopRestFallback();
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
                if (this.intentionalClose) return;
                console.error(`[Pricing] ${p.name} WS Error:`, err.message);
                this.isConnecting = false;
                this.startRestFallback();
                this.scheduleReconnect(true);
            });

            this.ws.on('close', () => {
                if (this.intentionalClose) return;
                console.log(`[Pricing] ${p.name} WS Connection lost.`);
                this.isConnecting = false;
                this.startRestFallback();
                if (this.activeTradeCount > 0) {
                    this.scheduleReconnect(false);
                }
            });

        } catch (e) {
            console.error(`[Pricing] Setup Error:`, e.message);
            this.isConnecting = false;
            this.startRestFallback();
            this.scheduleReconnect(true);
        }
    }

    async fetchRestPrices() {
        try {
            // Use MEXC or Binance as REST fallback
            const response = await axios.get('https://api.binance.com/api/v3/ticker/price', { timeout: 3000 });
            const data = response.data;
            if (!Array.isArray(data)) return;

            const btc = data.find(i => i.symbol === 'BTCUSDT');
            const eth = data.find(i => i.symbol === 'ETHUSDT');
            const sol = data.find(i => i.symbol === 'SOLUSDT');

            if (btc) this.prices.btc = parseFloat(btc.price);
            if (eth) this.prices.eth = parseFloat(eth.price);
            if (sol) this.prices.sol = parseFloat(sol.price);

            if (this.onPriceUpdate) this.onPriceUpdate(this.prices);
            console.log("[Pricing] Updated prices via REST Fallback");
        } catch (e) {
            // console.error("[Pricing] REST Fallback failed:", e.message);
        }
    }

    startRestFallback() {
        if (this.restInterval) return;
        console.log("[Pricing] Starting REST fallback polling (5s interval)...");
        this.fetchRestPrices();
        this.restInterval = setInterval(() => this.fetchRestPrices(), 5000);
    }

    stopRestFallback() {
        if (this.restInterval) {
            clearInterval(this.restInterval);
            this.restInterval = null;
            console.log("[Pricing] REST fallback stopped.");
        }
    }

    scheduleReconnect(cycle = false) {
        if (this.reconnectTimeout) return;
        if (cycle) this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;

        const delay = cycle ? 10000 : 5000; // Increased delay to avoid spamming
        console.log(`[Pricing] Reconnecting WS in ${delay}ms...`);
        this.reconnectTimeout = setTimeout(() => {
            this.reconnectTimeout = null;
            this.init();
        }, delay);
    }

    terminate() {
        if (this.ws) {
            this.intentionalClose = true;
            try { this.ws.terminate(); } catch (e) {}
            this.ws = null;
        }
        this.isConnecting = false;
        if (this.reconnectTimeout) {
            clearTimeout(this.reconnectTimeout);
            this.reconnectTimeout = null;
        }
        // Note: we don't stop REST here if it was running, 
        // unless activeTradeCount reached 0 in trackTrade.
    }

    getPrice(marketId) {
        return this.prices[marketId.toLowerCase()] || 0;
    }

    getAllPrices() {
        return this.prices;
    }
}

module.exports = new PricingService();
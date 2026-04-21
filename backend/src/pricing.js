const WebSocket = require('ws');
const axios = require('axios');

class PricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.marketsC = { 'BTC-USD': 'btc', 'ETH-USD': 'eth', 'SOL-USD': 'sol' };
        this.marketsK = { 'BTC/USD': 'btc', 'ETH/USD': 'eth', 'SOL/USD': 'sol' };
        this.ws = null;
        // Multi-subscriber map: id → callback(prices)
        // Supports both per-trade monitors AND the legacy single onPriceUpdate
        this.subscribers = new Map();
        this.currentProviderIndex = 0;
        this.activeTradeCount = 0;
        this.isConnecting = false;
        this.reconnectTimeout = null;
        this.restInterval = null;
        // Heartbeat
        this.heartbeatInterval = null;
        this.lastMessageTime = 0;
        this.HEARTBEAT_INTERVAL_MS = 15000;
        this.HEARTBEAT_STALE_MS = 25000;
        this.providers = [
            { name: 'COINBASE', url: 'wss://ws-feed.exchange.coinbase.com' },
            { name: 'KRAKEN', url: 'wss://ws.kraken.com' }
        ];
    }

    // ── Backward-compat: index.js does `pricing.onPriceUpdate = fn` ────────────
    set onPriceUpdate(fn) {
        if (fn) this.subscribers.set('__main__', fn);
        else this.subscribers.delete('__main__');
    }
    get onPriceUpdate() {
        return this.subscribers.get('__main__') || null;
    }

    // ── Per-trade subscription API ─────────────────────────────────────────────
    subscribe(id, fn) { this.subscribers.set(String(id), fn); }
    unsubscribe(id)   { this.subscribers.delete(String(id)); }

    _notifyAll() {
        this.subscribers.forEach(fn => {
            try { fn(this.prices); } catch (e) {}
        });
    }

    // ── Lazy Connect ───────────────────────────────────────────────────────────
    trackTrade(isStarting) {
        if (isStarting) {
            this.activeTradeCount++;
            if (!this.ws && !this.isConnecting) {
                console.log("[Pricing] Trade detected. Powering on price feed...");
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
        if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
        this._terminateCurrentWs();

        this.isConnecting = true;
        this.lastMessageTime = Date.now();
        const p = this.providers[this.currentProviderIndex];
        console.log(`[Pricing] Connecting to ${p.name} WS...`);

        try {
            const wsInstance = new WebSocket(p.url, { handshakeTimeout: 10000 });
            this.ws = wsInstance;

            wsInstance.on('open', () => {
                if (this.ws !== wsInstance) return;
                this.isConnecting = false;
                this.lastMessageTime = Date.now();
                this.stopRestFallback();
                this._startHeartbeat(wsInstance);
                console.log(`[Pricing] ${p.name} Stream Active`);
                if (p.name === 'COINBASE') {
                    wsInstance.send(JSON.stringify({ type: "subscribe", product_ids: Object.keys(this.marketsC), channels: ["ticker"] }));
                } else if (p.name === 'KRAKEN') {
                    wsInstance.send(JSON.stringify({ event: "subscribe", pair: Object.keys(this.marketsK), subscription: { name: "ticker" } }));
                }
            });

            wsInstance.on('message', (rawData) => {
                if (this.ws !== wsInstance) return;
                this.lastMessageTime = Date.now();
                try {
                    const data = JSON.parse(rawData);
                    let internalId, price;
                    if (data.type === 'ticker' && data.product_id && data.price) {
                        internalId = this.marketsC[data.product_id];
                        price = parseFloat(data.price);
                    } else if (Array.isArray(data) && data[1]?.c) {
                        internalId = this.marketsK[data[3]];
                        price = parseFloat(data[1].c[0]);
                    }
                    if (internalId && price > 0) {
                        this.prices[internalId] = price;
                        this._notifyAll();
                    }
                } catch (e) {}
            });

            wsInstance.on('error', (err) => {
                if (this.ws !== wsInstance) return;
                console.error(`[Pricing] ${p.name} WS Error:`, err.message);
                this.isConnecting = false;
                this._stopHeartbeat();
                this.startRestFallback();
                this.scheduleReconnect(true);
            });

            wsInstance.on('close', () => {
                if (this.ws !== wsInstance) return;
                console.log(`[Pricing] ${p.name} WS Connection lost.`);
                this.isConnecting = false;
                this.ws = null;
                this._stopHeartbeat();
                this.startRestFallback();
                if (this.activeTradeCount > 0) this.scheduleReconnect(false);
            });

        } catch (e) {
            console.error(`[Pricing] Setup Error:`, e.message);
            this.isConnecting = false;
            this._stopHeartbeat();
            this.startRestFallback();
            this.scheduleReconnect(true);
        }
    }

    _startHeartbeat(wsInstance) {
        this._stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws !== wsInstance) { this._stopHeartbeat(); return; }
            const msSinceMsg = Date.now() - this.lastMessageTime;
            if (msSinceMsg > this.HEARTBEAT_STALE_MS) {
                console.warn(`[Pricing] Heartbeat timeout (${Math.round(msSinceMsg / 1000)}s silence). Reconnecting...`);
                this.startRestFallback();
                this.scheduleReconnect(false);
            }
        }, this.HEARTBEAT_INTERVAL_MS);
    }

    _stopHeartbeat() {
        if (this.heartbeatInterval) { clearInterval(this.heartbeatInterval); this.heartbeatInterval = null; }
    }

    _terminateCurrentWs() {
        if (this.ws) { try { this.ws.terminate(); } catch (e) {} this.ws = null; }
        this.isConnecting = false;
        this._stopHeartbeat();
    }

    async fetchRestPrices() {
        try {
            const response = await axios.get('https://api.binance.com/api/v3/ticker/price', { timeout: 3000 });
            const data = response.data;
            if (!Array.isArray(data)) return;
            const btc = data.find(i => i.symbol === 'BTCUSDT');
            const eth = data.find(i => i.symbol === 'ETHUSDT');
            const sol = data.find(i => i.symbol === 'SOLUSDT');
            if (btc) this.prices.btc = parseFloat(btc.price);
            if (eth) this.prices.eth = parseFloat(eth.price);
            if (sol) this.prices.sol = parseFloat(sol.price);
            this._notifyAll();
            console.log("[Pricing] Updated prices via REST Fallback");
        } catch (e) {}
    }

    startRestFallback() {
        if (this.restInterval) return;
        console.log("[Pricing] Starting REST fallback polling (5s interval)...");
        this.fetchRestPrices();
        this.restInterval = setInterval(() => this.fetchRestPrices(), 5000);
    }

    stopRestFallback() {
        if (this.restInterval) { clearInterval(this.restInterval); this.restInterval = null; console.log("[Pricing] REST fallback stopped."); }
    }

    scheduleReconnect(cycle = false) {
        if (this.reconnectTimeout) return;
        if (cycle) this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        const delay = cycle ? 10000 : 5000;
        console.log(`[Pricing] Reconnecting WS in ${delay}ms...`);
        this.reconnectTimeout = setTimeout(() => { this.reconnectTimeout = null; this.init(); }, delay);
    }

    terminate() {
        this._terminateCurrentWs();
        if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
    }

    getPrice(marketId) { return this.prices[marketId.toLowerCase()] || 0; }
    getAllPrices() { return this.prices; }
}

module.exports = new PricingService();
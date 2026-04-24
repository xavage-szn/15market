const WebSocket = require('ws');
const axios = require('axios');

class BackendPricingService {
    constructor() {
        this.prices = { btc: 0, eth: 0, sol: 0 };
        this.marketsC = { 'BTC-USD': 'btc', 'ETH-USD': 'eth', 'SOL-USD': 'sol' };
        this.marketsK = { 'BTC/USD': 'btc', 'ETH/USD': 'eth', 'SOL/USD': 'sol' };
        this.ws = null;
        this.subscribers = new Map();
        this.currentProviderIndex = 0;
        this.activeTradeCount = 0;
        this.isConnecting = false;
        this.reconnectTimeout = null;
        this.restInterval = null;
        this.heartbeatInterval = null;
        this.lastMessageTime = 0;
        this.HEARTBEAT_INTERVAL_MS = 15000;
        this.HEARTBEAT_STALE_MS = 25000;
        this.providers = [
            { name: 'COINBASE', url: 'wss://ws-feed.exchange.coinbase.com' },
            { name: 'KRAKEN', url: 'wss://ws.kraken.com' }
        ];
        this._hasLoggedFirstPrice = false;
    }

    _debugLog(hypothesisId, location, message, data = {}, runId = 'initial') {
        // #region agent log
        fetch('http://127.0.0.1:7763/ingest/3594a004-3d00-491a-a04f-c0eea15a4941',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'28cfd1'},body:JSON.stringify({sessionId:'28cfd1',runId,hypothesisId,location,message,data,timestamp:Date.now()})}).catch(()=>{});
        // #endregion
    }

    subscribe(id, fn) { this.subscribers.set(String(id), fn); }
    unsubscribe(id)   { this.subscribers.delete(String(id)); }

    _notifyAll() {
        this.subscribers.forEach(fn => {
            try { fn(this.prices); } catch (e) {}
        });
    }

    ensureConnected() {
        if (!this.ws && !this.isConnecting) this.init();
    }

    trackTrade(isStarting) {
        if (isStarting) {
            this.activeTradeCount++;
            this._debugLog(
                'H1',
                'backend/src/pricingBackend.js:trackTrade:start',
                'trackTrade start received',
                { activeTradeCount: this.activeTradeCount, hasWs: Boolean(this.ws), isConnecting: this.isConnecting, subscribers: this.subscribers.size }
            );
            if (!this.ws && !this.isConnecting) this.init();
        } else {
            this.activeTradeCount = Math.max(0, this.activeTradeCount - 1);
            this._debugLog(
                'H1',
                'backend/src/pricingBackend.js:trackTrade:stop',
                'trackTrade stop received',
                { activeTradeCount: this.activeTradeCount, hasWs: Boolean(this.ws), isConnecting: this.isConnecting, subscribers: this.subscribers.size }
            );
        }
    }

    init() {
        if (this.isConnecting) return;
        if (this.reconnectTimeout) { clearTimeout(this.reconnectTimeout); this.reconnectTimeout = null; }
        this._terminateCurrentWs();

        this.isConnecting = true;
        this.lastMessageTime = Date.now();
        const p = this.providers[this.currentProviderIndex];
        this._hasLoggedFirstPrice = false;
        this._debugLog(
            'H2',
            'backend/src/pricingBackend.js:init',
            'pricing init called',
            { provider: p.name, providerIndex: this.currentProviderIndex, activeTradeCount: this.activeTradeCount }
        );

        try {
            const wsInstance = new WebSocket(p.url, { handshakeTimeout: 10000 });
            this.ws = wsInstance;

            wsInstance.on('open', () => {
                if (this.ws !== wsInstance) return;
                this.isConnecting = false;
                this.lastMessageTime = Date.now();
                this.stopRestFallback();
                this._startHeartbeat(wsInstance);
                this._debugLog(
                    'H2',
                    'backend/src/pricingBackend.js:ws:open',
                    'pricing websocket opened',
                    { provider: p.name, activeTradeCount: this.activeTradeCount, subscribers: this.subscribers.size }
                );
                if (p.name === 'COINBASE') {
                    wsInstance.send(JSON.stringify({ type: 'subscribe', product_ids: Object.keys(this.marketsC), channels: ['ticker'] }));
                } else if (p.name === 'KRAKEN') {
                    wsInstance.send(JSON.stringify({ event: 'subscribe', pair: Object.keys(this.marketsK), subscription: { name: 'ticker' } }));
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
                        if (!this._hasLoggedFirstPrice) {
                            this._hasLoggedFirstPrice = true;
                            this._debugLog(
                                'H3',
                                'backend/src/pricingBackend.js:ws:message:firstPrice',
                                'first valid live price received',
                                { market: internalId, price, provider: p.name }
                            );
                        }
                        this._notifyAll();
                    }
                } catch (e) {}
            });

            wsInstance.on('error', (err) => {
                if (this.ws !== wsInstance) return;
                this._debugLog(
                    'H4',
                    'backend/src/pricingBackend.js:ws:error',
                    'pricing websocket error',
                    { provider: p.name, error: err.message, activeTradeCount: this.activeTradeCount }
                );
                this.isConnecting = false;
                this._stopHeartbeat();
                this.startRestFallback();
                this.scheduleReconnect(true);
            });

            wsInstance.on('close', () => {
                if (this.ws !== wsInstance) return;
                this._debugLog(
                    'H4',
                    'backend/src/pricingBackend.js:ws:close',
                    'pricing websocket closed',
                    { provider: p.name, activeTradeCount: this.activeTradeCount, isConnecting: this.isConnecting }
                );
                this.isConnecting = false;
                this.ws = null;
                this._stopHeartbeat();
                this.startRestFallback();
                this.scheduleReconnect(false);
            });
        } catch (e) {
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
        } catch (e) {}
    }

    startRestFallback() {
        if (this.restInterval) return;
        this.fetchRestPrices();
        this.restInterval = setInterval(() => this.fetchRestPrices(), 5000);
    }

    stopRestFallback() {
        if (this.restInterval) { clearInterval(this.restInterval); this.restInterval = null; }
    }

    scheduleReconnect(cycle = false) {
        if (this.reconnectTimeout) return;
        if (cycle) this.currentProviderIndex = (this.currentProviderIndex + 1) % this.providers.length;
        const delay = cycle ? 10000 : 5000;
        this.reconnectTimeout = setTimeout(() => { this.reconnectTimeout = null; this.init(); }, delay);
    }

    getPrice(marketId) { return this.prices[marketId.toLowerCase()] || 0; }
}

module.exports = new BackendPricingService();

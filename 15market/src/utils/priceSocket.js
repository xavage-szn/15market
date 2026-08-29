// Dedicated Real-Time Price Oracle Service for the Chart Widget & Terminal
// Feeds live tick-by-tick prices for BTC, ETH, and SOL.
// Uses direct high-speed WebSockets (Binance zero-auth stream) + Pyth + Backend Socket fallback
// to guarantee 100% continuous uptime without getting stuck in loading.

import { socketService } from './socket';

const ASSETS = {
    btc: { symbol: 'BTCUSDT', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43' },
    eth: { symbol: 'ETHUSDT', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace' },
    sol: { symbol: 'SOLUSDT', pythId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d' }
};

const SYMBOL_TO_KEY = {
    'BTCUSDT': 'btc',
    'ETHUSDT': 'eth',
    'SOLUSDT': 'sol',
    'btcusdt': 'btc',
    'ethusdt': 'eth',
    'solusdt': 'sol'
};

const PYTH_ID_TO_KEY = {
    '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43': 'btc',
    '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace': 'eth',
    '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d': 'sol'
};

class PriceSocketService {
    constructor() {
        this.ws = null;
        this.pythEventSource = null;
        this.listeners = new Set();
        this.isConnecting = false;
        this.pollingInterval = null;
        this.lastMessageAt = 0;
        this.latestPrices = { btc: 0, eth: 0, sol: 0 };
        this.backendUnbind = null;
        this.apiKey = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_PYTH_API_KEY) || '';
    }

    connect() {
        if (this.isConnecting || this.ws) return;
        this.isConnecting = true;

        // 1. Direct Real-Time Binance WebSocket Stream (Sub-50ms tick feed for BTC, ETH, SOL)
        this._connectBinanceWs();

        // 2. Pyth Hermes SSE stream if API key is present
        if (this.apiKey) {
            this._connectPythStream();
        }

        // 3. Backend socket listener as reliable real-time backbone
        this._connectBackendSocket();

        // 4. Initial fast REST poll so the chart renders instantly upon mount
        this.fallbackPoll();

        // 5. Watchdog: periodic fallback poll every 3s if ticks stall
        if (!this.pollingInterval) {
            this.pollingInterval = setInterval(() => {
                if (Date.now() - this.lastMessageAt > 4000) {
                    this.fallbackPoll();
                }
            }, 3000);
        }
    }

    _emitPrice(key, price, ts = Date.now(), source = 'live') {
        if (!key || isNaN(price) || price <= 0) return;
        this.lastMessageAt = Date.now();
        this.latestPrices[key] = price;

        this.listeners.forEach(cb => {
            try {
                cb({ key, price, ts, source });
            } catch (e) {
                console.error('[PriceSocketService] Listener error:', e);
            }
        });
    }

    _connectBinanceWs() {
        try {
            const streams = 'btcusdt@trade/ethusdt@trade/solusdt@trade';
            const wsUrl = `wss://stream.binance.com:9443/ws/${streams}`;
            const ws = new WebSocket(wsUrl);
            this.ws = ws;

            ws.onopen = () => {
                this.isConnecting = false;
                console.log('[PriceSocketService] Chart Oracle WebSocket Active (Binance Direct Stream)');
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data && data.s && data.p) {
                        const key = SYMBOL_TO_KEY[data.s];
                        const price = parseFloat(data.p);
                        const ts = data.T || Date.now();
                        if (key && price > 0) {
                            this._emitPrice(key, price, ts, 'binance_ws');
                        }
                    }
                } catch (e) {}
            };

            ws.onerror = () => {
                this.isConnecting = false;
            };

            ws.onclose = () => {
                this.ws = null;
                this.isConnecting = false;
                // Reconnect after 3 seconds
                setTimeout(() => this._connectBinanceWs(), 3000);
            };
        } catch (e) {
            this.isConnecting = false;
            console.warn('[PriceSocketService] WebSocket setup failed, using REST fallback', e);
        }
    }

    _connectPythStream() {
        try {
            const ids = Object.values(ASSETS).map(a => `ids[]=${a.pythId}`).join('&');
            const baseUrl = this.apiKey ? 'https://pyth.dourolabs.app/hermes' : 'https://hermes.pyth.network';
            const url = `${baseUrl}/v2/updates/price/stream?${ids}`;

            const es = new EventSource(url);
            this.pythEventSource = es;

            es.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (!data.parsed) return;
                    data.parsed.forEach(p => {
                        const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
                        const key = PYTH_ID_TO_KEY[id];
                        if (key && p.price) {
                            const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
                            const ts = p.price.publish_time ? p.price.publish_time * 1000 : Date.now();
                            this._emitPrice(key, price, ts, 'pyth');
                        }
                    });
                } catch (e) {}
            };

            es.onerror = () => {
                if (this.pythEventSource) {
                    this.pythEventSource.close();
                    this.pythEventSource = null;
                }
            };
        } catch (e) {}
    }

    _connectBackendSocket() {
        if (this.backendUnbind) return;
        this.backendUnbind = socketService.on('price', (data) => {
            if (data && data.key && data.price) {
                const key = data.key.toLowerCase();
                if (key === 'btc' || key === 'eth' || key === 'sol') {
                    this._emitPrice(key, parseFloat(data.price), data.ts || Date.now(), 'backend_socket');
                }
            }
        });
    }

    async fallbackPoll() {
        // Fast Binance REST ticker query for BTC, ETH, SOL
        try {
            const res = await fetch('https://api.binance.com/api/v3/ticker/price?symbols=%5B%22BTCUSDT%22,%22ETHUSDT%22,%22SOLUSDT%22%5D');
            if (res.ok) {
                const data = await res.json();
                if (Array.isArray(data)) {
                    data.forEach(item => {
                        const key = SYMBOL_TO_KEY[item.symbol];
                        const price = parseFloat(item.price);
                        if (key && price > 0) {
                            this._emitPrice(key, price, Date.now(), 'binance_rest');
                        }
                    });
                    return;
                }
            }
        } catch (e) {}

        // Secondary fallback to Pyth latest
        try {
            const ids = Object.values(ASSETS).map(a => `ids[]=${a.pythId}`).join('&');
            const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${ids}`);
            if (res.ok) {
                const data = await res.json();
                if (data.parsed) {
                    data.parsed.forEach(p => {
                        const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
                        const key = PYTH_ID_TO_KEY[id];
                        if (key && p.price) {
                            const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
                            const ts = p.price.publish_time ? p.price.publish_time * 1000 : Date.now();
                            this._emitPrice(key, price, ts, 'pyth_rest');
                        }
                    });
                }
            }
        } catch (e) {}
    }

    on(event, callback) {
        if (event !== 'price') return () => {};

        this.connect();
        this.listeners.add(callback);

        // Immediately replay the latest cached price so the chart paints on frame 1
        Object.entries(this.latestPrices).forEach(([key, price]) => {
            if (price > 0) {
                try {
                    callback({ key, price, ts: Date.now(), source: 'cache' });
                } catch (e) {}
            }
        });

        return () => {
            this.listeners.delete(callback);
        };
    }

    getLatestPrice(symbol) {
        const key = symbol.replace('USDT', '').toLowerCase();
        return this.latestPrices[key] || 0;
    }
}

export const priceSocketService = new PriceSocketService();

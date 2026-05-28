const PYTH_IDS = {
    '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43': 'btc',
    '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace': 'eth',
    '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d': 'sol'
};

class PriceSocketService {
    constructor() {
        this.eventSource = null;
        this.listeners = new Set();
        this.isConnecting = false;
        this.failedReconnects = 0;
        this.pollingInterval = null;
        this.hermesUrl = "https://hermes.pyth.network/v2/updates/price/stream";
    }

    connect() {
        if (this.eventSource || this.isConnecting) return;
        this.isConnecting = true;

        // Adaptive reconnect delay based on network conditions
        const getReconnectDelay = () => {
            if (navigator.connection && navigator.connection.effectiveType) {
                switch (navigator.connection.effectiveType) {
                    case 'slow-2g': return 15000;
                    case '2g': return 10000;
                    case '3g': return 5000;
                    default: return 2000;
                }
            }
            return 2000;
        };

        const ids = Object.keys(PYTH_IDS).map(id => `ids[]=${id}`).join('&');
        const url = `${this.hermesUrl}?${ids}`;

        console.log(`[PriceStream] Direct Link Initiated: ${this.hermesUrl}`);
        
        try {
            this.eventSource = new EventSource(url);

            this.eventSource.onmessage = (event) => {
                this.isConnecting = false;
                try {
                    const data = JSON.parse(event.data);
                    if (!data.parsed) return;

                    data.parsed.forEach(p => {
                        const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
                        const key = PYTH_IDS[id];
                        if (key) {
                            const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
                            const ts = p.price.publish_time * 1000;
                            
                            // Emit to all internal listeners
                            this.listeners.forEach(cb => cb({ key, price, ts }));
                        }
                    });
                } catch (e) {}
            };

            this.eventSource.onerror = (err) => {
                this.isConnecting = false;
                console.warn("[PriceStream] Direct Link Stalled, Reconnecting...");
                this.eventSource.close();
                this.eventSource = null;
                const delay = getReconnectDelay();
                const maxRetriesReached = this.failedReconnects >= 5;
                if (maxRetriesReached) {
                    // After 5 failed attempts, use long polling (more conservative)
                    this.reconnectWithPolling(delay);
                } else {
                    this.failedReconnects = (this.failedReconnects || 0) + 1;
                    setTimeout(() => this.connect(), delay);
                }
            };
        } catch (e) {
            this.isConnecting = false;
            console.error("[PriceStream] Setup Failed:", e);
        }
    }

    reconnectWithPolling(delay) {
        // Fallback: Poll the price endpoint at longer intervals instead of SSE
        console.log("[PriceStream] Falling back to polling mode");
        this.pollingInterval = setInterval(() => {
            this.fallbackPoll();
        }, Math.max(delay, 30000));
    }

    async fallbackPoll() {
        try {
            const ids = Object.keys(PYTH_IDS).join(',');
            const url = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${ids}`;
            const res = await fetch(url);
            if (res.ok) {
                const data = await res.json();
                if (data.parsed) {
                    data.parsed.forEach(p => {
                        const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
                        const key = PYTH_IDS[id];
                        if (key) {
                            const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
                            const ts = p.price.publish_time * 1000;
                            this.listeners.forEach(cb => cb({ key, price, ts }));
                        }
                    });
                }
            }
        } catch (e) {}
    }

    on(event, callback) {
        // We only support 'price' event in this direct model
        if (event !== 'price') return () => {};
        
        if (!this.eventSource) this.connect();
        this.listeners.add(callback);
        
        return () => {
            this.listeners.delete(callback);
        };
    }
}

export const priceSocketService = new PriceSocketService();

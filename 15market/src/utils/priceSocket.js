import { io } from "socket.io-client";
import { PRICE_FEED_URL } from "../constants";

class PriceSocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.isConnecting = false;
    }

    connect() {
        if (this.socket?.connected || this.isConnecting) return;
        this.isConnecting = true;

        console.log(`[PriceSocket] Connecting to ${PRICE_FEED_URL}...`);
        this.socket = io(PRICE_FEED_URL, {
            transports: ['websocket', 'polling'],
            upgrade: true,
            reconnection: true,
            reconnectionAttempts: Infinity,
            reconnectionDelay: 800,
            reconnectionDelayMax: 4000,
            timeout: 10000,
            forceNew: false,
            autoConnect: true,
        });

        this.socket.on("connect", () => {
            this.isConnecting = false;
            console.log("[PriceSocket] Stream Link Active");
        });

        this.socket.on("disconnect", () => {
            console.log("[PriceSocket] Stream Link Lost");
        });

        this.socket.on("connect_error", (err) => {
            this.isConnecting = false;
            console.warn("[PriceSocket] Connect error:", err?.message || "unknown");
        });

        this.socket.on("reconnect_attempt", () => {
            console.log("[PriceSocket] Reconnecting stream...");
        });
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        this.listeners.set(event, callback);
        this.socket.on(event, callback);
        return () => {
            this.listeners.delete(event);
            if (this.socket) this.socket.off(event, callback);
        };
    }
}

export const priceSocketService = new PriceSocketService();

import { io } from "socket.io-client";
import { PRICE_FEED_URL } from "../constants";

class PriceSocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
    }

    connect() {
        if (this.socket?.connected) return;

        console.log(`[PriceSocket] Connecting to ${PRICE_FEED_URL}...`);
        this.socket = io(PRICE_FEED_URL, {
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 5000
        });

        this.socket.on("connect", () => {
            console.log("[PriceSocket] Stream Link Active");
        });

        this.socket.on("disconnect", () => {
            console.log("[PriceSocket] Stream Link Lost");
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

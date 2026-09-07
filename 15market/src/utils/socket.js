import { io } from "socket.io-client";
import { KEEPER_URL_ARC } from "../constants";

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map(); // event -> Set of callbacks
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
    }

    connect() {
        if (this.socket?.connected) return;

        // Adaptive timeout based on network conditions
        const getTimeout = () => {
            if (navigator.connection && navigator.connection.effectiveType) {
                switch (navigator.connection.effectiveType) {
                    case 'slow-2g': return 15000;
                    case '2g': return 10000;
                    case '3g': return 7000;
                    default: return 5000;
                }
            }
            return 5000;
        };

        this.socket = io(KEEPER_URL_ARC, {
            transports: ['websocket', 'polling'],
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: getTimeout(),
            randomizationFactor: 0.5
        });

        this.socket.on("connect", () => {
            console.log("[Socket] Platform Link Active");
            this.reconnectAttempts = 0;
        });

        this.socket.on("disconnect", (reason) => {
            console.log("[Socket] Platform Link Lost:", reason);
            if (reason !== "io server disconnect" && reason !== "io client disconnect") {
                this.reconnectAttempts++;
                if (this.reconnectAttempts <= this.maxReconnectAttempts) {
                    console.log(`[Socket] Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
                }
            }
        });

        this.socket.on("reconnect_attempt", (attemptNumber) => {
            console.log(`[Socket] Reconnect attempt #${attemptNumber}`);
        });

        this.socket.on("reconnect_error", (error) => {
            console.error("[Socket] Reconnection error:", error);
        });

        this.socket.on("reconnect_failed", () => {
            console.error("[Socket] Reconnection failed after max attempts");
        });

        // Re-attach ALL active listeners on reconnect
        this.socket.on("reconnect", () => {
            console.log("[Socket] Reconnected successfully");
            this.listeners.forEach((callbacks, event) => {
                callbacks.forEach(callback => {
                    this.socket.on(event, callback);
                });
            });
        });

        this.socket.on("connect_error", (error) => {
            console.error("[Socket] Connection error:", error);
        });
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        this.socket.on(event, callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (!this.socket) return;
        const callbacks = this.listeners.get(event);
        if (callbacks) {
            callbacks.delete(callback);
            if (callbacks.size === 0) {
                this.listeners.delete(event);
            }
        }
        this.socket.off(event, callback);
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        const emitWithRetry = (retries = 3) => {
            if (!this.socket || !this.socket.connected) {
                if (retries > 0) {
                    setTimeout(() => emitWithRetry(retries - 1), 1000);
                    return;
                }
                console.warn("[Socket] Cannot emit event, not connected and retries exhausted");
                return;
            }
            this.socket.emit(event, data);
        };
        emitWithRetry();
    }

    isConnected() {
        return this.socket?.connected || false;
    }

    reconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connect();
        }
    }
}

export const socketService = new SocketService();

import { io } from "socket.io-client";
import { KEEPER_URL_ARC } from "../constants";

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 15;
    }

    connect() {
        if (this.socket?.connected) return;

        // Adaptive timeout based on network conditions
        const getTimeout = () => {
            // Try to get network information if available
            if (navigator.connection && navigator.connection.effectiveType) {
                switch (navigator.connection.effectiveType) {
                    case 'slow-2g':
                        return 15000; // 15 seconds for slow 2G
                    case '2g':
                        return 10000; // 10 seconds for 2G
                    case '3g':
                        return 7000; // 7 seconds for 3G
                    default:
                        return 5000; // 5 seconds for 4G or better
                }
            }
            return 5000; // Default 5 seconds
        };

        this.socket = io(KEEPER_URL_ARC, {
            transports: ['websocket', 'polling'], // Add polling as fallback
            reconnectionAttempts: this.maxReconnectAttempts,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            timeout: getTimeout(),
            // Add randomization to prevent thundering herd
            randomizationFactor: 0.5
        });

        this.socket.on("connect", () => {
            console.log("[Socket] Platform Link Active");
            this.reconnectAttempts = 0; // Reset counter on successful connection
        });

        this.socket.on("disconnect", (reason) => {
            console.log("[Socket] Platform Link Lost:", reason);
            // Only attempt to reconnect if not manually disconnected
            if (reason !== "io server disconnect" && reason !== "io client disconnect") {
                // Exponential backoff for reconnection attempts
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

        // Re-attach all active listeners on reconnect
        this.socket.on("reconnect", () => {
            console.log("[Socket] Reconnected successfully");
            this.listeners.forEach((callback, event) => {
                this.socket.on(event, callback);
            });
        });

        // Handle connection errors gracefully
        this.socket.on("connect_error", (error) => {
            console.error("[Socket] Connection error:", error);
        });
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        this.listeners.set(event, callback);
        this.socket.on(event, callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (!this.socket) return;
        this.listeners.delete(event);
        this.socket.off(event, callback);
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        // Add retry logic for emitting events
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

    // Method to check connection status
    isConnected() {
        return this.socket?.connected || false;
    }

    // Method to force reconnection
    reconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.connect();
        }
    }
}

export const socketService = new SocketService();

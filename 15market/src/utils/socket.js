import { io } from "socket.io-client";
import { KEEPER_URL_ARC } from "../constants";

class SocketService {
    constructor() {
        this.socket = null;
        this.listeners = new Map();
    }

    connect() {
        if (this.socket?.connected) return;

        this.socket = io(KEEPER_URL_ARC, {
            transports: ['websocket'],
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 10000
        });

        this.socket.on("connect", () => {
            console.log("[Socket] Platform Link Active");
        });

        this.socket.on("disconnect", () => {
            console.log("[Socket] Platform Link Lost");
        });

        // Re-attach all active listeners on reconnect
        this.socket.on("reconnect", () => {
            this.listeners.forEach((callback, event) => {
                this.socket.on(event, callback);
            });
        });
    }

    on(event, callback) {
        if (!this.socket) this.connect();
        this.listeners.set(event, callback);
        this.socket.on(event, callback);
        return () => {
            this.listeners.delete(event);
            this.socket.off(event, callback);
        };
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        this.socket.emit(event, data);
    }
}

export const socketService = new SocketService();

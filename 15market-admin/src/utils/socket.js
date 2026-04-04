import { io } from 'socket.io-client';
import { KEEPER_URL, ADMIN_TOKEN } from '../constants';

class SocketService {
    constructor() {
        this.socket = null;
        this.handlers = new Map();
    }

    connect() {
        if (this.socket) return;

        this.socket = io(KEEPER_URL, {
            reconnectionAttempts: 10,
            reconnectionDelay: 2000
        });

        this.socket.on('connect', () => {
            console.log('[Socket] Connected to backend');
            this.socket.emit('auth_admin', ADMIN_TOKEN);
        });

        this.socket.on('disconnect', () => {
            console.warn('[Socket] Disconnected from backend');
        });

        this.socket.on('error', (err) => {
            console.error('[Socket] Connection error:', err);
        });

        this.socket.on('auth_error', (msg) => {
            console.error('[Socket] Admin Authentication Failed:', msg);
        });

        // Setup generic listeners that dispatch to registered handlers
        const events = ['dashboard_stats', 'trade_detected', 'trade_settled', 'settings_confirmed', 'settings_updated', 'new_broadcast'];
        events.forEach(event => {
            this.socket.on(event, (data) => {
                if (this.handlers.has(event)) {
                    this.handlers.get(event).forEach(handler => handler(data));
                }
            });
        });
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        if (this.handlers.has(event)) {
            this.handlers.get(event).delete(handler);
        }
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
        }
    }
}

export const socketService = new SocketService();

import { io } from 'socket.io-client';
import { KEEPER_URL, ADMIN_TOKEN } from '../constants';

class SocketService {
    constructor() {
        this.socket = null;
        this.handlers = new Map();
        this.forwardedEvents = new Set();
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
            // Re-forward all registered handlers (needed after reconnect)
            this.reForwardAll();
        });

        this.socket.on('disconnect', (reason) => {
            console.warn('[Socket] Disconnected from backend:', reason);
            this.forwardedEvents.clear();
        });

        this.socket.on('error', (err) => {
            console.error('[Socket] Connection error:', err);
        });

        this.socket.on('auth_error', (msg) => {
            console.error('[Socket] Admin Authentication Failed:', msg);
        });

        // Setup generic listeners that dispatch to registered handlers
        [
            'connect',
            'disconnect',
            'dashboard_stats',
            'trade_detected',
            'trade_settled',
            'global_trade_settled',
            'settings_confirmed',
            'settings_updated',
            'new_broadcast',
            'admin_stats_update',
            'settings_update',
            'new_copy_application'
        ].forEach(event => this.forwardEvent(event));
    }

    reForwardAll() {
        for (const event of this.handlers.keys()) {
            this.forwardEvent(event, true);
        }
    }

    on(event, handler) {
        if (!this.handlers.has(event)) {
            this.handlers.set(event, new Set());
        }
        this.handlers.get(event).add(handler);
        if (this.socket) this.forwardEvent(event, true);
        return () => this.off(event, handler);
    }

    forwardEvent(event, force = false) {
        if (!this.socket || (!force && this.forwardedEvents.has(event))) return;
        this.forwardedEvents.add(event);
        // Remove old listener if re-forwarding
        if (force) {
            this.socket.off(event);
        }
        this.socket.on(event, (data) => {
            console.log(`[Socket] Received event '${event}'`, data ? (data.address || data.primaryWallet || JSON.stringify(data).substring(0, 80)) : '(no data)');
            if (this.handlers.has(event)) {
                this.handlers.get(event).forEach(handler => handler(data));
            } else {
                console.log(`[Socket] No handlers registered for '${event}'`);
            }
        });
    }

    off(event, handler) {
        if (this.handlers.has(event)) {
            this.handlers.get(event).delete(handler);
        }
    }

    emit(event, data) {
        if (!this.socket) this.connect();
        this.socket.emit(event, data);
    }

    disconnect() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.forwardedEvents.clear();
        }
    }
}

export const socketService = new SocketService();

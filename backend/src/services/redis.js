const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;

class RedisStore {
    constructor() {
        if (REDIS_URL) {
            console.log('[Redis] Connecting to Redis Cloud...');
            this.redis = new Redis(REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 50, 2000),
                reconnectOnError: (err) => true
            });
            this.isCloud = true;
            this._lastBlock = 28600000;

            this.redis.ping().then(() => console.log('[Redis] ✅ Cloud Connection Verified')).catch(e => console.error('[Redis] ❌ Connection Failed:', e.message));
        } else {
            console.warn('[Redis] No REDIS_URL found, falling back to local memory.');
            this.redis = null;
            this.isCloud = false;
            this.activeTrades = new Map();
            this.sessionWallets = new Map();
            this.historicalTrades = new Map();
            this._lastBlock = 28600000;
        }
    }

    async setTrade(id, data) {
        if (this.isCloud) {
            await this.redis.hset('15market_active_trades', id.toString(), JSON.stringify(data));
        } else {
            this.activeTrades.set(id.toString(), { ...data, timestamp: Date.now() });
        }
    }

    async getTrade(id) {
        if (this.isCloud) {
            const data = await this.redis.hget('15market_active_trades', id.toString());
            return data ? JSON.parse(data) : null;
        }
        return this.activeTrades.get(id.toString());
    }

    async delTrade(id) {
        if (this.isCloud) {
            await this.redis.hdel('15market_active_trades', id.toString());
        } else {
            this.activeTrades.delete(id.toString());
        }
    }

    async getAllActiveTrades() {
        if (this.isCloud) {
            const all = await this.redis.hvals('15market_active_trades');
            return all.map(t => JSON.parse(t));
        }
        return Array.from(this.activeTrades.values());
    }

    // Historical Indexing
    async addHistoricalTrade(trade) {
        const id = trade.id.toString();
        if (this.isCloud) {
            try {
                const existing = await this.redis.hget('15market_historical_trades', id);
                const updated = existing ? { ...JSON.parse(existing), ...trade } : trade;
                await this.redis.hset('15market_historical_trades', id, JSON.stringify(updated));
            } catch (e) {
                console.error(`[Redis] Failed to add historical trade ${id}:`, e.message);
            }
        } else {
            const existing = this.historicalTrades.get(id);
            if (existing) {
                this.historicalTrades.set(id, { ...existing, ...trade });
            } else {
                this.historicalTrades.set(id, trade);
            }
        }
    }

    async getFullHistory() {
        if (this.isCloud) {
            try {
                const all = await this.redis.hvals('15market_historical_trades');
                const trades = all.map(t => JSON.parse(t));
                if (trades.length === 0) {
                    console.log("[Redis] ⚠️ History is empty in Cloud. Backfiller might still be running.");
                }
                return trades;
            } catch (e) {
                console.error('[Redis] getFullHistory failed:', e.message);
                return [];
            }
        }
        return Array.from(this.historicalTrades.values());
    }

    // Sessions
    async saveSessionMapping(sessionAddr, mainAddr) {
        if (this.isCloud) {
            await this.redis.hset('15market_session_mappings', sessionAddr.toLowerCase(), mainAddr.toLowerCase());
        } else {
            this.sessionWallets.set(sessionAddr.toLowerCase(), mainAddr.toLowerCase());
        }
    }

    async getMainAddressForSession(sessionAddr) {
        if (this.isCloud) {
            return await this.redis.hget('15market_session_mappings', sessionAddr.toLowerCase());
        }
        return this.sessionWallets.get(sessionAddr.toLowerCase());
    }

    get lastScannedBlock() {
        return this._lastBlock;
    }

    set lastScannedBlock(val) {
        this._lastBlock = val;
        if (this.isCloud) {
            this.redis.set('15market_last_scanned_block', val).catch(() => { });
        }
    }

    async syncLastBlock() {
        if (this.isCloud) {
            const val = await this.redis.get('15market_last_scanned_block');
            if (val) this._lastBlock = parseInt(val);
        }
    }

    async saveToDisk() {
        // No-op for Redis Cloud, but maybe we should keep it for local fallback?
        // For now, minimal.
    }

    // Unused but kept for compatibility
    async getUserData() { return null; }
    async saveProfile() { return true; }
    async getProfile() { return null; }
    async syncFromRedis() { }
}

const store = new RedisStore();
if (store.isCloud) store.syncLastBlock();

module.exports = store;

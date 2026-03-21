const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

const REDIS_URL = process.env.REDIS_URL;

class RedisStore {
    constructor() {
        if (REDIS_URL) {
            console.log('[Redis] Connecting to Redis Cloud...');
            this.redis = new Redis(REDIS_URL, {
                retryStrategy: (times) => Math.min(times * 50, 2000),
                reconnectOnError: (err) => true
            });
            this.redis.on('error', (err) => {
                console.error('[Redis] ❌ Error Event:', err.message);
            });
            this.isCloud = true;
            this._lastBlock = 31400000; // Reset to recent block to avoid saturating RPC during sync

            this.redis.ping().then(() => console.log('[Redis] ✅ Cloud Connection Verified')).catch(e => console.error('[Redis] ❌ Connection Failed:', e.message));
        } else {
            console.warn('[Redis] No REDIS_URL found, falling back to local memory.');
            this.redis = null;
            this.isCloud = false;
            this.activeTrades = new Map();
            this.sessionWallets = new Map();
            this.historicalTrades = new Map();
            this._lastBlock = 31400000;
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

    async getAllActiveTrades(filterSettling = false) {
        let trades = [];
        if (this.isCloud) {
            const all = await this.redis.hvals('15market_active_trades');
            trades = all.map(t => JSON.parse(t));
        } else {
            trades = Array.from(this.activeTrades.values());
        }
        return filterSettling ? trades.filter(t => !t.isSettling) : trades;
    }

    async markAsSettling(id) {
        const trade = await this.getTrade(id);
        if (trade) {
            trade.isSettling = true;
            await this.setTrade(id, trade);
            return true;
        }
        return false;
    }

    // Atomic Lock to prevent double-processing a request
    async lockTrade(id, ttl = 30) {
        const key = `lock:trd:${id}`;
        if (this.isCloud) {
            const res = await this.redis.set(key, "1", "EX", ttl, "NX");
            return res === "OK";
        }
        // Memory fallback
        if (this._memLocks?.has(id)) return false;
        if (!this._memLocks) this._memLocks = new Set();
        this._memLocks.add(id);
        setTimeout(() => this._memLocks.delete(id), ttl * 1000);
        return true;
    }

    async unlockTrade(id) {
        const key = `lock:trd:${id}`;
        if (this.isCloud) {
            await this.redis.del(key);
        } else if (this._memLocks) {
            this._memLocks.delete(id);
        }
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


    // ─── ROUNDS MANAGEMENT ─────────────────────────────────────────────────────

    async getRound(id) {
        if (this.isCloud) {
            const data = await this.redis.hget('15market_rounds', id.toString());
            return data ? JSON.parse(data) : null;
        }
        if (!this.rounds) this.rounds = new Map();
        return this.rounds.get(id.toString());
    }

    async setRound(id, data) {
        if (this.isCloud) {
            await this.redis.hset('15market_rounds', id.toString(), JSON.stringify(data));
        } else {
            if (!this.rounds) this.rounds = new Map();
            this.rounds.set(id.toString(), data);
        }
    }

    // ─── ACCESS MANAGEMENT (Rounds / Private Access) ───────────────────────────

    // ─── ACCESS MANAGEMENT (Rounds / Private Access) ───────────────────────────

    async grantAccess(address) {
        if (this.isCloud) {
            await this.redis.sadd('rounds:authorized_users', address.toLowerCase());
        } else {
            if (!this._authUsers) this._authUsers = new Set();
            this._authUsers.add(address.toLowerCase());
        }
    }

    async isAuthorized(address) {
        if (!address) return false;
        if (this.isCloud) {
            const result = await this.redis.sismember('rounds:authorized_users', address.toLowerCase());
            return result === 1;
        }
        return this._authUsers?.has(address.toLowerCase()) || false;
    }

    async revokeAccess(address) {
        if (this.isCloud) {
            await this.redis.srem('rounds:authorized_users', address.toLowerCase());
        } else {
            this._authUsers?.delete(address.toLowerCase());
        }
    }

    async getAuthorizedWallets() {
        if (this.isCloud) {
            return await this.redis.smembers('rounds:authorized_users');
        }
        return Array.from(this._authUsers || []);
    }

    async saveCode(code, data) {
        const key = `rounds:code:${code.toUpperCase()}`;
        if (this.isCloud) {
            await this.redis.set(key, JSON.stringify({ ...data, redeemedBy: null }), 'EX', 86400 * 30);
        } else {
            if (!this._codes) this._codes = new Map();
            this._codes.set(code.toUpperCase(), { ...data, redeemedBy: null });
        }
    }

    async verifyCode(code) {
        const key = `rounds:code:${code.toUpperCase()}`;
        if (this.isCloud) {
            const data = await this.redis.get(key);
            return data ? JSON.parse(data) : null;
        }
        return this._codes?.get(code.toUpperCase()) || null;
    }

    async redeemCode(code, walletAddress) {
        const normalizedCode = code.toUpperCase();
        const normalizedAddress = walletAddress.toLowerCase();
        const key = `rounds:code:${normalizedCode}`;

        let data;
        if (this.isCloud) {
            const raw = await this.redis.get(key);
            if (!raw) return { ok: false, reason: 'invalid_code' };
            data = JSON.parse(raw);
        } else {
            data = this._codes?.get(normalizedCode);
            if (!data) return { ok: false, reason: 'invalid_code' };
        }

        if (data.redeemedBy) return { ok: false, reason: 'already_used' };

        // If code was generated for a specific address, enforce it
        if (data.address && data.address.toLowerCase() !== normalizedAddress) {
            return { ok: false, reason: 'wrong_wallet' };
        }

        // Check if already authorized
        const alreadyAuthorized = await this.isAuthorized(normalizedAddress);
        if (alreadyAuthorized) return { ok: false, reason: 'already_authorized' };

        data.redeemedBy = normalizedAddress;
        data.redeemedAt = Date.now();
        
        if (this.isCloud) {
            await this.redis.set(key, JSON.stringify(data), 'EX', 86400 * 7);
        } else {
            this._codes.set(normalizedCode, data);
        }

        await this.grantAccess(normalizedAddress);
        return { ok: true };
    }

    async saveApplication(app) {
        if (this.isCloud) {
            await this.redis.hset('rounds:applications', app.address.toLowerCase(), JSON.stringify(app));
        } else {
            if (!this._apps) this._apps = new Map();
            this._apps.set(app.address.toLowerCase(), app);
        }
    }

    async getApplications() {
        if (this.isCloud) {
            const data = await this.redis.hgetall('rounds:applications');
            if (!data) return [];
            return Object.values(data).map(JSON.parse);
        }
        return Array.from(this._apps?.values() || []);
    }

    async deleteApplication(address) {
        if (this.isCloud) {
            await this.redis.hdel('rounds:applications', address.toLowerCase());
        } else {
            this._apps?.delete(address.toLowerCase());
        }
    }

    // ─── PROFILE & STAFF MANAGEMENT ──────────────────────────────────────────────

    async saveProfile(address, profile) {
        if (this.isCloud) {
            await this.redis.hset('15market_profiles', address.toLowerCase(), JSON.stringify(profile));
        } else {
            if (!this._profiles) this._profiles = new Map();
            this._profiles.set(address.toLowerCase(), profile);
        }
    }

    async getProfile(address) {
        if (this.isCloud) {
            const data = await this.redis.hget('15market_profiles', address.toLowerCase());
            return data ? JSON.parse(data) : null;
        }
        return this._profiles?.get(address.toLowerCase()) || null;
    }

    async getAllProfiles() {
        if (this.isCloud) {
            const data = await this.redis.hgetall('15market_profiles');
            return Object.values(data || {}).map(JSON.parse);
        }
        return Array.from(this._profiles?.values() || []);
    }

    async saveStaff(staff) {
        if (this.isCloud) {
            await this.redis.hset('15market_staff', staff.address.toLowerCase(), JSON.stringify(staff));
        } else {
            if (!this._staff) this._staff = new Map();
            this._staff.set(staff.address.toLowerCase(), staff);
        }
    }

    async getStaff(address) {
        if (this.isCloud) {
            const data = await this.redis.hget('15market_staff', address.toLowerCase());
            return data ? JSON.parse(data) : null;
        }
        return this._staff?.get(address.toLowerCase()) || null;
    }

    async getAllStaff() {
        if (this.isCloud) {
            const data = await this.redis.hgetall('15market_staff');
            if (!data) return [];
            return Object.values(data).map(JSON.parse);
        }
        return Array.from(this._staff?.values() || []);
    }

    async deleteStaff(address) {
        if (this.isCloud) {
            await this.redis.hdel('15market_staff', address.toLowerCase());
        } else {
            this._staff?.delete(address.toLowerCase());
        }
    }

    async saveSettings(settings) {
        if (this.isCloud) {
            await this.redis.set('15market_platform_settings', JSON.stringify(settings));
        } else {
            this._settings = settings;
        }
    }

    async getSettings() {
        if (this.isCloud) {
            const data = await this.redis.get('15market_platform_settings');
            return data ? JSON.parse(data) : null;
        }
        return this._settings || null;
    }

    async saveBroadcast(broadcast) {
        if (this.isCloud) {
            await this.redis.set('15market_global_broadcast', JSON.stringify(broadcast), 'EX', 86400); // 24h max
        } else {
            this._broadcast = broadcast;
        }
    }

    async getBroadcast() {
        if (this.isCloud) {
            const data = await this.redis.get('15market_global_broadcast');
            return data ? JSON.parse(data) : null;
        }
        return this._broadcast || null;
    }

    async saveToDisk() { }
    async syncFromRedis() { }
}

const store = new RedisStore();
if (store.isCloud) store.syncLastBlock();

module.exports = store;


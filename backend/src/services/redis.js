const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');
// Vault decommissioned.
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

// ─── PERSISTENT PROFILES FILE (survives Redis outages & server restarts) ──────
const PROFILES_FILE = path.join(__dirname, '..', '..', 'profiles_db.json');
function _loadProfilesFromDisk() {
    try {
        if (fs.existsSync(PROFILES_FILE)) {
            const raw = fs.readFileSync(PROFILES_FILE, 'utf8');
            const obj = JSON.parse(raw);
            const map = new Map();
            Object.entries(obj).forEach(([k, v]) => map.set(k, v));
            console.log(`[Profiles] Loaded ${map.size} profiles from disk.`);
            return map;
        }
    } catch (e) {
        console.error('[Profiles] Failed to load profiles_db.json:', e.message);
    }
    return new Map();
}
function _saveProfilesToDisk(profilesMap) {
    try {
        const obj = {};
        profilesMap.forEach((v, k) => obj[k] = v);
        fs.writeFileSync(PROFILES_FILE, JSON.stringify(obj, null, 2), 'utf8');
    } catch (e) {
        console.error('[Profiles] Failed to write profiles_db.json:', e.message);
    }
}

const RAW_REDIS_URL = process.env.REDIS_URL ? process.env.REDIS_URL.trim().replace(/^["'\s]+|["'\s]+$/g, '') : undefined;
const REDIS_URL = RAW_REDIS_URL;

class RedisStore {
    constructor() {
        this._initMemory(); // Always initialize memory structures first as a baseline
        if (REDIS_URL) {
            console.log('[Redis] Connecting to Redis Cloud...');
            this.redis = new Redis(REDIS_URL, {
                retryStrategy: (times) => times > 5 ? null : 2000, 
                reconnectOnError: (err) => true,
                connectTimeout: 5000,
                maxRetriesPerRequest: 5,
                enableReadyCheck: false,
                enableOfflineQueue: false // CRITICAL: Don't queue commands if Redis is down
            });
            
            this.redis.on('error', (err) => {
                if (err.name === 'MaxRetriesPerRequestError') {
                    console.error('[Redis] Max retries reached. Switching to local memory.');
                    this.isCloud = false;
                    return;
                }
                console.error('[Redis] Transient Error:', err.message);
                if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
                    this.isCloud = false; // Graceful fallback
                    setTimeout(() => {
                         if (this.redis.status === 'ready') return;
                         console.log('[Redis] Attempting to reconnect to Cloud...');
                         this.redis.ping().then(() => this.isCloud = true).catch(() => {});
                    }, 60000); // Check again in 60s
                }
            });
            this.isCloud = true;
            this.fallbackTriggered = false;

            this.redis.ping()
                .then(() => console.log('[Redis] Cloud connected'))
                .catch(e => {
                    console.error('[Redis] Connection failed, switching to local memory.');
                    this.isCloud = false;
                    this.redis.disconnect();
                });
            
            // Safety timeout: If ping takes more than 3s, force memory
            setTimeout(() => {
                if (this.isCloud && !this.redis.status === 'ready') {
                    console.warn('[Redis] Connection slow, forcing local memory.');
                    this.isCloud = false;
                }
            }, 3000);
        }
    }

    _initMemory() {
        if (this.activeTrades) return; // Already init
        this.activeTrades = new Map();
        this.sessionWallets = new Map();
        this.historicalTrades = new Map();
        this.campaigns = [];
        this.settings = null;
        this._lastBlock = 31400000;
        // Load profiles from disk immediately on startup — this is the source of truth
        this._profiles = _loadProfilesFromDisk();
        console.warn('[Memory] Trade data will not persist across restarts (use Redis). Profiles are disk-persisted.');
        // After 5s, try to migrate any Redis-only profiles to disk (one-time sync)
        setTimeout(() => this._migrateRedisProfilesToDisk(), 5000);
    }

    async _migrateRedisProfilesToDisk() {
        if (!this.isCloud || !this.redis || this.redis.status !== 'ready') return;
        try {
            const data = await this.redis.hgetall('15market_profiles');
            if (!data) return;
            let added = 0;
            Object.entries(data).forEach(([addr, raw]) => {
                try {
                    if (!this._profiles.has(addr)) {
                        this._profiles.set(addr, JSON.parse(raw));
                        added++;
                    }
                } catch (_) {}
            });
            if (added > 0) {
                _saveProfilesToDisk(this._profiles);
                console.log(`[Profiles] Migrated ${added} cloud profiles to disk.`);
            } else {
                console.log(`[Profiles] Disk is up-to-date with Redis (${this._profiles.size} profiles).`);
            }
        } catch (e) {
            console.error('[Profiles] Redis migration failed:', e.message);
        }
    }


    async setTrade(id, data) {
        try {
            if (this.isCloud && this.redis) {
                await this.redis.hset('15market_active_trades', id.toString(), JSON.stringify(data));
            } else {
                this._initMemory();
                this.activeTrades.set(id.toString(), { ...data, timestamp: Date.now() });
            }
        } catch (e) {
            console.error(`[Redis] setTrade failed for ${id}:`, e.message);
            // Emergency memory fallback
            this._initMemory();
            this.activeTrades.set(id.toString(), data);
        }
    }

    async getTrade(id) {
        try {
            if (this.isCloud && this.redis) {
                const data = await this.redis.hget('15market_active_trades', id.toString());
                return data ? JSON.parse(data) : null;
            }
        } catch (e) {
            console.error(`[Redis] getTrade failed for ${id}:`, e.message);
        }
        return this.activeTrades?.get(id.toString());
    }

    async delTrade(id) {
        try {
            if (this.isCloud && this.redis) {
                await this.redis.hdel('15market_active_trades', id.toString());
            }
        } catch (e) {
            console.error(`[Redis] delTrade failed for ${id}:`, e.message);
        }
        this.activeTrades?.delete(id.toString());
    }

    async getAllActiveTrades(filterSettling = false) {
        let trades = [];
        try {
            if (this.isCloud && this.redis) {
                const all = await this.redis.hvals('15market_active_trades');
                trades = all.map(t => JSON.parse(t));
            }
        } catch (e) {
            console.error('[Redis] getAllActiveTrades failed:', e.message);
        }

        // Merge with memory trades if any (In case of hybrid state)
        if (this.activeTrades) {
            trades = [...trades, ...Array.from(this.activeTrades?.values() || [])];
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
        if (this.isCloud && this.redis) {
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
        if (this.isCloud && this.redis) {
            await this.redis.del(key);
        } else if (this._memLocks) {
            this._memLocks.delete(id);
        }
    }

    // Historical Indexing
    async addHistoricalTrade(trade) {
        const id = trade.id.toString();
        const statusOrder = { 'WON': 3, 'LOST': 3, 'RESOLVING': 2, 'PENDING': 1, 'TIMEOUT': 0 };

        if (this.isCloud && this.redis) {
            try {
                const existingRaw = await this.redis.hget('15market_historical_trades', id);
                if (existingRaw) {
                    const existing = JSON.parse(existingRaw);
                    // Prevent downgrading status (e.g., WON -> PENDING)
                    const oldStatus = existing.status || 'PENDING';
                    const newStatus = trade.status || 'PENDING';
                    
                    if (statusOrder[oldStatus] > statusOrder[newStatus]) {
                        // Inherit old final status
                        trade.status = oldStatus;
                        if (existing.settlementPrice && !trade.settlementPrice) trade.settlementPrice = existing.settlementPrice;
                        if (existing.payout && !trade.payout) trade.payout = existing.payout;
                    }
                    await this.redis.hset('15market_historical_trades', id, JSON.stringify({ ...existing, ...trade }));
                } else {
                    await this.redis.hset('15market_historical_trades', id, JSON.stringify(trade));
                }
            } catch (e) {
                console.error(`[Redis] Failed to add historical trade ${id}:`, e.message);
            }
        } else {
            const existing = this.historicalTrades.get(id);
            if (existing) {
                const oldStatus = existing.status || 'PENDING';
                const newStatus = trade.status || 'PENDING';
                if (statusOrder[oldStatus] > statusOrder[newStatus]) {
                    trade.status = oldStatus;
                    if (existing.settlementPrice && !trade.settlementPrice) trade.settlementPrice = existing.settlementPrice;
                    if (existing.payout && !trade.payout) trade.payout = existing.payout;
                }
                this.historicalTrades.set(id, { ...existing, ...trade });
            } else {
                this.historicalTrades.set(id, trade);
            }
        }
    }

    async getFullHistory() {
        if (this.isCloud && this.redis) {
            try {
                const all = await this.redis.hvals('15market_historical_trades');
                const trades = all.map(t => JSON.parse(t));
                if (trades.length === 0) {
                    console.log("[Redis] History empty, backfiller may still be running.");
                }
                return trades;
            } catch (e) {
                console.error('[Redis] getFullHistory failed:', e.message);
                return [];
            }
        }
        return Array.from(this.historicalTrades?.values() || []);
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
        if (this.isCloud && this.redis && this.redis.status === 'ready') {
            try {
                const val = await this.redis.get('15market_last_scanned_block');
                if (val) this._lastBlock = parseInt(val);
            } catch (e) {
                console.warn('[Redis] syncLastBlock failed:', e.message);
            }
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

    async getBroadcast() {
        if (this.isCloud) {
            const data = await this.redis.get('15market_broadcast');
            return data ? JSON.parse(data) : null;
        }
        return this._broadcast || null;
    }

    async saveBroadcast(b) {
        if (this.isCloud) {
            await this.redis.set('15market_broadcast', JSON.stringify(b));
        } else {
            this._broadcast = b;
        }
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
        const addr = address.toLowerCase();
        const enriched = { ...profile, updatedAt: Date.now() };

        // 1. ALWAYS write to in-memory map first (instant reads)
        if (!this._profiles) this._profiles = _loadProfilesFromDisk();
        this._profiles.set(addr, enriched);

        // 2. ALWAYS persist to disk (survives server restarts & Redis outages)
        _saveProfilesToDisk(this._profiles);

        // 3. ALSO write to Redis if available (for multi-instance sync)
        try {
            if (this.isCloud && this.redis && this.redis.status === 'ready') {
                await this.redis.hset('15market_profiles', addr, JSON.stringify(enriched));
            }
        } catch (e) {
            console.error(`[Redis] saveProfile to cloud failed for ${addr}:`, e.message);
            // Disk already saved above — this is non-fatal
        }

        console.log(`[Profiles] Saved profile for ${addr} (username: ${enriched.username})`);
    }

    async getProfile(address) {
        const addr = address.toLowerCase();

        // 1. Check in-memory first (fastest, loaded from disk on startup)
        if (!this._profiles) this._profiles = _loadProfilesFromDisk();
        const memProfile = this._profiles.get(addr);
        if (memProfile) return memProfile;

        // 2. If not found in memory, try Redis (in case of cloud-only write)
        try {
            if (this.isCloud && this.redis && this.redis.status === 'ready') {
                const data = await this.redis.hget('15market_profiles', addr);
                if (data) {
                    const parsed = JSON.parse(data);
                    // Backfill to memory & disk for next time
                    this._profiles.set(addr, parsed);
                    _saveProfilesToDisk(this._profiles);
                    return parsed;
                }
            }
        } catch (e) {
            console.error(`[Redis] getProfile from cloud failed for ${addr}:`, e.message);
        }

        return null;
    }

    async getAllProfiles() {
        // Merge disk profiles with Redis if available
        if (!this._profiles) this._profiles = _loadProfilesFromDisk();
        const merged = new Map(this._profiles);

        try {
            if (this.isCloud && this.redis && this.redis.status === 'ready') {
                const data = await this.redis.hgetall('15market_profiles');
                if (data) {
                    Object.entries(data).forEach(([k, v]) => {
                        try { if (!merged.has(k)) merged.set(k, JSON.parse(v)); } catch (_) {}
                    });
                }
            }
        } catch (e) { /* fallback to disk is fine */ }

        return Array.from(merged.values());
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

    // ─── CAMPAIGN MANAGEMENT ──────────────────────────────────────────────────

    async saveCampaigns(campaigns) {
        if (this.isCloud) {
            await this.redis.set('15market_campaigns', JSON.stringify(campaigns));
        } else {
            this._campaigns = campaigns;
        }
    }

    async getCampaigns() {
        if (this.isCloud) {
            const data = await this.redis.get('15market_campaigns');
            return data ? JSON.parse(data) : [];
        }
        return this._campaigns || [];
    }

    async saveWinnerBanner(banner) {
        if (this.isCloud) {
            await this.redis.set('15market_winner_banner', JSON.stringify(banner));
        } else {
            this._winnerBanner = banner;
        }
    }

    async getWinnerBanner() {
        if (this.isCloud) {
            const data = await this.redis.get('15market_winner_banner');
            return data ? JSON.parse(data) : null;
        }
        return this._winnerBanner || null;
    }

    async enrollUser(campaignId, address) {
        const key = `campaign:enrollments:${campaignId}`;
        if (this.isCloud) {
            await this.redis.sadd(key, address.toLowerCase());
        } else {
            if (!this._enrollments) this._enrollments = new Map();
            if (!this._enrollments.has(campaignId)) this._enrollments.set(campaignId, new Set());
            this._enrollments.get(campaignId).add(address.toLowerCase());
        }
    }

    async getEnrollmentCount(campaignId) {
        const key = `campaign:enrollments:${campaignId}`;
        if (this.isCloud) {
            return await this.redis.scard(key);
        }
        return this._enrollments?.get(campaignId)?.size || 0;
    }

    async isUserEnrolled(campaignId, address) {
        const key = `campaign:enrollments:${campaignId}`;
        if (this.isCloud) {
            const res = await this.redis.sismember(key, address.toLowerCase());
            return res === 1;
        }
        return this._enrollments?.get(campaignId)?.has(address.toLowerCase()) || false;
    }

    async getEnrolledUsers(campaignId) {
        const key = `campaign:enrollments:${campaignId}`;
        if (this.isCloud) {
            return await this.redis.smembers(key);
        }
        return Array.from(this._enrollments?.get(campaignId) || []);
    }

    async saveToDisk() { }
    async syncFromRedis() { }
}

const store = new RedisStore();
if (store.isCloud) {
    store.syncLastBlock().catch(e => {
        console.warn('[Redis] Initial sync deferred until connection is ready.');
    });
}

module.exports = store;


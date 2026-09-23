const Redis = require('ioredis');
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'profiles.json');

// Ensure data directory exists
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) { }

// Ensure we don't block startup but sync as soon as possible
// Configured to retry connecting every 30 seconds if offline, with offline queue disabled to prevent clog
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: (times) => {
        if (times === 1) console.warn(`[Redis] Connection failed. Retrying in 30 seconds...`);
        return 30000; // 30 seconds
    }
});

let redisReady = false;
redis.on('ready', () => { redisReady = true; });
redis.on('error', (err) => { 
    redisReady = false;
    // Suppress noisy/recoverable connection errors
    if (!err.message.includes('Stream isn\'t writeable') && !err.message.includes('ENOTFOUND') && !err.message.includes('ETIMEDOUT') && !err.message.includes('ECONNRESET')) {
        console.error('[Redis-Error]', err.message);
    }
});
redis.on('close', () => { redisReady = false; });

// ─── Supabase (durable user profile store) ────────────────────
// Profiles are written through to Supabase so they survive backend
// restarts (Redis/file can be wiped). In-memory cache stays the hot
// path; file + Redis remain as local backups.
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_ENABLED = !!(SUPABASE_URL && SUPABASE_KEY);

function supabaseHeaders() {
    return {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
    };
}

// jsonb/text columns can arrive as JSON strings or as native values.
function parseJsonField(v) {
    if (typeof v === 'string' && (v.trim().startsWith('{') || v.trim().startsWith('['))) {
        try { return JSON.parse(v); } catch (e) { return v; }
    }
    return v;
}

// Map in-memory camelCase profile -> Supabase snake_case row.
// Undefined keys are dropped (JSON.stringify) so absent fields do not
// overwrite existing column values on merge-upserts.
function profileToRow(profile, includeTrades) {
    const row = {
        address: profile.address,
        username: profile.username ?? null,
        x_handle: profile.xHandle ?? null,
        x_id: profile.xId ?? null,
        x_connected: profile.xConnected ?? false,
        avatar: profile.avatar ?? null,
        email: profile.email ?? null,
        email_verified: profile.emailVerified ?? false,
        verified_email: profile.verifiedEmail ?? null,
        discord: profile.discord ?? null,
        balance: profile.balance ?? 0,
        solana_wallet: (typeof profile.solanaWallet === 'object' && profile.solanaWallet)
            ? JSON.stringify(profile.solanaWallet) : (profile.solanaWallet ?? null),
        copy_trading_wallet: (typeof profile.copyTradingWallet === 'object' && profile.copyTradingWallet)
            ? JSON.stringify(profile.copyTradingWallet) : (profile.copyTradingWallet ?? null),
        copy_trading_allocated: profile.copyTradingAllocated ?? 0,
        copy_trading_pnl: profile.copyTradingPnl ?? 0,
        active_copies: profile.activeCopies ?? [],
        access_code: profile.accessCode ?? null,
        waitlist_status: profile.waitlistStatus ?? 'pending',
        // applied_at is a bigint column (unix ms), unlike the timestamptz audit columns.
        applied_at: profile.appliedAt != null ? (typeof profile.appliedAt === 'number' ? profile.appliedAt : (Number.isFinite(Date.parse(profile.appliedAt)) ? Date.parse(profile.appliedAt) : profile.appliedAt)) : null,
        is_provider: profile.isProvider ?? false,
        provider_application: profile.providerApplication ?? null,
        provider_stats: profile.providerStats ?? null,
        provider_portfolio_wallet: profile.providerPortfolioWallet ?? null,
        pending_portfolio_revenue: profile.pendingPortfolioRevenue ?? 0,
        trading_wallet: profile.tradingWallet ?? null,
        wallet_address: profile.walletAddress ?? null,
        updated_at: new Date().toISOString()
    };
    // Optional columns (added via supabase-migration.sql). Only sent when
    // the columns actually exist on the table.
    if (includeTrades) {
        if (Array.isArray(profile.trades)) row.trades = profile.trades;
        if (Array.isArray(profile.copyTrades)) row.copy_trades = profile.copyTrades;
    }
    return row;
}

// Map Supabase row -> in-memory camelCase profile.
function rowToProfile(row) {
    const p = {
        address: row.address,
        username: row.username,
        xHandle: row.x_handle,
        xId: row.x_id,
        xConnected: row.x_connected,
        avatar: row.avatar,
        email: row.email,
        emailVerified: row.email_verified,
        verifiedEmail: row.verified_email,
        discord: row.discord,
        balance: row.balance != null ? Number(row.balance) : undefined,
        solanaWallet: parseJsonField(row.solana_wallet),
        copyTradingWallet: parseJsonField(row.copy_trading_wallet),
        copyTradingAllocated: row.copy_trading_allocated != null ? Number(row.copy_trading_allocated) : undefined,
        copyTradingPnl: row.copy_trading_pnl != null ? Number(row.copy_trading_pnl) : undefined,
        activeCopies: row.active_copies,
        accessCode: row.access_code,
        waitlistStatus: row.waitlist_status,
        appliedAt: typeof row.applied_at === 'number' ? row.applied_at : (row.applied_at ? Date.parse(row.applied_at) : undefined),
        isProvider: row.is_provider,
        providerApplication: parseJsonField(row.provider_application),
        providerStats: parseJsonField(row.provider_stats),
        providerPortfolioWallet: row.provider_portfolio_wallet,
        pendingPortfolioRevenue: row.pending_portfolio_revenue != null ? Number(row.pending_portfolio_revenue) : undefined,
        tradingWallet: row.trading_wallet,
        walletAddress: row.wallet_address,
        createdAt: row.created_at ? Date.parse(row.created_at) : undefined,
        updatedAt: row.updated_at ? Date.parse(row.updated_at) : undefined
    };
    // Optional columns (present once added to the table).
    if (row.trades !== undefined) p.trades = row.trades;
    if (row.copy_trades !== undefined) p.copyTrades = row.copy_trades;
    return p;
}

class ProfileService {
    constructor() {
        this.profiles = {};
        this.sbFullPayload = true;       // false once optional columns are known to be missing
        this.sbColumnsProbed = false;
        this.sbInitPromise = null;
        this.sbLoggedDisabled = false;

        // Load from file first (survives Redis wipes)
        this.loadFromFile();

        // Then try Redis
        this.load();

        // Then Supabase (durable store): load + one-time local→Supabase migration.
        this.initSupabase();

        // When Redis is fully authenticated and ready to execute commands
        redis.on('ready', async () => {
            redisReady = true;
            console.log('[Redis] Connected and ready.');
            if (Object.keys(this.profiles).length === 0) {
                console.log('[Redis] Local cache is empty. Fetching profiles from Redis...');
                await this.load();
                // If Redis also empty, file was already loaded
                if (Object.keys(this.profiles).length > 0) {
                    console.log(`[Profiles] Restored ${Object.keys(this.profiles).length} profiles.`);
                }
            } else {
                console.log('[Redis] Syncing local profiles to Redis...');
                await this.save();
            }
            await this.initSupabase(); // idempotent — also covers late Redis merges
        });

        // Sync to Redis periodically in background
        setInterval(() => this.save(), 10000);
    }

    // ── Supabase durability layer ──────────────────────────────
    async initSupabase() {
        if (!SUPABASE_ENABLED) {
            if (!this.sbLoggedDisabled) {
                console.log('[Supabase] Disabled — set SUPABASE_URL + SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY) to persist profiles across restarts.');
                this.sbLoggedDisabled = true;
            }
            return;
        }
        if (this.sbInitPromise) return this.sbInitPromise;
        this.sbInitPromise = (async () => {
            await this.probeSupabaseColumns();
            await this.loadFromSupabase();
            await this.migrateLocalToSupabase();
        })().catch(e => console.warn('[Supabase] Init failed:', e.message));
        return this.sbInitPromise;
    }

    async probeSupabaseColumns() {
        if (this.sbColumnsProbed) return;
        this.sbColumnsProbed = true;
        try {
            const res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=trades,copy_trades&limit=1`, { headers: supabaseHeaders() });
            this.sbFullPayload = res.ok; // 200 = columns exist; 400 (missing column) = slim payloads
            console.log(`[Supabase] Optional columns (trades/copy_trades): ${this.sbFullPayload ? 'present' : 'NOT present — run supabase-migration.sql to persist trade history'}`);
        } catch (e) {
            this.sbFullPayload = true;
            console.warn('[Supabase] Column probe failed:', e.message);
        }
    }

    async fetchSupabaseProfiles() {
        const url = `${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1000&offset=0`;
        const res = await fetch(url, { headers: supabaseHeaders() });
        if (!res.ok) throw new Error(`GET ${url} failed (${res.status})`);
        return await res.json();
    }

    async loadFromSupabase() {
        if (!SUPABASE_ENABLED) return 0;
        try {
            const rows = await this.fetchSupabaseProfiles();
            let merged = 0;
            for (const row of rows) {
                const addr = String(row.address || '').toLowerCase();
                if (!addr) continue;
                // Supabase values win; keep local-only fields (e.g. trades
                // when the optional columns aren't present yet).
                this.profiles[addr] = { ...(this.profiles[addr] || {}), ...rowToProfile(row), address: addr };
                merged++;
            }
            if (merged > 0) console.log(`[Supabase] Loaded ${merged} profile(s) into cache.`);
            return merged;
        } catch (e) {
            console.warn('[Supabase] Load failed — continuing with file/Redis backups:', e.message);
            return 0;
        }
    }

    async migrateLocalToSupabase() {
        try {
            const rows = await this.fetchSupabaseProfiles();
            const remote = new Set(rows.map(r => String(r.address || '').toLowerCase()).filter(Boolean));
            let migrated = 0;
            for (const addr of Object.keys(this.profiles)) {
                if (!remote.has(addr)) {
                    await this.syncToSupabase(addr);
                    migrated++;
                }
            }
            if (migrated > 0) console.log(`[Supabase] Migrated ${migrated} local profile(s) → Supabase.`);
        } catch (e) {
            console.warn('[Supabase] Initial migration failed:', e.message);
        }
    }

    async syncToSupabase(addr) {
        if (!SUPABASE_ENABLED) return;
        const profile = this.profiles[addr];
        if (!profile) return;
        try {
            let payload = profileToRow(profile, this.sbFullPayload !== false);
            let res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=address`, {
                method: 'POST',
                headers: supabaseHeaders(),
                body: JSON.stringify(payload)
            });
            // If the full payload is rejected (optional columns missing),
            // fall back to the slim schema payload once.
            if (!res.ok && this.sbFullPayload !== false) {
                this.sbFullPayload = false;
                console.log('[Supabase] Full payload rejected — switching to slim payload (run supabase-migration.sql to persist trade history).');
                payload = profileToRow(profile, false);
                res = await fetch(`${SUPABASE_URL}/rest/v1/profiles?on_conflict=address`, {
                    method: 'POST',
                    headers: supabaseHeaders(),
                    body: JSON.stringify(payload)
                });
            }
            if (!res.ok) {
                const body = await res.text().catch(() => '');
                console.warn(`[Supabase] Upsert failed for ${addr} (${res.status}):`, body.slice(0, 300));
            }
        } catch (e) {
            console.warn(`[Supabase] Upsert error for ${addr}:`, e.message);
        }
    }

    loadFromFile() {
        try {
            if (fs.existsSync(FILE_PATH)) {
                const data = fs.readFileSync(FILE_PATH, 'utf8');
                if (data) {
                    this.profiles = JSON.parse(data);
                    console.log(`[Profiles] Loaded ${Object.keys(this.profiles).length} profiles from file backup.`);
                }
            }
        } catch (e) {
            console.warn('[Profiles] Failed to load from file:', e.message);
        }
    }

    saveToFile() {
        try {
            if (Object.keys(this.profiles).length > 0) {
                fs.writeFileSync(FILE_PATH, JSON.stringify(this.profiles, null, 2));
            }
        } catch (e) {
            // Silently skip file write errors
        }
    }

    async load() {
        if (!redisReady) return;
        try {
            const data = await redis.get('15market_profiles_db');
            if (data) {
                const redisProfiles = JSON.parse(data);
                // Merge: Redis data takes precedence, but keep any file-only entries
                const redisCount = Object.keys(redisProfiles).length;
                const fileCount = Object.keys(this.profiles).length;
                this.profiles = { ...this.profiles, ...redisProfiles };
                const mergedCount = Object.keys(this.profiles).length;
                console.log(`[Profiles] Loaded ${redisCount} from Redis, merged with ${fileCount} from file = ${mergedCount} total.`);
            } else {
                console.log(`[Profiles] No profiles in Redis. Using file backup (${Object.keys(this.profiles).length} profiles).`);
            }
        } catch (e) {
            // Silently skip when Redis is unavailable
        }
    }

    async save() {
        // Always save to file (survives Redis wipes)
        this.saveToFile();

        if (!redisReady) return;
        try {
            if (Object.keys(this.profiles).length > 0) {
                await redis.set('15market_profiles_db', JSON.stringify(this.profiles));
            }
        } catch (e) {
            // Silently skip when Redis is unavailable
        }
    }

    get(address) {
        return this.profiles[address.toLowerCase()];
    }

    getAll() {
        return this.profiles;
    }

    upsert(address, data) {
        const addr = address.toLowerCase();
        this.profiles[addr] = {
            ...(this.profiles[addr] || {}),
            ...data,
            address: addr,
            updatedAt: Date.now()
        };
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return this.profiles[addr];
    }

    pushTrade(address, trade) {
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) {
            this.profiles[addr] = { address: addr, trades: [], createdAt: Date.now() };
        }
        if (!this.profiles[addr].trades) {
            this.profiles[addr].trades = [];
        }

        // Ensure trade has correct status and winning flag
        const record = {
            ...trade,
            status: trade.status || (trade.won ? 'WON' : 'LOST'),
            timestamp: trade.timestamp || Date.now()
        };

        // Limit to 100 trades and prevent duplicates
        const tradeId = String(record.betId || record.id);
        const exists = this.profiles[addr].trades.some(t => String(t.betId || t.id) === tradeId);

        if (!exists) {
            this.profiles[addr].trades.unshift(record);
            if (this.profiles[addr].trades.length > 100) {
                this.profiles[addr].trades = this.profiles[addr].trades.slice(0, 100);
            }
        } else {
            // Update existing trade record if it's already there (to capture status updates)
            const idx = this.profiles[addr].trades.findIndex(t => String(t.betId || t.id) === tradeId);
            this.profiles[addr].trades[idx] = { ...this.profiles[addr].trades[idx], ...record };
        }

        this.profiles[addr].updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return record;
    }

    updateTrade(address, betId, updates) {
        const addr = address.toLowerCase();
        const profile = this.profiles[addr];
        if (!profile || !profile.trades) return false;

        const tradeIdx = profile.trades.findIndex(t => String(t.betId || t.id) === String(betId));
        if (tradeIdx === -1) return false;

        profile.trades[tradeIdx] = {
            ...profile.trades[tradeIdx],
            ...updates
        };

        profile.updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return true;
    }

    getHistory(address) {
        const profile = this.get(address);
        return profile ? (profile.trades || []) : [];
    }

    pushCopyTrade(address, trade) {
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) {
            this.profiles[addr] = { address: addr, copyTrades: [], createdAt: Date.now() };
        }
        if (!this.profiles[addr].copyTrades) {
            this.profiles[addr].copyTrades = [];
        }

        const record = {
            id: trade.id || `ct-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
            providerAddress: trade.providerAddress?.toLowerCase() || '',
            providerName: trade.providerName || '',
            asset: trade.asset || '',
            direction: trade.direction || 'UP',
            result: trade.result || 'PENDING',
            amount: trade.amount || 0,
            providerTradeId: trade.providerTradeId || '',
            payout: trade.payout || 0,
            settledAt: trade.settledAt || 0,
            timestamp: trade.timestamp || Date.now()
        };

        this.profiles[addr].copyTrades.unshift(record);
        if (this.profiles[addr].copyTrades.length > 200) {
            this.profiles[addr].copyTrades = this.profiles[addr].copyTrades.slice(0, 200);
        }

        this.profiles[addr].updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        this.syncToSupabase(addr).catch(() => {});
        return record;
    }

    getCopyTrades(address) {
        const profile = this.get(address);
        return profile ? (profile.copyTrades || []) : [];
    }

    getProfileStats(address) {
        const trades = this.getHistory(address);
        let totalWins = 0;
        let totalVolume = 0;

        trades.forEach(t => {
            if (t.won || t.status === 'WON') totalWins++;
            totalVolume += parseFloat(t.amount || 0);
        });

        return {
            totalTrades: trades.length,
            totalWins,
            totalVolume
        };
    }

    getGlobalStats() {
        let bulls = 0;
        let bears = 0;
        let totalStake = 0;
        let vol = 0;
        let totalWins = 0;
        let totalTrades = 0;
        let allTrades = [];

        let totalRevenue = 0;
        for (const addr in this.profiles) {
            const history = this.profiles[addr].trades || [];
            totalTrades += history.length;

            for (const trade of history) {
                const amt = parseFloat(trade.amount || 0);
                const fee = parseFloat(trade.fee || 0);
                if (String(trade.direction).toUpperCase().includes("UP") || trade.direction === 1) bulls++;
                else bears++;

                totalStake += amt;
                vol += amt;
                totalRevenue += fee;
                if (trade.won || trade.status === 'WON') totalWins++;

                allTrades.push(trade);
            }
        }

        const total = bulls + bears;

        allTrades.sort((a, b) => (b.timestamp || b.settledAt || 0) - (a.timestamp || a.settledAt || 0));

        return {
            bullBearRatio: total > 0 ? Math.round((bulls / total) * 100) : 50,
            sentiment: total > 0 ? (bulls > bears ? 'BULLISH' : bulls < bears ? 'BEARISH' : 'NEUTRAL') : 'NEUTRAL',
            avgStake: total > 0 ? (totalStake / total).toFixed(2) : '0.00',
            totalVolume: vol.toFixed(2),
            platformRevenue: totalRevenue.toFixed(6),
            activeTraders: Object.keys(this.profiles).length,
            globalWinRate: totalTrades > 0 ? ((totalWins / totalTrades) * 100).toFixed(1) : '0.0',
            totalTrades,
            recentTrades: allTrades.slice(0, 50),
            bullsInfo: bulls,
            bearsInfo: bears
        };
    }
}

module.exports = new ProfileService();

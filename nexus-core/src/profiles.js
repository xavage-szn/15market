const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const FILE_PATH = path.join(DATA_DIR, 'profiles.json');

// Ensure data directory exists
try {
    if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
} catch (e) { }

// ─── Persistence model ─────────────────────────────────────────
// Memory  = hot cache (authoritative at runtime).
// Supabase = durable store of record (survives restarts / disk wipes).
// File    = local fallback snapshot only (loaded when Supabase is
//           unreachable or empty; written as a safety net).
// Redis is NOT used for profiles anymore — it was duplicating the
// whole user DB (incl. wallet private keys). It stays reserved for
// genuine cache/pub-sub needs elsewhere (trade results, charts, prices).
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

const supabaseRequest = async (path, options = {}) => {
    const { timeout = 8000, ...fetchOptions } = options;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
        return await fetch(`${SUPABASE_URL}${path}`, {
            ...fetchOptions,
            signal: controller.signal,
            headers: { ...supabaseHeaders(), ...(fetchOptions.headers || {}) }
        });
    } finally {
        clearTimeout(timer);
    }
};

function normalizeStoredTrade(trade) {
    const normalized = { ...trade };
    for (const [key, value] of Object.entries(normalized)) {
        if (typeof value === 'bigint') normalized[key] = value.toString();
    }
    return normalized;
}

function tradeToSupabaseRow(address, trade) {
    const status = trade.status || (trade.won ? 'WON' : 'LOST');
    const direction = trade.direction === 1 || String(trade.direction).toUpperCase() === '1' || String(trade.direction).toUpperCase() === 'UP'
        ? 'UP'
        : 'DOWN';
    return {
        id: String(trade.betId || trade.id),
        user_address: address.toLowerCase(),
        symbol: String(trade.symbol || trade.asset || '').toLowerCase(),
        direction,
        amount: Number(trade.amount || 0),
        entry_price: trade.entryPrice ?? null,
        exit_price: trade.exitPrice ?? trade.settlementPrice ?? null,
        duration: trade.duration ?? null,
        status,
        won: !!(trade.won || ['WON', 'PAID'].includes(status)),
        payout: Number(trade.payout || trade.payoutAmount || 0),
        fee: Number(trade.fee || 0),
        pnl: Number(trade.pnl || trade.profit || 0),
        tx_hash: trade.txHash || trade.tx || null,
        stake_tx_hash: trade.stakeTxHash || trade.tx || null,
        settlement_tx_hash: trade.settlementTxHash || null,
        settled_at: trade.settledAt || null,
        timestamp: trade.timestamp || trade.createdAt || Date.now(),
        raw_data: normalizeStoredTrade(trade)
    };
}

function tradeStatusRank(status) {
    return {
        PENDING: 1,
        RESOLVING: 2,
        WON: 3,
        LOST: 3,
        PAID: 4,
        PAYOUT_FAILED: 4,
        CANCELLED: 4
    }[status] || 0;
}

function supabaseTradeToRecord(row) {
    const parsed = parseJsonField(row.raw_data);
    const raw = parsed && typeof parsed === 'object' ? parsed : {};
    return {
        ...raw,
        id: String(row.id),
        betId: String(row.id),
        userAddr: row.user_address || raw.userAddr,
        symbol: String(row.symbol || raw.symbol || '').toUpperCase(),
        direction: row.direction || raw.direction,
        amount: Number(row.amount ?? raw.amount ?? 0),
        entryPrice: row.entry_price != null ? Number(row.entry_price) : raw.entryPrice,
        exitPrice: row.exit_price != null ? Number(row.exit_price) : raw.exitPrice,
        duration: row.duration ?? raw.duration,
        status: row.status || raw.status,
        won: row.won ?? raw.won,
        payout: Number(row.payout ?? raw.payout ?? 0),
        fee: Number(row.fee ?? raw.fee ?? 0),
        pnl: Number(row.pnl ?? raw.pnl ?? 0),
        txHash: row.tx_hash || raw.txHash || raw.tx,
        stakeTxHash: row.stake_tx_hash || raw.stakeTxHash,
        settlementTxHash: row.settlement_tx_hash || raw.settlementTxHash,
        settledAt: row.settled_at || raw.settledAt,
        timestamp: Number(row.timestamp || raw.timestamp || 0)
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
function profileToRow(profile, includeTrades, includeOnboarding = true) {
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
    if (includeOnboarding) {
        row.onboarded = profile.onboarded === true || !!profile.onboardedAt || !!profile.username;
        row.onboarded_at = profile.onboardedAt != null
            ? (typeof profile.onboardedAt === 'number' ? profile.onboardedAt : Date.parse(profile.onboardedAt))
            : null;
    }
    // Optional columns (added via supabase-migration.sql). Only sent when
    // the columns actually exist on the table.
    if (includeTrades) {
        if (Array.isArray(profile.trades)) row.trades = profile.trades.map(normalizeStoredTrade);
        if (Array.isArray(profile.copyTrades)) row.copy_trades = profile.copyTrades;
    }
    return row;
}

// Map Supabase row -> in-memory camelCase profile.
function rowToProfile(row) {
    const onboardedAt = typeof row.onboarded_at === 'number'
        ? row.onboarded_at
        : (row.onboarded_at ? Date.parse(row.onboarded_at) : undefined);
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
        onboarded: row.onboarded === true || onboardedAt != null || !!row.username,
        onboardedAt,
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
        this.sbTradeTableAvailable = null;
        this.sbInitPromise = null;
        this.sbLoggedDisabled = false;

        // Load from file first (local fallback snapshot)
        this.loadFromFile();

        // Then Supabase (durable store): load + one-time local→Supabase migration.
        this.initSupabase();

        // Periodic local fallback snapshot (file only — Redis is not used for profiles).
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
            await this.probeSupabaseTradeTable();
            await this.loadFromSupabase();
            await this.migrateLocalToSupabase();
        })().catch(e => console.warn('[Supabase] Init failed:', e.message));
        return this.sbInitPromise;
    }

    async probeSupabaseColumns() {
        if (this.sbColumnsProbed) return;
        this.sbColumnsProbed = true;
        try {
            const res = await supabaseRequest('/rest/v1/profiles?select=trades,copy_trades&limit=1');
            this.sbFullPayload = res.ok; // 200 = columns exist; 400 (missing column) = slim payloads
            console.log(`[Supabase] Optional columns (trades/copy_trades): ${this.sbFullPayload ? 'present' : 'NOT present — run supabase-migration.sql to persist trade history'}`);
        } catch (e) {
            this.sbFullPayload = true;
            console.warn('[Supabase] Column probe failed:', e.message);
        }
    }

    async probeSupabaseTradeTable() {
        if (!SUPABASE_ENABLED || this.sbTradeTableAvailable !== null) return;
        try {
            const res = await supabaseRequest('/rest/v1/trades?select=id&limit=1');
            this.sbTradeTableAvailable = res.ok;
            if (!res.ok) {
                console.warn('[Supabase] Trades table unavailable — history will use the local fallback until the migration is applied.');
            }
        } catch (e) {
            this.sbTradeTableAvailable = false;
            console.warn('[Supabase] Trades table probe failed:', e.message);
        }
    }

    async fetchSupabaseProfiles() {
        const url = `${SUPABASE_URL}/rest/v1/profiles?select=*&limit=1000&offset=0`;
        const res = await supabaseRequest('/rest/v1/profiles?select=*&limit=1000&offset=0');
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
            console.warn('[Supabase] Load failed — continuing with file fallback:', e.message);
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

            if (this.sbTradeTableAvailable) {
                let migratedTrades = 0;
                for (const addr of Object.keys(this.profiles)) {
                    const trades = this.profiles[addr].trades || [];
                    for (const trade of trades) {
                        if (await this.persistTradeToSupabase(addr, trade, true)) migratedTrades++;
                    }
                }
                if (migratedTrades > 0) console.log(`[Supabase] Migrated ${migratedTrades} local trade(s) → Supabase.`);
            }
        } catch (e) {
            console.warn('[Supabase] Initial migration failed:', e.message);
        }
    }

    async syncToSupabase(addr) {
        if (!SUPABASE_ENABLED) return false;
        const profile = this.profiles[addr];
        if (!profile) return false;

        const attempts = [
            profileToRow(profile, this.sbFullPayload !== false, true),
            profileToRow(profile, false, true),
            profileToRow(profile, false, false)
        ];
        let lastError = '';
        for (let i = 0; i < attempts.length; i++) {
            try {
                const res = await supabaseRequest('/rest/v1/profiles?on_conflict=address', {
                    method: 'POST',
                    body: JSON.stringify(attempts[i])
                });
                if (res.ok) return true;
                if (i === 0 && this.sbFullPayload !== false) this.sbFullPayload = false;
                lastError = `${res.status} ${await res.text().catch(() => '')}`.slice(0, 300);
            } catch (e) {
                lastError = e.message;
            }
        }
        console.warn(`[Supabase] Upsert failed for ${addr}: ${lastError}`);
        return false;
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

    async save() {
        // Local fallback snapshot only — Supabase is the durable store of record.
        this.saveToFile();
    }

    get(address) {
        return this.profiles[address.toLowerCase()];
    }

    async getAsync(address) {
        await this.initSupabase();
        return this.get(address);
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

    async getHistoryAsync(address) {
        const addr = address.toLowerCase();
        await this.initSupabase();
        if (!this.sbTradeTableAvailable) return this.getHistory(addr);

        try {
            const res = await supabaseRequest(`/rest/v1/trades?select=*&user_address=eq.${encodeURIComponent(addr)}&order=timestamp.desc&limit=100`);
            if (!res.ok) {
                if (res.status >= 400 && res.status < 500) this.sbTradeTableAvailable = false;
                return this.getHistory(addr);
            }
            const rows = await res.json();
            const byId = new Map();
            for (const trade of (rows || []).map(supabaseTradeToRecord)) {
                const key = String(trade.id || trade.betId || '');
                if (key) byId.set(key, trade);
            }
            for (const trade of this.getHistory(addr)) {
                const key = String(trade.id || trade.betId || '');
                if (!key) continue;
                const remote = byId.get(key);
                const localRank = tradeStatusRank(trade.status);
                const remoteRank = tradeStatusRank(remote?.status);
                const localTime = Number(trade.settledAt || trade.timestamp || 0);
                const remoteTime = Number(remote?.settledAt || remote?.timestamp || 0);
                if (!remote || localRank > remoteRank || (localRank === remoteRank && localTime >= remoteTime)) {
                    byId.set(key, trade);
                }
            }
            const trades = Array.from(byId.values())
                .sort((a, b) => (b.timestamp || b.settledAt || 0) - (a.timestamp || a.settledAt || 0))
                .slice(0, 100);
            this.profiles[addr] = {
                ...(this.profiles[addr] || { address: addr }),
                trades
            };
            return trades;
        } catch (e) {
            console.warn(`[Supabase] History read failed for ${addr}:`, e.message);
            return this.getHistory(addr);
        }
    }

    async persistTradeToSupabase(address, trade, skipInit = false) {
        if (!SUPABASE_ENABLED) return false;
        if (!skipInit) await this.initSupabase();
        if (!this.sbTradeTableAvailable) return false;
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) return false;
        if (!(await this.syncToSupabase(addr))) return false;

        try {
            const res = await supabaseRequest('/rest/v1/trades?on_conflict=id', {
                method: 'POST',
                headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(tradeToSupabaseRow(addr, trade))
            });
            if (!res.ok) {
                console.warn(`[Supabase] Trade upsert failed for ${addr}: ${res.status} ${await res.text().catch(() => '')}`.slice(0, 350));
                return false;
            }
            return true;
        } catch (e) {
            console.warn(`[Supabase] Trade upsert error for ${addr}:`, e.message);
            return false;
        }
    }

    pushTrade(address, trade) {
        const addr = address.toLowerCase();
        if (!this.profiles[addr]) {
            this.profiles[addr] = { address: addr, trades: [], createdAt: Date.now() };
        }
        if (!this.profiles[addr].trades) {
            this.profiles[addr].trades = [];
        }

        const tradeId = String(trade.betId || trade.id || `${trade.type || 'record'}-${trade.timestamp || Date.now()}-${addr.slice(-8)}`);
        const record = normalizeStoredTrade({
            ...trade,
            id: trade.id || tradeId,
            betId: trade.betId || tradeId,
            status: trade.status || (trade.won ? 'WON' : 'LOST'),
            timestamp: trade.timestamp || Date.now()
        });
        const exists = this.profiles[addr].trades.some(t => String(t.betId || t.id) === tradeId);

        if (!exists) {
            this.profiles[addr].trades.unshift(record);
            if (this.profiles[addr].trades.length > 100) {
                this.profiles[addr].trades = this.profiles[addr].trades.slice(0, 100);
            }
        } else {
            const idx = this.profiles[addr].trades.findIndex(t => String(t.betId || t.id) === tradeId);
            this.profiles[addr].trades[idx] = { ...this.profiles[addr].trades[idx], ...record };
        }

        this.profiles[addr].updatedAt = Date.now();
        this.save().catch(e => console.warn('[Profiles] Background save failed:', e.message));
        return this.persistTradeToSupabase(addr, record)
            .catch(e => {
                console.warn(`[Supabase] Trade persistence failed for ${addr}:`, e.message);
                return false;
            })
            .then(() => record);
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
        this.persistTradeToSupabase(addr, profile.trades[tradeIdx]).catch(() => {});
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

    getProfileStats(address, history = null) {
        const trades = history || this.getHistory(address);
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

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

class ProfileService {
    constructor() {
        this.profiles = {};

        // Load from file first (survives Redis wipes)
        this.loadFromFile();

        // Then try Redis
        this.load();

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
        });

        // Sync to Redis periodically in background
        setInterval(() => this.save(), 10000);
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

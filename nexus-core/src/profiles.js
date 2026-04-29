const Redis = require('ioredis');

// Ensure we don't block startup but sync as soon as possible
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

class ProfileService {
    constructor() {
        this.profiles = {};
        this.load();
        
        // Sync to Redis periodically instead of blocking
        setInterval(() => this.save(), 5000);
    }

    async load() {
        try {
            const data = await redis.get('15market_profiles_db');
            if (data) {
                this.profiles = JSON.parse(data);
                console.log(`[Profiles] Loaded ${Object.keys(this.profiles).length} profiles from Redis.`);
            } else {
                console.log(`[Profiles] No existing profiles found in Redis. Starting fresh.`);
            }
        } catch (e) {
            console.error("Failed to load profiles from Redis:", e);
        }
    }

    async save() {
        try {
            // Only save if there are profiles to prevent overwriting with empty
            if (Object.keys(this.profiles).length > 0) {
                await redis.set('15market_profiles_db', JSON.stringify(this.profiles));
            }
        } catch (e) {
            console.error("Failed to save profiles to Redis:", e);
        }
    }

    get(address) {
        return this.profiles[address.toLowerCase()];
    }

    upsert(address, data) {
        const addr = address.toLowerCase();
        this.profiles[addr] = {
            ...(this.profiles[addr] || {}),
            ...data,
            address: addr,
            updatedAt: Date.now()
        };
        this.save();
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

        this.profiles[addr].trades.unshift(record);
        
        // Limit to 100 trades
        if (this.profiles[addr].trades.length > 100) {
            this.profiles[addr].trades = this.profiles[addr].trades.slice(0, 100);
        }
        
        this.profiles[addr].updatedAt = Date.now();
        this.save();
        return record;
    }

    getHistory(address) {
        const profile = this.get(address);
        return profile ? (profile.trades || []) : [];
    }
}

module.exports = new ProfileService();

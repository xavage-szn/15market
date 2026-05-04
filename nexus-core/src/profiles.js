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
        this.save();
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
        this.save();
        return true;
    }

    getHistory(address) {
        const profile = this.get(address);
        return profile ? (profile.trades || []) : [];
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

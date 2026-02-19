const Redis = require('ioredis');
require('dotenv').config();

class RedisService {
    constructor() {
        this.client = new Redis(process.env.REDIS_URL, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3
        });

        // Use a local Map for lightning-fast reads
        this.memoryCache = new Map();
        this.isInitialized = false;

        this.client.on('error', (err) => console.error('[Redis] ⚠️ Connection Error:', err.message));
        this.client.on('connect', () => {
            console.log('[Redis] ✅ Connected');
            this.syncFromRedis();
        });
    }

    async syncFromRedis() {
        try {
            // Sync active trades
            const keys = await this.client.keys('trade:*');
            if (keys.length > 0) {
                const trades = await this.client.mget(keys);
                trades.forEach((t, i) => {
                    if (t) {
                        const trade = JSON.parse(t);
                        this.memoryCache.set(keys[i].replace('trade:', ''), trade);
                    }
                });
            }

            // Sync global history
            const historyData = await this.client.get('global_history');
            this.historyCache = historyData ? JSON.parse(historyData) : [];

            this.isInitialized = true;
            console.log(`[Redis] 🏎️ Cache Synced: ${this.memoryCache.size} trades, ${this.historyCache.length} history items in RAM`);
        } catch (e) {
            console.warn('[Redis] Sync failed, using memory only:', e.message);
            this.historyCache = this.historyCache || [];
            this.isInitialized = true;
        }
    }

    async setTrade(betId, tradeData) {
        // Update RAM immediately (Speed!)
        this.memoryCache.set(betId.toString(), tradeData);
        // Persist to Redis (Safety)
        try {
            await this.client.set(`trade:${betId}`, JSON.stringify(tradeData));
        } catch (err) {
            console.error(`[Redis] ❌ Failed to set trade ${betId}:`, err.message);
        }
    }

    async getTrade(betId) {
        // Serve from RAM (Instant)
        return this.memoryCache.get(betId.toString()) || null;
    }

    async delTrade(betId) {
        this.memoryCache.delete(betId.toString());
        this.client.del(`trade:${betId}`).catch(() => { });
    }

    async getAllActiveTrades() {
        // Return from RAM (0ms latency)
        return Array.from(this.memoryCache.values());
    }

    async pushHistory(trade) {
        if (!this.historyCache) this.historyCache = [];

        // Normalize 'user' to 'owner' for frontend compatibility
        const normalizedTrade = {
            ...trade,
            owner: trade.owner || trade.user,
            timestamp: trade.timestamp || Date.now()
        };

        // Add to the beginning of the list
        this.historyCache.unshift(normalizedTrade);

        // Keep only top 100 items
        if (this.historyCache.length > 100) {
            this.historyCache = this.historyCache.slice(0, 100);
        }

        // Persist to Redis
        this.client.set('global_history', JSON.stringify(this.historyCache)).catch(() => { });
    }

    async getHistory() {
        if (!this.historyCache || this.historyCache.length === 0) {
            // Seed with realistic small-stake trades for the scroller
            return [
                { id: 'seed1', owner: '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C', amount: '2.50', direction: 'UP', symbol: 'BTC', status: 'WON', timestamp: Date.now() - 300000 },
                { id: 'seed2', owner: '0xE920de29a9E2285Ead0c443Fde3be493c470fa5c', amount: '0.10', direction: 'DOWN', symbol: 'ETH', status: 'LOST', timestamp: Date.now() - 600000 },
                { id: 'seed3', owner: '0x345014899b42bF9034D9475760609e64B1433A6a', amount: '5.00', direction: 'UP', symbol: 'SOL', status: 'WON', timestamp: Date.now() - 900000 },
                { id: 'seed4', owner: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F', amount: '1.00', direction: 'UP', symbol: 'BTC', status: 'WON', timestamp: Date.now() - 1200000 },
                { id: 'seed5', owner: '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C', amount: '0.50', direction: 'DOWN', symbol: 'ETH', status: 'LOST', timestamp: Date.now() - 1500000 }
            ];
        }
        return this.historyCache;
    }

    async saveProfile(address, profileData) {
        try {
            await this.client.set(`profile:${address.toLowerCase()}`, JSON.stringify(profileData));
            return true;
        } catch (e) {
            console.error(`[Redis] ❌ Failed to save profile for ${address}:`, e.message);
            return false;
        }
    }

    async getProfile(address) {
        try {
            const data = await this.client.get(`profile:${address.toLowerCase()}`);
            return data ? JSON.parse(data) : null;
        } catch (e) {
            console.error(`[Redis] ❌ Failed to get profile for ${address}:`, e.message);
            return null;
        }
    }
}

module.exports = new RedisService();

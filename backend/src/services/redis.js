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
            console.log('[Redis] 🔃 Syncing from Redis...');
            // Clear RAM cache to ensure consistency with Redis state
            this.memoryCache.clear();

            // Sync active trades
            const keys = await this.client.keys('trade:*');
            if (keys.length > 0) {
                const trades = await this.client.mget(keys);
                trades.forEach((t, i) => {
                    if (t) {
                        try {
                            const trade = JSON.parse(t);
                            this.memoryCache.set(keys[i].replace('trade:', ''), trade);
                        } catch (e) { }
                    }
                });
            }

            // Sync global history
            const historyData = await this.client.get('global_history');
            this.historyCache = historyData ? JSON.parse(historyData) : [];

            this.isInitialized = true;
            console.log(`[Redis] 🏎️ Cache Synced: ${this.memoryCache.size} active trades, ${this.historyCache.length} history items in RAM`);
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

        // 🛑 DEDUP: Remove existing entry with same ID before adding
        const tradeId = normalizedTrade.id || normalizedTrade.tx;
        if (tradeId) {
            this.historyCache = this.historyCache.filter(t => (t.id || t.tx) !== tradeId);
        }

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
            const addr = address.toLowerCase();
            await this.client.set(`profile:${addr}`, JSON.stringify(profileData));

            // If this profile has a session wallet, link it back to the main address
            // This allows the keeper to update the main profile when a session trade settles
            if (profileData.sessionWalletAddress) {
                const sessionAddr = profileData.sessionWalletAddress.toLowerCase();
                if (sessionAddr !== addr) {
                    await this.client.set(`session_to_main:${sessionAddr}`, addr);
                    console.log(`[Redis] 🔗 Linked session ${sessionAddr} to main ${addr}`);
                }
            }
            return true;
        } catch (e) {
            console.error(`[Redis] ❌ Failed to save profile for ${address}:`, e.message);
            return false;
        }
    }

    async getMainAddressForSession(sessionAddress) {
        try {
            return await this.client.get(`session_to_main:${sessionAddress.toLowerCase()}`);
        } catch (e) {
            return null;
        }
    }

    async getProfile(address) {
        try {
            const data = await this.client.get(`profile:${address.toLowerCase()}`);
            if (!data) return null;
            return JSON.parse(data);
        } catch (e) {
            console.error(`[Redis] ❌ Failed to get profile for ${address}:`, e.message);
            return null;
        }
    }

    async pushUserHistory(address, trade) {
        try {
            const key = `history:${address.toLowerCase()}`;
            const data = await this.client.get(key);
            let history = data ? JSON.parse(data) : [];

            // De-duplicate: if trade.id exists, update it or remove old one
            const tradeId = trade.id || trade.tx;
            if (tradeId) {
                // Filter out the old version if it exists
                history = history.filter(t => (t.id || t.tx) !== tradeId);
            }

            // Add to front (most recent)
            history.unshift(trade);

            // Keep last 50
            if (history.length > 50) history = history.slice(0, 50);

            await this.client.set(key, JSON.stringify(history));
        } catch (e) {
            console.error(`[Redis] ❌ Failed to push user history for ${address}:`, e.message);
        }
    }

    async pushUserTransaction(address, tx) {
        try {
            const key = `txs:${address.toLowerCase()}`;
            const data = await this.client.get(key);
            let txs = data ? JSON.parse(data) : [];

            txs.unshift(tx);
            if (txs.length > 50) txs = txs.slice(0, 50);

            await this.client.set(key, JSON.stringify(txs));
        } catch (e) {
            console.error(`[Redis] ❌ Failed to push user tx for ${address}:`, e.message);
        }
    }

    async getUserData(address) {
        try {
            const addr = address.toLowerCase();
            const profile = await this.getProfile(addr);

            // Collect all relevant addresses (main + session if exists)
            const addresses = [addr];
            if (profile && profile.sessionWalletAddress) {
                const sessionAddr = profile.sessionWalletAddress.toLowerCase();
                if (sessionAddr !== addr) {
                    addresses.push(sessionAddr);
                }
            }

            // Fetch history and txs for all linked addresses
            const historyPromises = addresses.map(a => this.client.get(`history:${a}`));
            const txsPromises = addresses.map(a => this.client.get(`txs:${a}`));

            const [historyData, txsData] = await Promise.all([
                Promise.all(historyPromises),
                Promise.all(txsPromises)
            ]);

            let allHistory = [];
            historyData.forEach(d => {
                if (d) {
                    try {
                        const parsed = JSON.parse(d);
                        if (Array.isArray(parsed)) allHistory = allHistory.concat(parsed);
                    } catch (e) { }
                }
            });

            let allTxs = [];
            txsData.forEach(d => {
                if (d) {
                    try {
                        const parsed = JSON.parse(d);
                        if (Array.isArray(parsed)) allTxs = allTxs.concat(parsed);
                    } catch (e) { }
                }
            });

            // De-duplicate and sort by timestamp
            const uniqueHistory = Array.from(new Map(allHistory.map(item => [item.id || item.tx, item])).values())
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 100);

            const uniqueTxs = Array.from(new Map(allTxs.map(item => [item.id || item.tx, item])).values())
                .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                .slice(0, 50);

            return {
                profile: profile || { address: addr, totalTrades: 0, totalWins: 0, totalLosses: 0, totalVolume: "0.00" },
                history: uniqueHistory,
                transactions: uniqueTxs
            };
        } catch (e) {
            console.error(`[Redis] ❌ Failed to get user data for ${address}:`, e.message);
            return null;
        }
    }
}

module.exports = new RedisService();

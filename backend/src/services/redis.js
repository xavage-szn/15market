const Redis = require('ioredis');
require('dotenv').config();

class RedisService {
    constructor() {
        this.client = new Redis(process.env.REDIS_URL, {
            retryStrategy: (times) => Math.min(times * 50, 2000),
            maxRetriesPerRequest: 3,
            // ===== CONNECTION POOL OPTIMIZATION =====
            enableReadyCheck: false,      // Skip CLUSTER INFO check
            lazyConnect: false,           // Connect immediately
            keepAlive: 10000,             // TCP keepalive every 10s
        });

        // Use a local Map for lightning-fast reads
        this.memoryCache = new Map();
        this.isInitialized = false;

        // ===== USER INDEX: Map user address -> Set of trade IDs =====
        // This avoids scanning ALL trades when querying per-user
        this.userTradeIndex = new Map();

        // ===== WRITE BATCHING =====
        // Queue writes and flush in batches for lower Redis round-trips
        this.writeQueue = [];
        this.isFlushingQueue = false;
        this.FLUSH_INTERVAL = 100; // Flush every 100ms

        this.client.on('error', (err) => console.error('[Redis] ⚠️ Connection Error:', err.message));
        this.client.on('connect', () => {
            console.log('[Redis] ✅ Connected');
            this.syncFromRedis();
        });

        // Start batch flush interval
        setInterval(() => this._flushWriteQueue(), this.FLUSH_INTERVAL);
    }

    async syncFromRedis() {
        try {
            console.log('[Redis] 🔃 Syncing from Redis...');
            this.memoryCache.clear();
            this.userTradeIndex.clear();

            // Sync active trades
            const keys = await this.client.keys('trade:*');
            if (keys.length > 0) {
                const trades = await this.client.mget(keys);
                trades.forEach((t, i) => {
                    if (t) {
                        try {
                            const trade = JSON.parse(t);
                            const tradeId = keys[i].replace('trade:', '');
                            this.memoryCache.set(tradeId, trade);

                            // Build user index
                            const userAddr = trade.user?.toLowerCase();
                            if (userAddr) {
                                if (!this.userTradeIndex.has(userAddr)) {
                                    this.userTradeIndex.set(userAddr, new Set());
                                }
                                this.userTradeIndex.get(userAddr).add(tradeId);
                            }
                        } catch (e) { }
                    }
                });
            }

            // Sync global history
            const historyData = await this.client.get('global_history');
            this.historyCache = historyData ? JSON.parse(historyData) : [];

            this.isInitialized = true;
            console.log(`[Redis] 🏎️ Cache Synced: ${this.memoryCache.size} active trades, ${this.historyCache.length} history items`);
        } catch (e) {
            console.warn('[Redis] Sync failed, using memory only:', e.message);
            this.historyCache = this.historyCache || [];
            this.isInitialized = true;
        }
    }

    // ===== BATCH WRITE QUEUE =====
    _queueWrite(key, value) {
        this.writeQueue.push({ type: 'set', key, value });
    }

    _queueDelete(key) {
        this.writeQueue.push({ type: 'del', key });
    }

    async _flushWriteQueue() {
        if (this.isFlushingQueue || this.writeQueue.length === 0) return;
        this.isFlushingQueue = true;

        try {
            // Drain the queue
            const batch = this.writeQueue.splice(0, this.writeQueue.length);
            if (batch.length === 0) return;

            // Use Redis pipeline for atomic batched writes
            const pipeline = this.client.pipeline();
            for (const op of batch) {
                if (op.type === 'set') {
                    pipeline.set(op.key, op.value);
                } else if (op.type === 'del') {
                    pipeline.del(op.key);
                }
            }
            await pipeline.exec();
        } catch (e) {
            console.error('[Redis] ❌ Batch write failed:', e.message);
        } finally {
            this.isFlushingQueue = false;
        }
    }

    async setTrade(betId, tradeData) {
        const id = betId.toString();
        // Update RAM immediately
        this.memoryCache.set(id, tradeData);

        // Update user index
        const userAddr = tradeData.user?.toLowerCase();
        if (userAddr) {
            if (!this.userTradeIndex.has(userAddr)) {
                this.userTradeIndex.set(userAddr, new Set());
            }
            this.userTradeIndex.get(userAddr).add(id);
        }

        // Queue Redis write (batched)
        this._queueWrite(`trade:${id}`, JSON.stringify(tradeData));
    }

    async getTrade(betId) {
        return this.memoryCache.get(betId.toString()) || null;
    }

    async delTrade(betId) {
        const id = betId.toString();
        const trade = this.memoryCache.get(id);

        // Remove from user index
        if (trade) {
            const userAddr = trade.user?.toLowerCase();
            if (userAddr && this.userTradeIndex.has(userAddr)) {
                this.userTradeIndex.get(userAddr).delete(id);
            }
        }

        this.memoryCache.delete(id);
        this._queueDelete(`trade:${id}`);
    }

    async getAllActiveTrades() {
        return Array.from(this.memoryCache.values());
    }

    // ===== FAST: Get trades for specific user from index =====
    async getActiveTradesForUser(address) {
        const addr = address.toLowerCase();
        const tradeIds = this.userTradeIndex.get(addr);
        if (!tradeIds || tradeIds.size === 0) return [];

        const trades = [];
        for (const id of tradeIds) {
            const trade = this.memoryCache.get(id);
            if (trade) trades.push(trade);
        }
        return trades;
    }

    async pushHistory(trade) {
        if (!this.historyCache) this.historyCache = [];

        const normalizedTrade = {
            ...trade,
            owner: trade.owner || trade.user,
            timestamp: trade.timestamp || Date.now()
        };

        const tradeId = normalizedTrade.id || normalizedTrade.tx;
        if (tradeId) {
            this.historyCache = this.historyCache.filter(t => (t.id || t.tx) !== tradeId);
        }

        this.historyCache.unshift(normalizedTrade);

        if (this.historyCache.length > 100) {
            this.historyCache = this.historyCache.slice(0, 100);
        }

        // Queue history write (batched)
        this._queueWrite('global_history', JSON.stringify(this.historyCache));
    }

    async getHistory() {
        if (!this.historyCache || this.historyCache.length === 0) {
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
            this._queueWrite(`profile:${addr}`, JSON.stringify(profileData));

            if (profileData.sessionWalletAddress) {
                const sessionAddr = profileData.sessionWalletAddress.toLowerCase();
                if (sessionAddr !== addr) {
                    this._queueWrite(`session_to_main:${sessionAddr}`, addr);
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

            const tradeId = trade.id || trade.tx;
            if (tradeId) {
                history = history.filter(t => (t.id || t.tx) !== tradeId);
            }

            history.unshift(trade);

            if (history.length > 50) history = history.slice(0, 50);

            this._queueWrite(key, JSON.stringify(history));
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

            this._queueWrite(key, JSON.stringify(txs));
        } catch (e) {
            console.error(`[Redis] ❌ Failed to push user tx for ${address}:`, e.message);
        }
    }

    async getUserData(address) {
        try {
            const addr = address.toLowerCase();
            const profile = await this.getProfile(addr);

            const addresses = [addr];
            if (profile && profile.sessionWalletAddress) {
                const sessionAddr = profile.sessionWalletAddress.toLowerCase();
                if (sessionAddr !== addr) {
                    addresses.push(sessionAddr);
                }
            }

            // Fetch history and txs for all linked addresses using pipeline
            const pipeline = this.client.pipeline();
            for (const a of addresses) {
                pipeline.get(`history:${a}`);
                pipeline.get(`txs:${a}`);
            }
            const results = await pipeline.exec();

            let allHistory = [];
            let allTxs = [];

            for (let i = 0; i < addresses.length; i++) {
                const historyResult = results[i * 2];
                const txsResult = results[i * 2 + 1];

                if (historyResult && historyResult[1]) {
                    try {
                        const parsed = JSON.parse(historyResult[1]);
                        if (Array.isArray(parsed)) allHistory = allHistory.concat(parsed);
                    } catch (e) { }
                }

                if (txsResult && txsResult[1]) {
                    try {
                        const parsed = JSON.parse(txsResult[1]);
                        if (Array.isArray(parsed)) allTxs = allTxs.concat(parsed);
                    } catch (e) { }
                }
            }

            // De-duplicate and sort
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

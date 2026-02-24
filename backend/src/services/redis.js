const fs = require('fs');
const path = require('path');

const INDEX_FILE = path.join(__dirname, '..', '..', 'trades_index.json');

// IN-MEMORY STORE (Persistent Indexer)
class MemoryStore {
    constructor() {
        this.activeTrades = new Map();
        this.sessionWallets = new Map();
        this.historicalTrades = new Map(); // id -> trade
        this.lastScannedBlock = 28000000; // Default safe starting point

        this._loadFromDisk();
    }

    _loadFromDisk() {
        try {
            if (fs.existsSync(INDEX_FILE)) {
                const data = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
                if (data.historicalTrades) {
                    Object.entries(data.historicalTrades).forEach(([id, trade]) => {
                        this.historicalTrades.set(id, trade);
                    });
                }
                if (data.lastScannedBlock) {
                    this.lastScannedBlock = data.lastScannedBlock;
                }
                console.log(`[MemoryStore] Loaded ${this.historicalTrades.size} historical trades from disk.`);
            }
        } catch (e) {
            console.error('[MemoryStore] Failed to load index from disk:', e.message);
        }
    }

    async saveToDisk() {
        try {
            const data = {
                historicalTrades: Object.fromEntries(this.historicalTrades),
                lastScannedBlock: this.lastScannedBlock
            };
            fs.writeFileSync(INDEX_FILE, JSON.stringify(data, null, 2));
        } catch (e) {
            console.error('[MemoryStore] Failed to save index to disk:', e.message);
        }
    }

    async setTrade(id, data) {
        this.activeTrades.set(id.toString(), { ...data, timestamp: Date.now() });
    }

    async getTrade(id) {
        return this.activeTrades.get(id.toString());
    }

    async delTrade(id) {
        this.activeTrades.delete(id.toString());
    }

    async getAllActiveTrades() {
        return Array.from(this.activeTrades.values());
    }

    // Historical Indexing
    async addHistoricalTrade(trade) {
        const id = trade.id.toString();
        const existing = this.historicalTrades.get(id);

        // Merge or update
        if (existing) {
            this.historicalTrades.set(id, { ...existing, ...trade });
        } else {
            this.historicalTrades.set(id, trade);
        }
    }

    async getFullHistory() {
        return Array.from(this.historicalTrades.values());
    }

    // Sessions
    async saveSessionMapping(sessionAddr, mainAddr) {
        this.sessionWallets.set(sessionAddr.toLowerCase(), mainAddr.toLowerCase());
    }

    async getMainAddressForSession(sessionAddr) {
        return this.sessionWallets.get(sessionAddr.toLowerCase());
    }

    // Compatibility stubs
    async getUserData() { return null; }
    async saveProfile() { return true; }
    async getProfile() { return null; }
    async syncFromRedis() { }
}

module.exports = new MemoryStore();

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'profiles_db.json');

class ProfileService {
    constructor() {
        this.profiles = {};
        this.load();
    }

    load() {
        try {
            if (fs.existsSync(DB_PATH)) {
                const data = fs.readFileSync(DB_PATH, 'utf8');
                this.profiles = JSON.parse(data);
            }
        } catch (e) {
            console.error("Failed to load profiles:", e);
            this.profiles = {};
        }
    }

    save() {
        try {
            fs.writeFileSync(DB_PATH, JSON.stringify(this.profiles, null, 2));
        } catch (e) {
            console.error("Failed to save profiles:", e);
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

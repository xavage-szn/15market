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
}

module.exports = new ProfileService();

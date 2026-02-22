const { ethers } = require('ethers');

// IN-MEMORY STORE (Replaces Redis for absolute speed and decentralization)
// This is stateless in terms of persistence but keeps track of current session state
class MemoryStore {
    constructor() {
        this.activeTrades = new Map();
        this.sessionWallets = new Map(); // sessionAddr -> mainAddr
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

    // Sessions
    async saveSessionMapping(sessionAddr, mainAddr) {
        this.sessionWallets.set(sessionAddr.toLowerCase(), mainAddr.toLowerCase());
    }

    async getMainAddressForSession(sessionAddr) {
        return this.sessionWallets.get(sessionAddr.toLowerCase());
    }

    // Mock/Stub the rest to avoid crashes in other parts of the code
    async getUserData() { return null; }
    async saveProfile() { return true; }
    async getProfile() { return null; }
    async pushHistory() { }
    async pushUserHistory() { }
    async pushUserTransaction() { }
    async getHistory() { return []; }
    async syncFromRedis() { }
}

module.exports = new MemoryStore();

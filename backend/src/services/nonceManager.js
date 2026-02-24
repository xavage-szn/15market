const { ethers } = require('ethers');

class NonceManager {
    constructor() {
        this.nonces = new Map(); // address -> nonce
        this.locks = new Map();  // address -> Mutex (Promise-based)
    }

    async getNonce(address, provider) {
        const addr = address.toLowerCase();

        // Simple lock mechanism
        while (this.locks.get(addr)) {
            await this.locks.get(addr);
        }

        let release;
        this.locks.set(addr, new Promise(r => release = r));

        try {
            if (!this.nonces.has(addr)) {
                console.log(`[Nonce] Initializing nonce for ${addr}...`);
                const nonce = await provider.getTransactionCount(address, 'pending');
                this.nonces.set(addr, nonce);
            }

            const currentNonce = this.nonces.get(addr);
            this.nonces.set(addr, currentNonce + 1);
            return currentNonce;
        } finally {
            release();
            this.locks.delete(addr);
        }
    }

    resetNonce(address, nonce) {
        this.nonces.set(address.toLowerCase(), nonce);
    }

    async syncWithChain(address, provider) {
        const addr = address.toLowerCase();
        try {
            const nonce = await provider.getTransactionCount(address, 'pending');
            this.nonces.set(addr, nonce);
            console.log(`[Nonce] Synced ${addr} -> ${nonce}`);
            return nonce;
        } catch (e) {
            console.error(`[Nonce] Sync failed for ${addr}:`, e.message);
        }
    }
}

module.exports = new NonceManager();

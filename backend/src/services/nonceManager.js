const { ethers } = require('ethers');

class NonceManager {
    constructor() {
        this.nonces = new Map(); // address -> nonce
        this.locks = new Map();  // address -> Promise (for sequencing)
    }

    async getNonce(address, provider) {
        if (!this.nonces.has(address.toLowerCase())) {
            const nonce = await provider.getTransactionCount(address, 'pending');
            this.nonces.set(address.toLowerCase(), nonce);
        }

        const currentNonce = this.nonces.get(address.toLowerCase());
        this.nonces.set(address.toLowerCase(), currentNonce + 1);
        return currentNonce;
    }

    resetNonce(address, nonce) {
        this.nonces.set(address.toLowerCase(), nonce);
    }

    async syncWithChain(address, provider) {
        const nonce = await provider.getTransactionCount(address, 'pending');
        this.nonces.set(address.toLowerCase(), nonce);
        return nonce;
    }
}

module.exports = new NonceManager();

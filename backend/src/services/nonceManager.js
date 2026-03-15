const { ethers } = require('ethers');
const redisStore = require('./redis');

class NonceManager {
    constructor() {
        this.nonces = new Map(); // address -> nonce (Memory Fallback)
        this.locks = new Map();  // address -> Promise of current execution
    }

    async getNonce(address, provider) {
        const addr = address.toLowerCase();

        // Robust Lock: Ensure multiple calls to same address are processed sequentially
        if (!this.locks.has(addr)) {
            this.locks.set(addr, Promise.resolve());
        }

        const currentLock = this.locks.get(addr);
        let release;
        const nextLock = new Promise(resolve => release = resolve);
        this.locks.set(addr, nextLock);

        try {
            await currentLock;
            let finalNonce;

            if (redisStore.isCloud) {
                const redisKey = `nnc:${addr}`;

                // Initialize if key is missing in Redis
                let cachedVal = await redisStore.redis.get(redisKey);
                if (cachedVal === null) {
                    console.log(`[Nonce] Initializing ${addr} in Redis from Chain (Pending Mode)...`);
                    const count = await Promise.race([
                        provider.getTransactionCount(address, 'pending'),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
                    ]);
                    await redisStore.redis.setnx(redisKey, count);
                }

                // Increment atomically in Redis
                const nextVal = await redisStore.redis.incr(redisKey);
                finalNonce = Number(nextVal) - 1;
            } else {
                // Persistent memory tracking
                if (!this.nonces.has(addr)) {
                    console.log(`[Nonce] Initializing ${addr} in Memory from Chain (Pending Mode)...`);
                    const count = await Promise.race([
                        provider.getTransactionCount(address, 'pending'),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
                    ]);
                    this.nonces.set(addr, count);
                }
                finalNonce = this.nonces.get(addr);
                this.nonces.set(addr, finalNonce + 1);
            }

            console.log(`[Nonce] Dispensed for ${addr}: ${finalNonce} (Method: ${redisStore.isCloud ? 'Redis' : 'Memory'})`);
            return finalNonce;

        } catch (e) {
            console.error(`[NonceManager] Critical error for ${addr}:`, e.message);
            // On failure, fall back to chain as a last resort
            return await Promise.race([
                provider.getTransactionCount(address, 'pending'),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
            ]).catch(() => 0);
        } finally {
            release();
        }
    }

    async syncWithChain(address, provider) {
        const addr = address.toLowerCase();
        try {
            console.log(`[Nonce] Force syncing ${addr} from chain...`);
            const nonce = await Promise.race([
                provider.getTransactionCount(address, 'pending'),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000))
            ]);
            if (redisStore.isCloud) {
                await redisStore.redis.set(`nnc:${addr}`, nonce);
                console.log(`[Nonce] Sync: Updated Redis for ${addr} to ${nonce}`);
            } else {
                this.nonces.set(addr, nonce);
                console.log(`[Nonce] Sync: Updated Memory for ${addr} to ${nonce}`);
            }
            return nonce;
        } catch (e) {
            console.error(`[Nonce] Sync failed for ${addr}:`, e.message);
            // Fallback to latest if pending fails
            const fallback = await provider.getTransactionCount(address, 'latest').catch(() => 0);
            if (redisStore.isCloud) await redisStore.redis.set(`nnc:${addr}`, fallback);
            else this.nonces.set(addr, fallback);
            return fallback;
        }
    }

    resetNonce(address, nonce) {
        const addr = address.toLowerCase();
        if (redisStore.isCloud) {
            redisStore.redis.set(`nnc:${addr}`, nonce).catch(e => console.error(`[Nonce] Reset failed:`, e.name));
        } else {
            this.nonces.set(addr, nonce);
        }
    }
}

module.exports = new NonceManager();

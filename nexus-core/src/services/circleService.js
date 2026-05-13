const profiles = require('../profiles');

/**
 * CircleService
 * Handles interactions with Circle Programmable Wallets (Developer-Controlled)
 */
class CircleService {
    constructor() {
        this.apiKey = process.env.CIRCLE_API_KEY;
        this.entitySecret = process.env.CIRCLE_ENTITY_SECRET; // Encrypted entity secret
        this.walletSetId = process.env.CIRCLE_WALLET_SET_ID;
        this.baseUrl = 'https://api.circle.com/v1/w3s';
    }

    async request(method, endpoint, body = null) {
        if (!this.apiKey) {
            console.error('[Circle] API Key missing');
            throw new Error('Circle API Key not configured');
        }

        const url = `${this.baseUrl}${endpoint}`;
        const headers = {
            'Authorization': `Bearer ${this.apiKey}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };

        const options = {
            method,
            headers
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        try {
            const response = await fetch(url, options);
            const data = await response.json();
            if (!response.ok) {
                console.error(`[Circle] API Error (${response.status}):`, data);
                throw new Error(data.message || 'Circle API request failed');
            }
            return data.data || data;
        } catch (err) {
            console.error('[Circle] Fetch Error:', err.message);
            throw err;
        }
    }

    /**
     * Get or create a Circle Wallet for a user
     * @param {string} userId - The user's platform address
     * @returns {Promise<Object>} - Wallet details
     */
    async getOrCreateWallet(userId) {
        const addr = userId.toLowerCase();
        const profile = profiles.get(addr);

        if (profile && profile.circleWalletId && profile.circleAddress) {
            return {
                walletId: profile.circleWalletId,
                address: profile.circleAddress
            };
        }

        console.log(`[Circle] Creating wallet for user: ${userId}`);

        // 0. Ensure Wallet Set ID exists
        if (!this.walletSetId) {
            console.log('[Circle] Wallet Set ID missing, creating a new one...');
            const walletSet = await this.request('POST', '/developer/walletSets', {
                idempotencyKey: crypto.randomUUID(),
                name: '15Market User Wallets'
            });
            this.walletSetId = walletSet.walletSet.id;
            console.log(`[Circle] Created new Wallet Set: ${this.walletSetId}. PLEASE ADD THIS TO YOUR .ENV AS CIRCLE_WALLET_SET_ID`);
        }

        // 1. Create a wallet for the user in the wallet set
        // Note: For developer-controlled wallets, we use /developer/wallets
        const response = await this.request('POST', '/developer/wallets', {
            idempotencyKey: crypto.randomUUID(),
            accountType: 'SCA', // Smart Contract Account or EOA
            blockchains: ['POLY-AMOY'], // Default to Polygon Amoy for testing, or use config
            walletSetId: this.walletSetId,
            count: 1
        });

        const wallet = response.wallets[0];
        
        // 2. Save to profile
        profiles.upsert(addr, {
            circleWalletId: wallet.id,
            circleAddress: wallet.address,
            circleBlockchain: wallet.blockchain
        });

        return {
            walletId: wallet.id,
            address: wallet.address
        };
    }

    /**
     * Get wallet balance
     * @param {string} walletId 
     */
    async getBalance(walletId) {
        const data = await this.request('GET', `/wallets/${walletId}/balances`);
        return data.tokenBalances || [];
    }

    /**
     * Transfer tokens to an external address
     * @param {string} walletId 
     * @param {string} destinationAddress 
     * @param {string} amount 
     * @param {string} tokenId 
     */
    async transfer(walletId, destinationAddress, amount, tokenId) {
        // Developer-controlled transfers require the entity secret for signing if using the SDK,
        // but via REST API, you need to provide the encrypted entity secret in the challenge if needed.
        // For simple transfers, it might require a challenge-response flow.
        
        // However, Circle also has a "Developer-Controlled Transfer" endpoint that might be simpler
        // if the wallet is already initialized.
        
        console.log(`[Circle] Initiating transfer from ${walletId} to ${destinationAddress}`);
        
        const response = await this.request('POST', '/developer/transactions/transfer', {
            idempotencyKey: crypto.randomUUID(),
            entitySecretCiphertext: this.entitySecret, // This is usually required for dev-controlled
            walletId,
            destinationAddress,
            amounts: [amount],
            tokenId,
            feeLevel: 'MEDIUM'
        });

        return response;
    }
}

const crypto = require('crypto');
module.exports = new CircleService();

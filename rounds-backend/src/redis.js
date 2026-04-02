const Redis = require('ioredis');
const path = require('path');
const vault = require('./vault');
require('dotenv').config();

const RAW_REDIS_URL = process.env.REDIS_URL ? process.env.REDIS_URL.trim().replace(/^["'\s]+|["'\s]+$/g, '') : undefined;
const redisUrl = vault.decrypt(RAW_REDIS_URL);
const redis = new Redis(redisUrl);

redis.on('connect', () => {
    console.log('[Redis] Connected to Redis Cloud');
});

redis.on('error', (err) => {
    console.error('[Redis] Error:', err);
});

module.exports = {
    getRound: async (key) => {
        const data = await redis.get(key);
        return data ? JSON.parse(data) : null;
    },
    setRound: async (key, value) => {
        await redis.set(key, JSON.stringify(value), 'EX', 3600); // 1-hour expiration
    },

    // ─── ACCESS MANAGEMENT ─────────────────────────────────────────────────────

    saveApplication: async (app) => {
        await redis.hset('rounds:applications', app.address.toLowerCase(), JSON.stringify(app));
    },
    getApplications: async () => {
        const data = await redis.hgetall('rounds:applications');
        if (!data) return [];
        return Object.values(data).map(JSON.parse);
    },
    deleteApplication: async (address) => {
        await redis.hdel('rounds:applications', address.toLowerCase());
    },

    /**
     * Save a code bound to a SPECIFIC address.
     * 'address' on independent codes is null until redeemed — 
     * once redeemed by a wallet, that wallet is the permanent owner.
     */
    saveCode: async (code, data) => {
        // Store normalized uppercase code, bound to specific address if provided
        await redis.set(
            `rounds:code:${code.toUpperCase()}`,
            JSON.stringify({ ...data, redeemedBy: null }),
            'EX', 86400 * 30 // 30 days
        );
    },

    /**
     * Verify a code is valid and NOT already redeemed.
     * Returns the code data or null.
     */
    verifyCode: async (code) => {
        const data = await redis.get(`rounds:code:${code.toUpperCase()}`);
        return data ? JSON.parse(data) : null;
    },

    /**
     * Consume a code permanently — marks as used and binds to address.
     * If code was pre-generated for a specific address, enforces that binding.
     * Returns { ok: true } or { ok: false, reason: string }
     */
    redeemCode: async (code, walletAddress) => {
        const normalizedCode = code.toUpperCase();
        const normalizedAddress = walletAddress.toLowerCase();
        const key = `rounds:code:${normalizedCode}`;

        const raw = await redis.get(key);
        if (!raw) return { ok: false, reason: 'invalid_code' };

        const data = JSON.parse(raw);

        // Already redeemed check — code is single-use
        if (data.redeemedBy) {
            return { ok: false, reason: 'already_used' };
        }

        // If code was generated for a specific address, enforce it
        if (data.address && data.address.toLowerCase() !== normalizedAddress) {
            return { ok: false, reason: 'wrong_wallet' };
        }

        // Check this wallet hasn't already been authorized by another code
        const alreadyAuthorized = await redis.sismember('rounds:authorized_users', normalizedAddress);
        if (alreadyAuthorized) {
            return { ok: false, reason: 'already_authorized' };
        }

        // Mark the code as used (keep it for audit trail, but flag it)
        data.redeemedBy = normalizedAddress;
        data.redeemedAt = Date.now();
        // Keep a short TTL for audit — 7 days post-redemption
        await redis.set(key, JSON.stringify(data), 'EX', 86400 * 7);

        // Grant access to the wallet
        await redis.sadd('rounds:authorized_users', normalizedAddress);

        // Record which code this wallet used (for admin visibility)
        await redis.set(`rounds:wallet_code:${normalizedAddress}`, normalizedCode, 'EX', 86400 * 365);

        return { ok: true };
    },

    /**
     * Grant access directly (admin use / email approval flow).
     */
    grantAccess: async (address) => {
        await redis.sadd('rounds:authorized_users', address.toLowerCase());
    },

    /**
     * Strict server-side authorization check.
     * This is the single source of truth — no localStorage fallback.
     */
    isAuthorized: async (address) => {
        if (!address) return false;
        const result = await redis.sismember('rounds:authorized_users', address.toLowerCase());
        return result === 1;
    },

    /**
     * Revoke access (admin use).
     */
    revokeAccess: async (address) => {
        await redis.srem('rounds:authorized_users', address.toLowerCase());
    },

    /**
     * List all authorized wallets (admin use).
     */
    getAuthorizedWallets: async () => {
        return await redis.smembers('rounds:authorized_users');
    },
};

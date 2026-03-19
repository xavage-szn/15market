const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const redis = new Redis(process.env.REDIS_URL);

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
    // ACCESS MANAGEMENT
    saveApplication: async (app) => {
        await redis.hset('rounds:applications', app.address.toLowerCase(), JSON.stringify(app));
    },
    getApplications: async () => {
        const data = await redis.hgetall('rounds:applications');
        return Object.values(data).map(JSON.parse);
    },
    deleteApplication: async (address) => {
        await redis.hdel('rounds:applications', address.toLowerCase());
    },
    saveCode: async (code, data) => {
        await redis.set(`rounds:code:${code}`, JSON.stringify(data), 'EX', 86400 * 30); // 30 days
    },
    verifyCode: async (code) => {
        const data = await redis.get(`rounds:code:${code}`);
        return data ? JSON.parse(data) : null;
    },
    consumeCode: async (code) => {
        await redis.del(`rounds:code:${code}`);
    },
    grantAccess: async (address) => {
        await redis.sadd('rounds:authorized_users', address.toLowerCase());
    },
    isAuthorized: async (address) => {
        if (!address) return false;
        return await redis.sismember('rounds:authorized_users', address.toLowerCase());
    }
};

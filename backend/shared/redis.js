const Redis = require('ioredis');
const Logger = require('./logger');

const logger = new Logger('REDIS');

class RedisClient {
    constructor() {
        this.client = null;
        this.memoryStore = new Map(); // Fallback for when Redis is down
        this.isRedisConnected = false;
    }

    connect() {
        const url = process.env.REDIS_URL;

        return new Promise((resolve, reject) => {
            try {
                let client;
                if (url) {
                    client = new Redis(url, {
                        retryStrategy: (times) => Math.min(times * 50, 2000),
                        maxRetriesPerRequest: 3,
                        connectTimeout: 10000
                    });
                } else {
                    logger.info('REDIS_URL not found, using provided Redis Cloud credentials');
                    client = new Redis('redis://:ueZrTByLR9Iq6lbmqJwRNxv0YJuUoNYj@redis-14672.c277.us-east-1-3.ec2.cloud.redislabs.com:14672', {
                        retryStrategy: (times) => Math.min(times * 50, 2000),
                        maxRetriesPerRequest: 3,
                        connectTimeout: 10000
                    });
                }

                client.on('connect', () => {
                    logger.info('Successfully connected to Redis Cloud');
                    this.client = client;
                    this.isRedisConnected = true;
                    resolve(this.client);
                });

                client.on('error', (err) => {
                    logger.error(`Redis Error: ${err.message}`);
                    if (!this.isRedisConnected) {
                        // If we haven't connected yet, switch to memory mode silently (don't reject main app crash)
                        logger.warn('⚠️ Switching to IN-MEMORY storage (Redis unreachable)');
                    }
                });

                // Handle timeout if it takes too long to connect
                setTimeout(() => {
                    if (!this.isRedisConnected) {
                        logger.warn('⚠️ Redis connection timed out. Switching to IN-MEMORY storage.');
                        // We resolve anyway so the app starts
                        resolve(null);
                    }
                }, 5000);

            } catch (err) {
                logger.error(`Redis connection failed completely: ${err.message}`);
                resolve(null); // Fallback
            }
        });
    }

    // --- KV UTILS ---

    async get(key) {
        if (!this.isRedisConnected) return this.memoryStore.get(key) || null;
        try {
            const val = await this.client.get(key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            logger.error(`Get error for key ${key}: ${err.message}`);
            return this.memoryStore.get(key) || null;
        }
    }

    async set(key, value, ttl = null) {
        if (!this.isRedisConnected) {
            this.memoryStore.set(key, JSON.parse(JSON.stringify(value))); // Clone to mimic serialization
            return true;
        }
        try {
            const strVal = JSON.stringify(value);
            if (ttl) {
                await this.client.set(key, strVal, 'EX', ttl);
            } else {
                await this.client.set(key, strVal);
            }
            return true;
        } catch (err) {
            logger.error(`Set error for key ${key}: ${err.message}`);
            // Fallback
            this.memoryStore.set(key, value);
            return true;
        }
    }

    // --- HASH UTILS ---

    async hget(hash, key) {
        if (!this.isRedisConnected) {
            const h = this.memoryStore.get(hash) || {};
            return h[key] || null;
        }
        try {
            const val = await this.client.hget(hash, key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            return (this.memoryStore.get(hash) || {})[key] || null;
        }
    }

    async hset(hash, key, value) {
        if (!this.isRedisConnected) {
            const h = this.memoryStore.get(hash) || {};
            h[key] = JSON.parse(JSON.stringify(value));
            this.memoryStore.set(hash, h);
            return true;
        }
        try {
            await this.client.hset(hash, key, JSON.stringify(value));
            return true;
        } catch (err) {
            const h = this.memoryStore.get(hash) || {};
            h[key] = value;
            this.memoryStore.set(hash, h);
            return true;
        }
    }

    async hgetall(hash) {
        if (!this.isRedisConnected) {
            return this.memoryStore.get(hash) || {};
        }
        try {
            const data = await this.client.hgetall(hash);
            const parsed = {};
            for (const [k, v] of Object.entries(data)) {
                try {
                    parsed[k] = JSON.parse(v);
                } catch (e) {
                    parsed[k] = v;
                }
            }
            return parsed;
        } catch (err) {
            return this.memoryStore.get(hash) || {};
        }
    }
}

module.exports = new RedisClient();


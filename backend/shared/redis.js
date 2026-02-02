const Redis = require('ioredis');
const Logger = require('./logger');

const logger = new Logger('REDIS');

class RedisClient {
    constructor() {
        this.client = null;
    }

    connect() {
        const url = process.env.REDIS_URL;

        try {
            if (url) {
                this.client = new Redis(url, {
                    retryStrategy: (times) => Math.min(times * 50, 2000),
                    maxRetriesPerRequest: 3
                });
            } else {
                // Fallback to hardcoded credentials provided by user
                logger.info('REDIS_URL not found, using provided Redis Cloud credentials');
                this.client = new Redis({
                    host: 'redis-14672.c277.us-east-1-3.ec2.cloud.redislabs.com',
                    port: 14672,
                    password: 'ueZrTByLR9Iq6lbmqJwRNxv0YJuUoNYj',
                    username: 'default',
                    retryStrategy: (times) => Math.min(times * 50, 2000),
                    maxRetriesPerRequest: 3
                });
            }

            this.client.on('connect', () => logger.info('Successfully connected to Redis Cloud'));
            this.client.on('error', (err) => logger.error(`Redis Error: ${err.message}`));

            return this.client;
        } catch (err) {
            logger.error(`Redis connection failed: ${err.message}`);
            return null;
        }
    }


    async get(key) {
        if (!this.client) return null;
        try {
            const val = await this.client.get(key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            logger.error(`Get error for key ${key}: ${err.message}`);
            return null;
        }
    }

    async set(key, value, ttl = null) {
        if (!this.client) return false;
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
            return false;
        }
    }

    async hget(hash, key) {
        if (!this.client) return null;
        try {
            const val = await this.client.hget(hash, key);
            return val ? JSON.parse(val) : null;
        } catch (err) {
            logger.error(`HGET error for ${hash}:${key}: ${err.message}`);
            return null;
        }
    }

    async hset(hash, key, value) {
        if (!this.client) return false;
        try {
            await this.client.hset(hash, key, JSON.stringify(value));
            return true;
        } catch (err) {
            logger.error(`HSET error for ${hash}:${key}: ${err.message}`);
            return false;
        }
    }

    async hgetall(hash) {
        if (!this.client) return {};
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
            logger.error(`HGETALL error for ${hash}: ${err.message}`);
            return {};
        }
    }
}

module.exports = new RedisClient();

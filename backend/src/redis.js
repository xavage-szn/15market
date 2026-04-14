const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn("REDIS_URL not found in .env, persistent caching will be disabled.");
}

const redis = REDIS_URL ? new Redis(REDIS_URL) : null;

if (redis) {
  redis.on('connect', () => console.log('[Redis] Connected to cloud instance'));
  redis.on('error', (err) => console.error('[Redis] Connection error:', err));
}

module.exports = redis;

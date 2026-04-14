const Redis = require('ioredis');
require('dotenv').config();

const REDIS_URL = process.env.REDIS_URL;

if (!REDIS_URL) {
  console.warn("REDIS_URL not found in .env, persistent caching will be disabled.");
}

let redis = null;
try {
  if (REDIS_URL) {
    redis = new Redis(REDIS_URL);
    redis.on('connect', () => console.log('[Redis] Connected to cloud instance'));
    redis.on('error', (err) => console.error('[Redis] Connection error:', err));
  }
} catch (e) {
  console.warn("⚠️ [Redis] Failed to initialize Redis client:", e.message);
}

module.exports = redis;

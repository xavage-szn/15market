const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkRedis() {
    const redis = new Redis(process.env.REDIS_URL);
    try {
        const keys = await redis.hkeys('15market_historical_trades');
        console.log(`Historical keys count: ${keys.length}`);

        if (keys.length > 0) {
            const first = await redis.hget('15market_historical_trades', keys[0]);
            console.log('Sample trade:', first);
        }

        // Find specifically 1773292434520899
        const target = await redis.hget('15market_historical_trades', '1773292434520899');
        console.log('Target trade in Redis:', target);

    } catch (e) {
        console.error(e.message);
    } finally {
        redis.quit();
    }
}

checkRedis();

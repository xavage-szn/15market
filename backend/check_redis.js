const Redis = require('ioredis');
require('dotenv').config();

async function checkRedis() {
    const redis = new Redis(process.env.REDIS_URL);

    console.log('Checking Redis keys...');
    const keys = await redis.keys('*');
    console.log(`Total keys: ${keys.length}`);

    for (const key of keys) {
        const type = await redis.type(key);
        let val = '';
        if (type === 'string') {
            val = await redis.get(key);
            if (val.length > 100) val = val.substring(0, 100) + '...';
        }
        console.log(`- ${key} (${type}): ${val}`);
    }

    process.exit(0);
}

checkRedis().catch(err => {
    console.error(err);
    process.exit(1);
});

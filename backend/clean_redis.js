const Redis = require('ioredis');
require('dotenv').config();

async function cleanRedis() {
    const redis = new Redis(process.env.REDIS_URL);

    console.log('Cleaning Redis trade keys...');
    const keys = await redis.keys('trade:*');
    console.log(`Found ${keys.length} active trade keys.`);

    if (keys.length > 0) {
        await redis.del(...keys);
        console.log('✅ Successfully deleted all active trade keys.');
    } else {
        console.log('No active trade keys found.');
    }

    // Optional: Also clean global history if the user wants a completely fresh start
    // const history = await redis.del('global_history');
    // console.log('Cleaned global history.');

    process.exit(0);
}

cleanRedis().catch(err => {
    console.error(err);
    process.exit(1);
});

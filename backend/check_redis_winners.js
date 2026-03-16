const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkRedis() {
    const redis = new Redis(process.env.REDIS_URL);
    try {
        const all = await redis.hvals('15market_historical_trades');
        const trades = all.map(t => JSON.parse(t));

        console.log(`Total trades: ${trades.length}`);

        const winners = trades.filter(t => parseFloat(t.payout) > 500);
        console.log(`Found ${winners.length} large winners`);

        winners.forEach(w => {
            console.log(`Trade ${w.id}: ${w.payout} USDC to ${w.user || w.owner}`);
            console.log(`  Hash: ${w.transactionHash || w.tx}`);
            console.log(`  Date: ${new Date(w.timestamp || w.startTime).toISOString()}`);
        });

    } catch (e) {
        console.error(e.message);
    } finally {
        redis.quit();
    }
}

checkRedis();

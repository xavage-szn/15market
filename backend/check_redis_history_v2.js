const Redis = require('ioredis');
const path = require('path');
const fs = require('fs');

const envPath = path.join(__dirname, '.env');
console.log('Loading .env from:', envPath);

require('dotenv').config({ path: envPath });

const REDIS_URL = process.env.REDIS_URL;

async function checkHistory() {
    if (!REDIS_URL) {
        console.log('No REDIS_URL');
        console.log('ENV keys:', Object.keys(process.env).filter(k => k.includes('REDIS')));
        return;
    }

    console.log('Connecting to Redis...');
    const redis = new Redis(REDIS_URL);
    try {
        const all = await redis.hvals('15market_historical_trades');
        const trades = all.map(t => JSON.parse(t));

        console.log(`Total historical trades in Redis: ${trades.length}`);

        const winners = {};
        let totalPaidOut = 0;

        trades.forEach(t => {
            if (t.status === 'WON') {
                const user = t.user || 'unknown';
                const payout = parseFloat(t.payout) || 0;
                winners[user] = (winners[user] || 0) + payout;
                totalPaidOut += payout;
            }
        });

        const sorted = Object.entries(winners).sort((a, b) => b[1] - a[1]);

        console.log('\nTop Winners in Redis History:');
        sorted.slice(0, 20).forEach(([user, amt]) => {
            console.log(`${user}: ${amt.toFixed(2)} USDC`);
        });

        console.log(`\nTotal Redis Payout: ${totalPaidOut.toFixed(2)} USDC`);

    } catch (e) {
        console.error('Error:', e.message);
    } finally {
        redis.quit();
    }
}

checkHistory();

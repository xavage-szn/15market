const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkUser() {
    const redis = new Redis(process.env.REDIS_URL);
    try {
        const all = await redis.hvals('15market_historical_trades');
        const trades = all.map(t => JSON.parse(t));

        const target = '0x2C2A74EA3c85f5Df6E5D9402540140f25d9fFa0d'.toLowerCase();
        const userTrades = trades.filter(t => (t.user || t.owner || '').toLowerCase() === target);

        console.log(`User: ${target}`);
        console.log(`Total Trades: ${userTrades.length}`);

        let totalWagered = 0;
        let totalPayout = 0;

        userTrades.forEach(t => {
            const amt = parseFloat(t.amount || 0);
            const payout = parseFloat(t.payout || 0);
            totalWagered += amt;
            totalPayout += payout;
            console.log(`Trade ${t.id}: Status ${t.status}, Wager ${amt}, Payout ${payout}, Time: ${new Date(t.timestamp || t.startTime).toISOString()}`);
        });

        console.log(`\nSummary:`);
        console.log(`Total Wagered: ${totalWagered.toFixed(2)} USDC`);
        console.log(`Total Payout: ${totalPayout.toFixed(2)} USDC`);
        console.log(`Net Profit: ${(totalPayout - totalWagered).toFixed(2)} USDC`);

    } catch (e) {
        console.error(e.message);
    } finally {
        redis.quit();
    }
}

checkUser();

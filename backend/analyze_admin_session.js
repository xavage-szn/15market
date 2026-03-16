const Redis = require('ioredis');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function checkUser() {
    const redis = new Redis(process.env.REDIS_URL);
    try {
        const all = await redis.hvals('15market_historical_trades');
        const trades = all.map(t => JSON.parse(t));

        const target = '0x1074E2461364f0842Fc60Ce0C85c950341F9E18f'.toLowerCase();
        const userTrades = trades.filter(t => (t.user || t.owner || t.sessionOwner || '').toLowerCase() === target);

        console.log(`User/Session: ${target}`);
        console.log(`Total Trades: ${userTrades.length}`);

        let totalWagered = 0;
        let totalPayout = 0;

        userTrades.forEach(t => {
            const amt = parseFloat(t.amount || 0);
            const payout = parseFloat(t.payout || 0);
            totalWagered += amt;
            totalPayout += payout;
            if (payout > 100) {
                console.log(`Trade ${t.id}: Status ${t.status}, Wager ${amt}, Payout ${payout}, Time: ${new Date(t.timestamp || t.startTime).toISOString()}`);
            }
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

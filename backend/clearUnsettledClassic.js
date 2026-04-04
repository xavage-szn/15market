const redis = require('./src/services/redis');
const path = require('path');
require('dotenv').config();

async function clearUnsettledClassicOnly() {
    console.log('--- 15Market Classic Clean Start ---');
    console.log('[Clear] Marking active classic trades as LOST...');

    const activeTrades = await redis.getAllActiveTrades();
    console.log(`[Clear] Found ${activeTrades.length} active trades.`);

    for (const trade of activeTrades) {
        console.log(`[Clear] Closing trade ${trade.id} as LOST...`);
        const historical = {
            ...trade,
            status: 'LOST',
            settlementPrice: trade.entryPrice, // Neutral match
            payout: '0.00'
        };
        await redis.addHistoricalTrade(historical);
        await redis.delTrade(trade.id);
    }

    // Clean up PENDING historical trades
    const history = await redis.getFullHistory();
    const pending = history.filter(t => t.status === 'PENDING');
    console.log(`[Clear] Found ${pending.length} pending historical trades.`);
    for (const trade of pending) {
        await redis.addHistoricalTrade({ ...trade, status: 'LOST', payout: '0.00' });
    }

    console.log('[Clear] Classic cleanup complete. Rounds untouched.');
    process.exit(0);
}

clearUnsettledClassicOnly();

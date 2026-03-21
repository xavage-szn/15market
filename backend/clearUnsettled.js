const redis = require('./src/services/redis');
const path = require('path');
require('dotenv').config();

async function clearUnsettled() {
    console.log('--- 🧹 15Market Fresh Start Procedure ---');
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

    // Reset Rounds state to avoid bot-contaminated pools
    console.log('[Clear] Resetting Rounds pools to 1.0/1.0 (Start Afresh)...');
    const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
    for (const asset of assets) {
        const state = await redis.getRound(`${asset}_state`);
        if (state) {
            if (state.next) {
                state.next.pools = { long: 1.0, short: 1.0, participants: 0 };
            }
            if (state.live) {
                state.live.pools = { long: 1.0, short: 1.0, participants: 0 };
            }
            await redis.setRound(`${asset}_state`, state);
            console.log(`[Clear] ✅ Reset ${asset} pools.`);
        }
    }

    console.log('[Clear] ✅ Fresh start complete.');
    process.exit(0);
}

clearUnsettled();

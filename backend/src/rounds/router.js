const express = require('express');
const router = express.Router();
const processor = require('./processor');
const botService = require('./botService');
const redis = require('../services/redis'); 

// Health check
router.get('/health', (req, res) => {
    res.json({ status: 'rounds-healthy', timestamp: Date.now() });
});

// Get current round status for all assets or a specific one
router.get('/status', async (req, res) => {
    try {
        const { asset } = req.query;
        const assets = asset ? [asset.toUpperCase()] : ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        
        const states = {};
        for (const a of assets) {
            // Use the main backend's redis wrapper (which uses hget('15market_rounds', id))
            states[a] = await redis.getRound(`${a}_state`);
        }
        res.json(asset ? states[asset.toUpperCase()] : states);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Register session wallet entry (User betting in a round)
router.post('/session-enter', async (req, res) => {
    try {
        const { address, asset, side, amount } = req.body;
        if (!address || !asset || !side || !amount) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const assetUpper = asset.toUpperCase();
        console.log(`[RoundsApi] 🎮 ${address} entering ${side} on ${assetUpper} for ${amount} USDC`);

        // Check current state
        const state = await redis.getRound(`${assetUpper}_state`);
        if (!state || !state.next) {
            return res.status(400).json({ error: 'No active betting round for this asset' });
        }

        // 📝 Optimistic UI update: Increment participants and pools in Redis
        // This keeps the UI snappy while the blockchain transaction processes
        if (state.next.pools) {
            const sideKey = side.toLowerCase();
            state.next.pools[sideKey] = (state.next.pools[sideKey] || 0) + parseFloat(amount);
            state.next.pools.participants = (state.next.pools.participants || 0) + 1;
            await redis.setRound(`${assetUpper}_state`, state);
            console.log(`[RoundsApi] 📊 Updated Redis ${assetUpper} pools: +${amount} to ${sideKey}`);
        }

        // Logic to trigger the actual contract transaction via BotService (acting as a transaction relayer for sessions)
        // or just return success and let the frontend poll.
        // Actually, the main backend index.js has /session/trade for Binary Options. 
        // For Rounds, we'll implement a similar relay if needed, but for now we confirm the intent.
        
        res.json({ success: true, roundId: state.next.id, status: 'optimistic_registered' });
    } catch (e) {
        console.error(`[RoundsApi] Session enter error:`, e);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Manually fund bots
router.post('/access/admin/fund-bots', async (req, res) => {
    const { token } = req.body;
    if (token !== process.env.ADMIN_TOKEN) return res.status(403).send("Unauthorized");
    
    botService.checkAndFundBots();
    res.json({ success: true, message: "Bot funding triggered in background" });
});

module.exports = router;

const express = require('express');
const router = express.Router();
const processor = require('./processor');
const redis = require('../services/redis'); 
const vault = require('../services/vault');
const { deriveUserWallet } = require('../services/walletDerivation');
const blockchainService = require('./blockchain');
const { ethers } = require('ethers');

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
        const settings = await redis.getSettings();
        if (settings?.maintenanceMode) return res.status(503).json({ error: 'Maintenance Mode Active' });
        if (settings?.tradingHalted) return res.status(503).json({ error: 'Trading Halted by Admin' });

        const { address, asset, side, amount } = req.body;
        if (!address || !asset || !side || !amount) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const assetUpper = asset.toUpperCase();
        console.log(`[RoundsApi] ${address} entering ${side} on ${assetUpper} for ${amount} USDC`);

        // Check current state
        const state = await redis.getRound(`${assetUpper}_state`);
        if (!state || !state.next) {
            return res.status(400).json({ error: 'No active betting round for this asset' });
        }

        const roundId = state.next.id;
        const direction = side.toLowerCase() === 'up' ? 1 : 0;

        // 1. Derive Session Wallet
        const { wallet: sessionWallet, address: sessionAddr } = await deriveUserWallet(address);
        
        // 2. Transact on Blockchain
        const val = ethers.parseEther(amount.toString());
        await blockchainService.ensureReady();
        const connectedWallet = sessionWallet.connect(blockchainService.blockchain.provider);
        
        console.log(`[RoundsApi] Relayer: ${address} -> Session: ${sessionAddr} | Round: ${roundId}`);

        // We use a high gas limit since sessions might be complex
        const tx = await blockchainService.enterRound(roundId, direction, val, connectedWallet);
        
        console.log(`[RoundsApi] On-chain success: ${tx.hash}`);

        // 3. Update Redis state (Actual count)
        const sideKey = side.toLowerCase() === 'up' ? 'long' : 'short';
        
        // Refetch state to prevent race conditions
        const latestState = await redis.getRound(`${assetUpper}_state`);
        if (latestState && latestState.next && Number(latestState.next.id) === Number(roundId)) {
            if (!latestState.next.pools) latestState.next.pools = { long: 1.0, short: 1.0, participants: 0 };
            latestState.next.pools[sideKey] = (latestState.next.pools[sideKey] || 1.0) + parseFloat(amount);
            latestState.next.pools.participants = (latestState.next.pools.participants || 0) + 1;
            await redis.setRound(`${assetUpper}_state`, latestState);
            console.log(`[RoundsApi] State updated: ${assetUpper} Participants: ${latestState.next.pools.participants}`);
        }

        res.json({ 
            success: true, 
            roundId, 
            txHash: tx.hash,
            status: 'confirmed_on_chain' 
        });
    } catch (e) {
        console.error(`[RoundsApi] Session enter error:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- ACCESS ENDPOINTS (Consolidated from rounds-backend) ---

router.post('/access/apply', async (req, res) => {
    try {
        const { address, xHandle, discord, email } = req.body;
        if (!address || !xHandle || !email) return res.status(400).json({ error: 'Missing required fields' });
        
        const normalizedAddress = address.toLowerCase();

        // 1. Check if already authorized
        const alreadyAuthorized = await redis.isAuthorized(normalizedAddress);
        if (alreadyAuthorized) {
            return res.status(400).json({ error: 'Your wallet is already whitelisted for Rounds access.' });
        }

        // 2. Check if already has a pending or approved application
        const allApps = await redis.getApplications();
        const existingApp = allApps.find(a => a.address.toLowerCase() === normalizedAddress);
        if (existingApp) {
            if (existingApp.status === 'approved') {
                return res.status(400).json({ error: 'Your application was already approved! Please check your email for the access code.' });
            }
            return res.status(400).json({ error: 'You already have a pending application. Please wait for the admin to review it.' });
        }
        
        await redis.saveApplication({ address: normalizedAddress, xHandle, discord, email, timestamp: Date.now(), status: 'pending' });
        res.json({ success: true, message: 'Application submitted! Please check your email periodically for your access code.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/access/check/:address', async (req, res) => {
    try {
        const addr = req.params.address.toLowerCase();
        const authorized = await redis.isAuthorized(addr);
        res.json({ authorized });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

router.post('/access/redeem', async (req, res) => {
    try {
        const { address, code } = req.body;
        if (!address || !code) return res.status(400).json({ error: 'Missing parameters' });
        
        const result = await redis.redeemCode(code.trim(), address);
        
        if (result.ok) {
            return res.json({ success: true, message: 'Access granted! Welcome to the Rounds terminal.' });
        }

        if (result.reason === 'invalid_code') return res.status(403).json({ error: 'Invalid or expired access code.' });
        if (result.reason === 'already_used') return res.status(403).json({ error: 'This access code has already been redeemed by another wallet.' });
        if (result.reason === 'wrong_wallet') return res.status(403).json({ error: 'This access code was not issued to your wallet address.' });
        if (result.reason === 'already_authorized') return res.status(400).json({ error: 'This wallet already has Rounds access.' });
        
        return res.status(403).json({ error: 'Access denied.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN ONLY (Requires ADMIN_TOKEN)
const isAdmin = (req) => {
    const adminToken = vault.get('ADMIN_TOKEN');
    return req.headers['authorization'] === `Bearer ${adminToken}`;
};

router.get('/access/admin/applications', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const apps = await redis.getApplications();
    res.json(apps);
});

router.post('/access/admin/approve', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { address, email } = req.body;
    if (!address || !email) return res.status(400).json({ error: 'address and email required' });
    
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await redis.saveCode(code, { address: address.toLowerCase(), email });
    
    // Instead of deleting, mark as approved
    const apps = await redis.getApplications();
    const app = apps.find(a => a.address.toLowerCase() === address.toLowerCase());
    if (app) {
        app.status = 'approved';
        app.approvedCode = code;
        app.approvedAt = Date.now();
        await redis.saveApplication(app);
    }

    // TODO: Send email (Nodemailer is already in dependencies)
    res.json({ success: true, code });
});

router.get('/access/admin/authorized', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const wallets = await redis.getAuthorizedWallets();
    res.json(wallets);
});

router.post('/access/admin/revoke', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    await redis.revokeAccess(address.toLowerCase());
    res.json({ success: true });
});

// Settle a round (Frontend reports final result for settlement)
router.post('/settle', async (req, res) => {
    try {
        const { asset, roundId, settlePrice, result } = req.body;
        if (!asset || !roundId || !settlePrice) return res.status(400).json({ error: 'Missing parameters' });

        const assetUpper = asset.toUpperCase();
        console.log(`[RoundsApi] Settlement: ${assetUpper} Round ${roundId}: ${result} at $${settlePrice}`);

        const state = await redis.getRound(`${assetUpper}_state`);
        if (state && state.live && Number(state.live.id) === Number(roundId)) {
            // Already settled check
            if (state.live.settlePrice) return res.json({ success: true, note: 'Already settled' });

            state.live.settlePrice = parseFloat(settlePrice);
            state.live.result = result;
            await redis.setRound(`${assetUpper}_state`, state);

            // Trigger on-chain settlement
            const priceFixed = ethers.parseUnits(parseFloat(settlePrice).toFixed(8), 8);
            await blockchainService.ensureReady();
            blockchainService.settleRound(roundId, priceFixed).then(tx => {
                console.log(`[RoundsApi] On-chain settle: ${tx.hash}`);
            }).catch(e => {
                console.warn(`[RoundsApi] On-chain Settle Warning: ${e.message}`);
            });

            return res.json({ success: true, result });
        }
        res.status(404).json({ error: 'Mismatch or already settled' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;

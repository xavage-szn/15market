const express = require('express');
const cors = require('cors');
const path = require('path');
require('dotenv').config();

const processor = require('./src/processor');
const botService = require('./src/botService');
const redis = require('./src/redis');
const payoutKeeper = require('./src/payoutKeeper');

const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 3011;

// Startup check: Log missing environment variables instead of crashing silently
const requiredEnv = ['REDIS_URL', 'ADMIN_TOKEN', 'EMAIL_USER', 'EMAIL_PASS', 'PRIVATE_KEY', 'ROUNDS_CONTRACT_ADDRESS'];
requiredEnv.forEach(env => {
    if (!process.env[env]) {
        console.warn(`[Startup] Missing env: ${env}`);
    }
});

app.use(cors());
app.use(express.json());

// Transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    }
});

const isAdmin = (req) => req.headers['authorization'] === `Bearer ${process.env.ADMIN_TOKEN}`;

// --- SESSION WALLET DERIVATION ---
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET;
if (!SESSION_MASTER_SECRET) {
    console.warn("[Startup] Missing session secret");
}

async function deriveUserWallet(userAddress) {
    const { ethers } = require('ethers');
    const blockchain = require('./src/blockchain');
    const addr = userAddress.toLowerCase();
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const provider = blockchain.provider;
    const wallet = new ethers.Wallet(privateKey, provider);
    return { wallet, address: wallet.address };
}

// --- ACCESS ENDPOINTS ---

app.post('/access/apply', async (req, res) => {
    try {
        const { address, xHandle, discord, email } = req.body;
        if (!address || !xHandle || !email) return res.status(400).json({ error: 'Missing required fields' });
        
        await redis.saveApplication({ address, xHandle, discord, email, timestamp: Date.now(), status: 'pending' });
        res.json({ success: true, message: 'Application submitted! Please check your email periodically for your access code.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/access/check/:address', async (req, res) => {
    const authorized = await redis.isAuthorized(req.params.address);
    res.json({ authorized });
});

app.post('/access/redeem', async (req, res) => {
    try {
        const { address, code } = req.body;
        if (!address || !code) return res.status(400).json({ error: 'Missing parameters' });
        
        const result = await redis.redeemCode(code.trim(), address);
        
        if (result.ok) {
            return res.json({ success: true, message: 'Access granted! Welcome to the Rounds terminal.' });
        }

        // Return specific error messages for each failure mode
        if (result.reason === 'invalid_code') return res.status(403).json({ error: 'Invalid or expired access code.' });
        if (result.reason === 'already_used') return res.status(403).json({ error: 'This access code has already been redeemed by another wallet.' });
        if (result.reason === 'wrong_wallet') return res.status(403).json({ error: 'This access code was not issued to your wallet address.' });
        if (result.reason === 'already_authorized') return res.status(400).json({ error: 'This wallet already has Rounds access.' });
        
        return res.status(403).json({ error: 'Access denied.' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ADMIN ONLY

app.get('/access/admin/applications', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const apps = await redis.getApplications();
    res.json(apps);
});

app.post('/access/admin/approve', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { address, email } = req.body;
    if (!address || !email) return res.status(400).json({ error: 'address and email required' });
    
    // Generate a code bound to this specific address — cannot be redeemed by anyone else
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await redis.saveCode(code, { address: address.toLowerCase(), email });
    await redis.deleteApplication(address);

    const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: email,
        subject: 'Your 15Market Rounds Access Code',
        text: `Your application has been approved!\n\nAccess Code: ${code}\n\nIMPORTANT: This code is bound to your wallet address (${address}) and can only be redeemed once.\n\nRedeem it at https://15market.online to unlock the Rounds terminal.`,
        html: `<div style="font-family:sans-serif;max-width:480px"><h2>Approval</h2><p>Your application to Rounds Beta has been approved.</p><h3 style="background:#f5f5f5;padding:16px;border-radius:8px;letter-spacing:4px;text-align:center">${code}</h3><p style="font-size:12px;color:#888">This code is bound to wallet <strong>${address}</strong> and is single-use.</p><p>Redeem at <a href="https://15market.online">15market.online</a></p></div>`
    };

    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true, code });
    } catch (e) {
        res.json({ success: true, code, mailError: e.message });
    }
});

app.post('/access/admin/generate-independent', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    // Independent codes have NO pre-bound address — first wallet to redeem owns it
    // But it is still SINGLE-USE — once redeemed, it is locked to that wallet forever
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    await redis.saveCode(code, { type: 'independent', address: null });
    res.json({ success: true, code });
});

// Admin: Revoke a wallet's access
app.post('/access/admin/revoke', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: 'address required' });
    await redis.revokeAccess(address);
    res.json({ success: true, message: `Access revoked for ${address}` });
});

// Admin: List all authorized wallets
app.get('/access/admin/wallets', async (req, res) => {
    if (!isAdmin(req)) return res.status(401).json({ error: 'Unauthorized' });
    const wallets = await redis.getAuthorizedWallets();
    res.json(wallets);
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'rounds-backend', timestamp: Date.now() });
});

app.get('/rounds/status', async (req, res) => {
    try {
        const { asset } = req.query;
        if (!asset) return res.status(400).json({ error: 'Asset required' });
        // Normalize symbol (e.g. eth -> ETHUSDT)
        const symbol = asset.length < 5 ? `${asset.toUpperCase()}USDT` : asset.toUpperCase();
        const state = await redis.getRound(`${symbol}_state`);
        res.json(state || { live: null, next: { pools: { long: 1, short: 1, participants: 0 } } });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/rounds/session-enter', async (req, res) => {
    try {
        const { address, direction, amount, roundId, asset } = req.body;
        if (!address || direction === undefined || !amount || !roundId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const { wallet } = await deriveUserWallet(address);
        const { ethers } = require('ethers');
        const blockchain = require('./src/blockchain');

        const contract = new ethers.Contract(
            process.env.ROUNDS_CONTRACT_ADDRESS,
            ["function enterRound(uint256 _roundId, uint8 _direction) external payable"],
            wallet
        );

        // Normalize direction: Contract expects 0=DOWN, 1=UP
        // Frontend sends dirVal: 1=UP, 0=DOWN. If it's already a number, use it.
        let dirVal;
        if (typeof direction === 'number') {
            dirVal = direction;
        } else {
            dirVal = (direction === 'UP' || direction === 'buy') ? 1 : 0;
        }

        const cleanAmount = amount.toString().replace(',', '.'); // Handle European decimals
        const val = ethers.parseUnits(parseFloat(cleanAmount).toFixed(18), 18);
        
        console.log(`[Rounds] Session Entry: User ${address} entering round ${roundId} ${dirVal === 1 ? 'UP' : 'DOWN'} with ${amount} USDC`);
        
        // --- 🛡️ ROBUST TRANSACTION: Add high gas limit for session complex wallets ---
        const tx = await contract.enterRound(roundId, dirVal, { 
            value: val,
            gasLimit: 600000 
        });

        console.log(`[Rounds] Entry broadcasted: ${tx.hash}`);

        // --- OPTIMISTIC REDIS UPDATE (Now safer) ---
        try {
            const sym = asset || 'ETH';
            const symbol = sym.length < 5 ? `${sym.toUpperCase()}USDT` : sym.toUpperCase();
            const state = await redis.getRound(`${symbol}_state`);
            if (state && state.next && state.next.id.toString() === roundId.toString()) {
                const side = dirVal === 1 ? 'long' : 'short';
                if (!state.next.pools) state.next.pools = { long: 0, short: 0, participants: 0 };
                state.next.pools[side] += parseFloat(cleanAmount);
                state.next.pools.participants += 1;
                await redis.setRound(`${symbol}_state`, state);
            }
        } catch (redisErr) {
            console.warn(`[Rounds] Optimistic update failed:`, redisErr.message);
        }

        res.json({ success: true, txHash: tx.hash });
    } catch (e) {
        console.error(`[Rounds] Session Enter Error [User: ${req.body.address}]:`, e.message);
        // Special helpful message for gas/funding issues (Most common)
        let errorMsg = e.message;
        if (errorMsg.includes('insufficient funds')) {
            errorMsg = "Insufficient funds in session wallet for stake + gas (ARC). Please refresh profile.";
        }
        res.status(500).json({ error: errorMsg });
    }
});

app.get('/active', async (req, res) => {
    try {
        const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        const states = {};
        for (const asset of assets) {
            states[asset] = await redis.getRound(`${asset}_state`);
        }
        res.json(states);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/history', async (req, res) => {
    try {
        // For now, we return the last few settled rounds from state
        // In a real production app, we'd use a Redis list or DB for history
        const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        const history = [];
        for (const asset of assets) {
            const state = await redis.getRound(`${asset}_state`);
            if (state && state.live && state.live.result) {
                history.push({
                    id: state.live.id,
                    symbol: asset,
                    status: state.live.result,
                    lockPrice: state.live.lockPrice,
                    settlePrice: state.live.settlePrice,
                    timestamp: state.live.startTime,
                    type: 'rounds'
                });
            }
        }
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log(`[Rounds-Backend] Running on port ${PORT}`);
    await botService.init();
    processor.start();
    payoutKeeper.start();
});

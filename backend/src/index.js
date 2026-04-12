const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ethers } = require('ethers');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const blockchain = require('./services/blockchain');
const redis = require('./services/redis');
const { deriveUserWallet } = require('./services/walletDerivation');
const nonceManager = require('./services/nonceManager');
const roundsRouter = require('./rounds/router');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: ["http://localhost:3000", "https://15market.online", "https://www.15market.online"], methods: ["GET", "POST"] }
});

app.use(cors());
app.use(express.json());

// Routes
app.use('/rounds', roundsRouter);

// --- 1. Wallet & Balance API ---
app.get('/balance/:address', async (req, res) => {
    try {
        const bal = await blockchain.getNativeBalance(req.params.address);
        res.json({ balance: ethers.formatEther(bal) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- User Profile Endpoints ---
app.get('/profiles/:address', async (req, res) => {
    try {
        const address = req.params.address.toLowerCase();
        const profile = await redis.getProfile(address);
        if (!profile) return res.status(404).json({ error: 'Profile not found' });
        res.json(profile);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/profiles', async (req, res) => {
    try {
        const { address, username, xHandle, avatar } = req.body;
        if (!address || !username) return res.status(400).json({ error: 'Address and Username required' });
        
        const profile = {
            address: address.toLowerCase(),
            username: username.trim(),
            xHandle: (xHandle || '').trim(),
            avatar: avatar || '',
            onboardedAt: Date.now()
        };

        await redis.saveProfile(address, profile);
        res.json({ success: true, profile });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/session/balance/:address', async (req, res) => {
    try {
        const { address: sessionAddr } = deriveUserWallet(req.params.address);
        const bal = await blockchain.getSessionBalance(sessionAddr);
        res.json({ balance: ethers.formatEther(bal), sessionAddress: sessionAddr });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 2. Auto-Signer Trade Execution ---
app.post('/session/trade', async (req, res) => {
    console.log(`[AutoSigner] Incoming Trade Request for: ${req.body.address || 'Unknown'}`);
    // Support both flat params and tradeParams wrapper used by V2 UI
    const body = req.body.tradeParams ? { ...req.body.tradeParams, address: req.body.address } : req.body;
    const { address, amount, direction, duration, id, marketId, entryPrice } = body;
    
    if (!address || !amount || direction === undefined || !duration || !id) {
        return res.status(400).json({ error: 'Missing trade parameters' });
    }

    // 1. DEDUPLICATE & LOCK
    const lock = await redis.lockTrade(id);
    if (!lock) return res.status(409).json({ error: 'Trade ID collision' });

    try {
        // 2. DERIVATION & CONTRACT SELECTION
        const { wallet, address: sessionAddr } = deriveUserWallet(address);
        
        // CRITICAL FIX: Save session→main wallet mapping
        await redis.saveSessionMapping(sessionAddr.toLowerCase(), address.toLowerCase());
        
        const contractAddr = process.env.SESSION_MARKET || process.env.ARC_CONTRACT_ADDRESS;
        console.log(`[AutoSigner] Dispatching ID ${id} to Contract: ${contractAddr} | Session: ${sessionAddr}`);

        // 3. FLIGHT CHECKS
        const balance = await blockchain.getSessionBalance(sessionAddr);
        const cleanAmount = (amount || "0").toString().replace(',', '.');
        const amtWei = ethers.parseUnits(parseFloat(cleanAmount).toFixed(18), 18);
        
        // Lowered buffer to 0.01 for better local testing flexibility
        const realisticGasBuffer = ethers.parseUnits("0.01", "ether"); 
        const totalNeeded = amtWei + realisticGasBuffer;

        console.log(`[AutoSigner] Balance Check: Have ${ethers.formatEther(balance)} | Need ${ethers.formatEther(totalNeeded)} (Stake: ${cleanAmount})`);

        if (balance < totalNeeded) {
            const err = `Insufficient Balance. Session wallet ${sessionAddr} has ${parseFloat(ethers.formatEther(balance)).toFixed(4)} USDC. Need ${cleanAmount} USDC stake + 0.01 for gas.`;
            console.warn(`[AutoSigner] Blocked: ${err}`);
            return res.status(400).json({ error: err });
        }

        // 4. NONCE & SIGNING
        const nonce = await nonceManager.getNonce(sessionAddr, blockchain.highSpeedProvider || blockchain.provider);
        const entryVal = BigInt(Math.floor(Number(entryPrice || 0) * 1e8));
        const fees = await blockchain._getGasPrice();

        const txArgs = [
            BigInt(id),
            Number(direction),
            BigInt(duration),
            entryVal,
            Number(marketId || 0),
            sessionAddr // Winnings stay in Trading Account
        ];

        console.log(`[AutoSigner] Sending TX: Nonce=${nonce} | MaxFee=${fees.maxFeePerGas} | To=${contractAddr}`);

        const tx = await wallet.connect(blockchain.highSpeedProvider || blockchain.provider).sendTransaction({
            to: contractAddr,
            data: blockchain.contract.interface.encodeFunctionData("placeBet", txArgs),
            value: amtWei,
            nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit: 300000,
            chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });

        console.log(`[AutoSigner] Trade broadcasted: ${tx.hash}`);

        // Return immediately so the UI feels instant and avoids Vercel/HTTP timeouts.
        res.json({ 
            success: true, 
            txHash: tx.hash,
            sessionAddress: sessionAddr,
            status: 'broadcasted'
        });

        // Background wait to monitor failure, log appropriately
        tx.wait().then(receipt => {
             if (receipt.status !== 1) console.error(`[AutoSigner] Trade Reverted: ${tx.hash}`);
             else console.log(`[AutoSigner] Trade MINED: ${tx.hash}`);
        }).catch(err => {
             console.error(`[AutoSigner] Trade Network/Wait Error: ${err.message}`);
        });

    } catch (e) {
        console.error(`[AutoSigner] Trade Failure:`, e.message);
        res.status(500).json({ error: e.message });
    }
});

// --- 3. Withdraw/Sweep Session Funds ---
app.post('/session/sweep', async (req, res) => {
    const { address } = req.body;
    try {
        const { wallet, address: sessionAddr } = deriveUserWallet(address);
        const balance = await blockchain.getSessionBalance(sessionAddr);
        
        const gasBuffer = ethers.parseEther("0.005");
        if (balance <= gasBuffer) {
            return res.status(400).json({ error: 'Balance too low to sweep (need > 0.005 for gas)' });
        }

        const sweepAmt = balance - gasBuffer;
        const fees = await blockchain._getGasPrice();
        const nonce = await nonceManager.getNonce(sessionAddr, blockchain.highSpeedProvider || blockchain.provider);

        const tx = await wallet.connect(blockchain.highSpeedProvider || blockchain.provider).sendTransaction({
            to: address,
            value: sweepAmt,
            nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit: 100000,
            chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });

        res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(sweepAmt) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 3.5. Trade API (Classic Mode Settlement) ---
app.post('/settle', async (req, res) => {
    try {
        const { id, exitPrice } = req.body;
        if (!id || !exitPrice) return res.status(400).json({ error: 'Missing parameters' });
        
        const tradeId = id.toString();
        const currentTrade = await redis.getTrade(tradeId);
        
        if (currentTrade) {
            // Only lock the price if it hasn't been locked yet
            if (!currentTrade.lockedExitPrice) {
                // Determine win/loss locally to set RESOLVING properly or just leave it for processor
                await redis.setTrade(tradeId, { 
                    ...currentTrade, 
                    lockedExitPrice: exitPrice.toString(),
                    status: 'RESOLVING' 
                });
                
                console.log(`[Backend/settle] Trade ${tradeId} locked exit price at ${exitPrice}`);
                
                // Immediately trigger settlement loop to process this trade right away
                const processor = require('./keeper/processor');
                processor._settleSingleTrade({ ...currentTrade, lockedExitPrice: exitPrice.toString(), status: 'RESOLVING' }, exitPrice).catch(e => console.error(`[Settle API] Immediate settle error:`, e));
            }
        }
        
        res.json({ success: true, lockedPrice: exitPrice });
    } catch (e) {
        console.error(`[Backend/settle] Error:`, e);
        res.status(500).json({ error: e.message });
    }
});

// --- 4. Platform Data API ---
app.get('/settings', async (req, res) => {
    const settings = await redis.getSettings();
    res.json(settings || { maintenanceMode: false, tradingHalted: false });
});

app.get('/broadcast', async (req, res) => {
    const b = await redis.getBroadcast();
    res.json(b || { active: false, message: "" });
});

app.get('/campaigns', async (req, res) => {
    const campaigns = await redis.getCampaigns();
    res.json(campaigns || []);
});

app.get('/protocol-stats', async (req, res) => {
    const history = await redis.getFullHistory();
    const volume = history.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);
    res.json({
        totalVolume: volume,
        totalTrades: history.length,
        activeTrades: (await redis.getAllActiveTrades()).length
    });
});

app.get('/history', async (req, res) => {
    const history = await redis.getFullHistory();
    // Sort by timestamp desc
    res.json(history.sort((a,b) => b.timestamp - a.timestamp).slice(0, 100));
});

app.get('/history/:address', async (req, res) => {
    const target = req.params.address.toLowerCase();
    const history = await redis.getFullHistory();
    const filtered = history.filter(t => 
        t.user?.toLowerCase() === target || 
        t.mainAddress?.toLowerCase() === target
    );
    res.json(filtered.sort((a,b) => b.timestamp - a.timestamp));
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', time: Date.now() }));

// --- Profiles API ---
app.get('/profiles/:address', async (req, res) => {
    try {
        const profile = await redis.getProfile(req.params.address);
        res.json(profile || null);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/profiles', async (req, res) => {
    try {
        const { address, username, xHandle, avatar, onboardedAt } = req.body;
        if (!address || !username) return res.status(400).json({ error: 'Missing address or username' });
        
        const profile = { address, username, xHandle, avatar, onboardedAt };
        await redis.saveProfile(address, profile);
        res.json({ success: true, profile });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 5. Admin API ---
app.get('/admin/stats', async (req, res) => {
    const stats = await redis.getStats();
    res.json(stats);
});

app.post('/admin/withdraw', async (req, res) => {
    const { amount, destination, token } = req.body;
    if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: 'Unauthorized' });

    try {
        const sendWei = ethers.parseEther(amount.toString());
        const tx = await blockchain.wallet.sendTransaction({
            to: destination,
            value: sendWei,
            chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });
        res.json({ success: true, txHash: tx.hash, amount: amount });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- 5. Real-Time Events ---
blockchain.onBetPlaced((data) => {
    io.emit('bet_placed', data);
});

// Start Server
const PORT = process.env.PORT || 3010;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    const processor = require('./keeper/processor'); 
    processor.init(); // CRITICAL: Start the settlement & payout engine
});

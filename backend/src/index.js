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
    cors: { origin: "*", methods: ["GET", "POST"] }
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
        
        const realisticGasBuffer = ethers.parseUnits("0.05", "ether"); 
        const totalNeeded = amtWei + realisticGasBuffer;

        if (balance < totalNeeded) {
            return res.status(400).json({ 
                error: `Insufficient Balance. Session wallet ${sessionAddr} has ${parseFloat(ethers.formatEther(balance)).toFixed(4)} USDC. Need ${cleanAmount} USDC stake + 0.05 for gas.` 
            });
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
        const receipt = await tx.wait();
        if (receipt.status !== 1) throw new Error("On-chain transaction failed");
        console.log(`[AutoSigner] Trade MINED: ${tx.hash}`);

        res.json({ 
            success: true, 
            txHash: tx.hash,
            sessionAddress: sessionAddr,
            status: 'mined'
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

// --- 4. Admin API ---
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

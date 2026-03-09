const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const processor = require('./keeper/processor');
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis'); // Now points to MemoryStore
const nonceManager = require('./services/nonceManager');
const keepAlive = require('./services/keepAlive'); // Pulse service to prevent sleep
const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}

const app = express();
const PORT = process.env.PORT || 3010;

// ===== PRODUCTION CORS OVERHAUL (Fixed Preflight Blocks) =====
app.use((req, res, next) => {
    // Explicitly allow all origins, methods, and headers for Vercel/Railway compatibility
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, Authorization");

    // Immediate success for preflight OPTIONS requests (Critical for 502/CORS fixes)
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    next();
});

app.use(express.json());

// Support both /arc/session/init and /session/init
app.use((req, res, next) => {
    if (req.url.startsWith('/arc/')) {
        req.url = req.url.replace('/arc/', '/');
    }
    if (req.url.startsWith('/arc-api/')) {
        req.url = req.url.replace('/arc-api/', '/');
    }
    next();
});

// ===== GLOBAL CRASH PROTECTOR =====
process.on('unhandledRejection', (reason, promise) => {
    console.error('CRITICAL: Unhandled Rejection at:', promise, 'reason:', reason);
    logToFile(`CRITICAL Unhandled Rejection: ${reason?.message || reason}`);
});

process.on('uncaughtException', (err) => {
    console.error('CRITICAL: Uncaught Exception:', err);
    logToFile(`CRITICAL Uncaught Exception: ${err.message}`);
    // Optional: exit if the error is non-recoverable
    // if (err.message.includes('EBADF')) process.exit(1);
});

// Helper to normalize legacy exaggerated numbers
const normalizeTrade = (t) => {
    if (!t) return t;
    if (t.amount && Number(t.amount) > 1000000) {
        try {
            t.amount = ethers.formatEther(t.amount.toString());
        } catch (e) { }
    }
    if (t.entryPrice && Number(t.entryPrice) > 100000000) {
        t.entryPrice = (Number(t.entryPrice) / 1e8).toFixed(8);
    }
    if (t.settlementPrice && Number(t.settlementPrice) > 100000000) {
        t.settlementPrice = (Number(t.settlementPrice) / 1e8).toFixed(8);
    }
    return t;
};

// Monitoring Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
});

app.get('/status', async (req, res) => {
    try {
        const block = await blockchain.provider.getBlockNumber().catch(e => "Disconnected");
        const redisStatus = redis.isCloud ? "Cloud Connected" : "Local Memory";
        res.json({
            status: 'online',
            network: 'arc-testnet-5042002',
            currentBlock: block,
            redis: redisStatus,
            uptime: process.uptime(),
            keeperAddress: blockchain.wallet?.address || "Unknown"
        });
    } catch (e) {
        res.status(500).json({ status: 'error', message: e.message });
    }
});

// Settings & Listings (Static/Config)
const SETTINGS_RESPONSE = {
    minBet: 0.1,
    maxBet: 1000000.0,
    maintenanceMode: false,
    tradingHalted: false,
    payoutMultipliers: { "5": 6.98, "10": 4.98, "15": 1.98 }
};

const LISTINGS_RESPONSE = [
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' }
];

// --- SESSION LOGIC (Deterministic Session Wallets) ---
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET;
if (!SESSION_MASTER_SECRET) {
    console.error("❌ CRITICAL: SESSION_MASTER_SECRET is missing in .env");
    // In production, we should probably exit, but for now we'll just log loudly
}
const SESSION_RPCS = [
    "https://rpc.testnet.arc.network",
    "https://rpc-test-1.arc.market",
    "https://5042002.rpc.thirdweb.com"
];
let sessionProvider = null;
async function getSessionProvider() {
    if (sessionProvider) {
        try {
            await sessionProvider.getBlockNumber();
            return sessionProvider;
        } catch (e) {
            console.warn("[Session] Provider health check failed, rotating...");
            sessionProvider = null;
        }
    }

    for (const rpc of SESSION_RPCS) {
        try {
            console.log(`[Session] Checking RPC: ${rpc}`);
            const provider = new ethers.JsonRpcProvider(rpc, 5042002, { staticNetwork: true });

            // Fast health check: 3s timeout for block number
            const blockNum = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 3000))
            ]);

            console.log(`[Session] RPC ${rpc} is Healthy (Block: ${blockNum})`);
            sessionProvider = provider;
            return provider;
        } catch (e) {
            console.warn(`[Session] RPC ${rpc} failed: ${e.message}`);
        }
    }

    // Final fallback: use the main blockchain provider if available
    if (blockchain.providerReady) return blockchain.provider;

    throw new Error("No healthy session providers available");
}

async function deriveUserWallet(userAddress) {
    if (!userAddress) return null;
    const addr = userAddress.toLowerCase();
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const provider = blockchain.provider || await getSessionProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    return { wallet, address: wallet.address };
}

app.get('/settings', (req, res) => res.json(SETTINGS_RESPONSE));
app.get('/listings', (req, res) => res.json(LISTINGS_RESPONSE));

// Helper for history (Shared between /history and /profile)
const getHistoryFor = async (address) => {
    try {
        const [historical, active] = await Promise.all([
            redis.getFullHistory(),
            redis.getAllActiveTrades()
        ]);

        // Merge both sets for a complete view
        const allTrades = [...historical, ...active];
        let trades = allTrades;

        if (address) {
            const addr = address.toLowerCase();
            const { address: sessionAddr } = await deriveUserWallet(addr);
            const sessionLower = sessionAddr.toLowerCase();

            trades = allTrades.filter(t =>
                t.user?.toLowerCase() === addr ||
                t.user?.toLowerCase() === sessionLower ||
                t.owner?.toLowerCase() === addr ||
                t.owner?.toLowerCase() === sessionLower
            );
        }

        return trades.sort((a, b) => (b.timestamp || b.startTime || 0) - (a.timestamp || a.startTime || 0)).slice(0, 100);
    } catch (e) {
        console.error('[History API] Error:', e);
        return [];
    }
};

// Support for historical/missing frontend routes
app.get('/campaigns', (req, res) => res.json([]));
app.get('/stats', (req, res) => res.json({ status: 'active', network: 'arc-testnet' }));

// --- MARKET SYNC (Missing in early versions) ---
let activeMarketId = 'eth';
app.get('/active-market', (req, res) => {
    res.json({ activeId: activeMarketId });
});

app.post('/active-market', (req, res) => {
    const { activeId } = req.body;
    if (activeId) {
        activeMarketId = activeId;
        console.log(`🎯 Active market synced to: ${activeId}`);
    }
    res.json({ success: true, activeId });
});

app.get('/settings', (req, res) => {
    res.json(SETTINGS_RESPONSE);
});

app.get('/listings', (req, res) => {
    res.json(LISTINGS_RESPONSE);
});

// ===== HISTORY ENDPOINT =====
app.get('/history/:address?', async (req, res) => {
    const { address } = req.params;
    const trades = await getHistoryFor(address);
    res.json(trades);
});

// Redirect /history for global feed
app.get('/history', async (req, res) => {
    const trades = await getHistoryFor();
    res.json(trades);
});

// ===== PROFILE ENDPOINT (Unified Sync) =====
app.get('/profile', async (req, res) => {
    try {
        const { address } = req.query;
        if (!address) return res.status(400).json({ error: 'Address required' });

        const history = await getHistoryFor(address);

        // Stats calculation
        const stats = {
            totalTrades: history.length,
            totalWins: history.filter(t => t.status === 'WON').length,
            totalVolume: history.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toFixed(2)
        };

        res.json({
            profile: {
                username: `Trader_${address.slice(2, 6)}`,
                avatar: ``,
                address: address
            },
            stats,
            history: history,
            transactions: [] // TODO: Implement if needed
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== SETTLEMENT TRIGGER (Frontend calls this when timer hits 0) =====
app.post('/settle', async (req, res) => {
    try {
        const { id, exitPrice } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing bet ID' });

        logToFile(`[SETTLE] 🔔 Manual settlement signal for ${id} (Price: ${exitPrice || 'auto'})`);

        const trade = await redis.getTrade(id);
        if (trade) {
            // 🔥 INSTANT BACKEND RECORD: 
            // Update Redis immediately so the source of truth reflects the win/loss instantly.
            const trunc2 = (v) => Math.floor(parseFloat(v) * 100) / 100;
            const entryPrice = trunc2(trade.entryPrice);
            const exitPriceNum = trunc2(exitPrice || entryPrice);

            const isUp = (trade.direction === 1 || trade.direction === "UP" || trade.direction === "buy");
            // Use 2 decimal precision for win/loss determination as requested
            const isWin = isUp ? (exitPriceNum > entryPrice) : (exitPriceNum < entryPrice);

            const duration = Number(trade.duration) || 15;
            const multiplier = duration <= 5 ? 6.98 : (duration <= 10 ? 4.98 : 1.98);
            // Truncate payout to 2 decimals
            const payout = isWin ? (Math.floor(Number(trade.amount) * multiplier * 100) / 100).toFixed(2) : "0.00";

            // Mark as settled in Redis immediately to satisfy the 'Real' requirement
            await redis.addHistoricalTrade({
                id: id,
                status: isWin ? "WON" : "LOST",
                settlementPrice: exitPriceNum.toFixed(2),
                payout: payout,
                settled: true
            });

            // Trigger on-chain settlement in the BACKGROUND
            processor._settleSingleTrade(trade, exitPrice).catch(e => {
                logToFile(`[SETTLE] ❌ Background settlement failed for ${id}: ${e.message}`);
            });

            // Return success instantly
            return res.json({ success: true, status: isWin ? "WON" : "LOST", payout });
        } else {
            res.status(404).json({ error: 'Trade not found in active session' });
        }
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== HIGH-SPEED TRADE REGISTRATION =====
app.post('/trade-ping', async (req, res) => {
    try {
        const { id, address, amount, direction, duration, entryPrice, symbol } = req.body;
        const trunc2 = (v) => Math.floor(parseFloat(v) * 100) / 100;
        const tradeData = {
            id: id.toString(),
            user: address,
            amount: amount,
            direction: direction,
            duration: duration,
            entryPrice: trunc2(Number(entryPrice) / 1e8).toFixed(2),
            symbol: symbol || 'BTC',
            expiry: Date.now() + (duration * 1000),
            confirmed: true,
            startTime: Date.now()
        };
        await redis.setTrade(id, tradeData);
        logToFile(`[PING] Registered trade ${id} for ${address} (Price: ${tradeData.entryPrice})`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/protocol-stats', async (req, res) => {
    try {
        const history = await getHistoryFor();
        const activeTrades = await redis.getAllActiveTrades(true); // Filter settling trades so UI doesn't glitch

        const totalVolume = history.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const uniqueWallets = new Set(history.map(t => t.user.toLowerCase())).size;

        res.json({
            totalVolume: totalVolume.toFixed(2),
            wallets: uniqueWallets,
            activeCount: activeTrades.length,
            totalTrades: history.length,
            activeStakes: activeTrades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0),
            autoSignerFees: { arc: (totalVolume * 0.01).toFixed(2) } // Estimate 1% fee for display
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/treasury', async (req, res) => {
    const balance = await blockchain.getNativeBalance(process.env.ARC_CONTRACT_ADDRESS);
    res.json({ balance: balance.toString(), formatted: ethers.formatEther(balance) + ' USDC' });
});

app.post('/session/init', async (req, res) => {
    try {
        const { address } = req.body;
        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        logToFile(`[SESSION_INIT] 🛠️ Initializing for ${address} -> Session: ${sessionAddr}`);
        const balance = await wallet.provider.getBalance(sessionAddr);
        res.json({ sessionAddress: sessionAddr, balance: ethers.formatEther(balance) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/session/trade', async (req, res) => {
    try {
        const { address, tradeParams } = req.body;
        const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;

        logToFile(`[SESSION_TRADE] 🚀 INCOMING: Bet ${id} for ${address} (${amount} USDC)`);

        if (!id || !address || !amount) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const lockTrade = await redis.lockTrade(id);
        if (!lockTrade) {
            logToFile(`[SESSION_TRADE] 🛑 Bet ${id} already being processed (locked)`);
            return res.status(409).json({ error: 'Trade already in progress' });
        }

        // Fetch Wallet & Provider
        const derivationStart = Date.now();
        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        logToFile(`[SESSION_TRADE] 👛 Sync took ${Date.now() - derivationStart}ms (${sessionAddr})`);

        redis.saveSessionMapping(sessionAddr, address).catch(() => { });

        // Pre-flight consistency check
        logToFile(`[SESSION_TRADE] 📡 Fetching balance/nonce/gas for ${sessionAddr}...`);
        const preflightStart = Date.now();
        const [balance, nonce, fees] = await Promise.all([
            wallet.provider.getBalance(sessionAddr),
            nonceManager.getNonce(sessionAddr, wallet.provider),
            blockchain._getGasPrice()
        ]);
        logToFile(`[SESSION_TRADE] 📡 Pre-flight took ${Date.now() - preflightStart}ms (Bal: ${ethers.formatEther(balance)}, Nonce: ${nonce})`);

        const amtNum = parseFloat(amount);
        const amtWei = ethers.parseUnits(amtNum.toFixed(18), 18);

        if (balance < amtWei) {
            const err = `Insufficient Session Balance: ${ethers.formatEther(balance)} USDC vs ${amount} USDC needed`;
            logToFile(`[SESSION_TRADE] ❌ ${err}`);
            throw new Error(err);
        }

        const txArgs = {
            to: process.env.ARC_CONTRACT_ADDRESS,
            data: blockchain.contract.interface.encodeFunctionData("placeBet", [
                BigInt(id),
                Number(direction),
                BigInt(duration),
                BigInt(entryPrice),
                Number(marketId),
                sessionAddr // Pay Payout back to session address for auto-signer trades
            ]),
            value: amtWei,
            nonce: nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit: 800000n, // Fixed limit for consistency
            type: 2,
            chainId: 5042002
        };

        logToFile(`[SESSION_TRADE] ✍️ Broadcasting TX for bet ${id}...`);
        const broadcastStart = Date.now();
        const tx = await wallet.sendTransaction(txArgs);
        logToFile(`[SESSION_TRADE] ✅ Broadcasted ${id} in ${Date.now() - broadcastStart}ms: ${tx.hash}`);

        // Immediate Redis Register
        const trunc2 = (v) => Math.floor(parseFloat(v) * 100) / 100;
        const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
        const symbol = ID_ASSET_MAP[Number(marketId)] || 'BTC';

        const tradeData = {
            id: id.toString(),
            user: address,
            amount: amount,
            direction: direction,
            duration: duration,
            entryPrice: trunc2(Number(entryPrice) / 1e8).toFixed(2),
            symbol: symbol,
            expiry: Date.now() + (duration * 1000),
            txHash: tx.hash,
            startTime: Date.now(),
            confirmed: false
        };
        await redis.setTrade(id, tradeData);

        res.json({ success: true, txHash: tx.hash, confirmed: false });

        // Non-blocking background confirmation
        tx.wait(1).then(async (receipt) => {
            if (receipt && receipt.status === 1) {
                const updatedData = { ...tradeData, confirmed: true };
                await redis.setTrade(id, updatedData);
                logToFile(`[SESSION_TRADE] ⛓️ Confirmed ${id}: ${tx.hash}`);
            } else {
                logToFile(`[SESSION_TRADE] ❌ Reverted ${id}: ${tx.hash}`);
                await redis.delTrade(id);
            }
        }).catch(err => {
            logToFile(`[SESSION_TRADE] ❌ background wait failed for ${tx.hash}: ${err.message}`);
        });

    } catch (e) {
        logToFile(`[SESSION_TRADE] ❌ Error: ${e.message}`);
        if (e.message.includes('nonce') || e.message.includes('already been used') || e.message.includes('too low')) {
            try {
                const { address: sessionAddr } = await deriveUserWallet(req.body.address);
                await nonceManager.syncWithChain(sessionAddr, blockchain.provider);
            } catch (err) { }
        }
        if (!res.headersSent) res.status(500).json({ error: e.message });
    } finally {
        if (req.body.tradeParams?.id) {
            await redis.unlockTrade(req.body.tradeParams.id);
        }
    }
});

app.post('/session/withdraw', async (req, res) => {
    try {
        const { address, amount } = req.body;
        if (!address) return res.status(400).json({ error: 'Missing main address' });

        logToFile(`[WITHDRAW] 💸 Request from ${address} for ${amount} USDC`);
        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        const nonce = await nonceManager.getNonce(sessionAddr, wallet.provider);

        const balance = await wallet.provider.getBalance(sessionAddr);
        const amountWei = amount ? ethers.parseUnits(amount.toString(), 18) : balance;

        const fees = await blockchain._getGasPrice();
        let gasPrice = fees.gasPrice;
        const minGasPrice = ethers.parseUnits("50", "gwei");
        if (gasPrice < minGasPrice) gasPrice = minGasPrice;

        const gasLimit = 21000n;
        const gasCost = gasLimit * gasPrice;

        // Ensure we don't drain gas money
        const sweepAmt = amountWei > (balance - gasCost) ? (balance - gasCost) : amountWei;

        if (sweepAmt <= 0n) {
            return res.status(400).json({ error: "Balance too low for gas" });
        }

        logToFile(`[WITHDRAW] 🚀 Sweeping ${ethers.formatEther(sweepAmt)} USDC from ${sessionAddr} to ${address}`);

        const tx = await wallet.sendTransaction({
            to: address,
            value: sweepAmt,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit,
            nonce,
            type: 2,
            chainId: 5042002
        });

        res.json({ success: true, txHash: tx.hash });
    } catch (e) {
        logToFile(`[WITHDRAW] ❌ Error: ${e.message}`);
        if (e.message.includes('nonce') || e.message.includes('already been used') || e.message.includes('too low')) {
            try {
                const { address: sessionAddr } = await deriveUserWallet(req.body.address);
                const provider = await getSessionProvider();
                await nonceManager.syncWithChain(sessionAddr, provider);
            } catch (syncErr) { }
        }
        res.status(500).json({ error: e.message });
    }
});

app.get('/debug-logs', (req, res) => {
    try {
        const fs = require('fs');
        const logs = fs.readFileSync(LOG_FILE, 'utf8').split('\n').reverse().slice(0, 200).join('\n');
        res.type('text/plain').send(logs);
    } catch (e) {
        res.status(500).send(e.message);
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Fast & Decentralized running on port ${PORT}`);
    processor.init();
    keepAlive.startKeepAlive();
});

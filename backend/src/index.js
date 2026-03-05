const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const processor = require('./keeper/processor');
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis'); // Now points to MemoryStore
const nonceManager = require('./services/nonceManager');
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
        t.entryPrice = (Number(t.entryPrice) / 1e8).toFixed(3);
    }
    if (t.settlementPrice && Number(t.settlementPrice) > 100000000) {
        t.settlementPrice = (Number(t.settlementPrice) / 1e8).toFixed(3);
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
    "https://5042002.rpc.thirdweb.com",
    "https://rpc.testnet.arc.network"
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
            const provider = new ethers.JsonRpcProvider(rpc, 5042002, { staticNetwork: true });
            await provider.getBlockNumber();
            console.log(`[Session] Connected to RPC: ${rpc}`);
            sessionProvider = provider;
            return provider;
        } catch (e) {
            console.warn(`[Session] RPC failed: ${rpc}`);
        }
    }
    return new ethers.JsonRpcProvider(SESSION_RPCS[0], 5042002, { staticNetwork: true });
}

async function deriveUserWallet(userAddress) {
    if (!userAddress) return null;
    const addr = userAddress.toLowerCase();
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const provider = await getSessionProvider();
    const wallet = new ethers.Wallet(privateKey, provider);
    // Don't await nonce here, let callers use nonceManager
    return { wallet, address: wallet.address };
}

app.get('/settings', (req, res) => res.json(SETTINGS_RESPONSE));
app.get('/listings', (req, res) => res.json(LISTINGS_RESPONSE));

// Helper for history (Shared between /history and /profile)
const getHistoryFor = async (address) => {
    try {
        const allTrades = await redis.getFullHistory();
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

            logToFile(`[History API] Serving ${trades.length} indexed trades for ${addr}`);
        }

        return trades.sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);
    } catch (e) {
        console.error('[History API] Error:', e);
        return [];
    }
};

// Support for historical/missing frontend routes
app.get('/campaigns', (req, res) => res.json([]));
app.get('/stats', (req, res) => res.json({ status: 'active', network: 'arc-testnet' }));

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

        logToFile(`[SETTLE] 🔔 Received manual settlement request for ${id} (Price: ${exitPrice || 'auto'})`);

        // The processor handles the heavy lifting
        const trade = await redis.getTrade(id);
        if (trade) {
            await processor._settleSingleTrade(trade, exitPrice);
            res.json({ success: true, message: 'Settlement triggered' });
        } else {
            // If not in memory (e.g. server restart), try to recover from chain then settle
            // For now, responsive error
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
        const tradeData = {
            id: id.toString(),
            user: address,
            amount: amount,
            direction: direction,
            duration: duration,
            entryPrice: (Number(entryPrice) / 1e8).toFixed(4),
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
            autoSignerFees: { arc: (totalVolume * 0.01).toFixed(4) } // Estimate 1% fee for display
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

        if (!address) throw new Error("Main wallet address required");

        // --- DOUBLE DEBIT PREVENTION ---
        // 1. Check if ID exists (even if not confirmed yet)
        const existing = await redis.getTrade(id);
        if (existing && existing.txHash) {
            logToFile(`[SESSION_TRADE] ℹ️ Returning existing trade for ${id}: ${existing.txHash}`);
            return res.json({ success: true, txHash: existing.txHash, confirmed: existing.confirmed });
        }

        // 2. Lock the ID to prevent concurrent duplicate processing
        const locked = await redis.lockTrade(id, 60);
        if (!locked) {
            return res.status(409).json({ error: "Trade is already being processed. Please wait." });
        }

        logToFile(`[SESSION_TRADE] 🏁 Start: BetId ${id} for ${address}`);

        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        const nonce = await nonceManager.getNonce(sessionAddr, wallet.provider);
        // Ensure mapping is saved
        redis.saveSessionMapping(sessionAddr, address).catch(() => { });

        // 1. Balance Check
        if (!amount || isNaN(amount)) throw new Error("Invalid trade amount");
        const amountWei = ethers.parseUnits(amount.toString(), 18);
        const balance = await wallet.provider.getBalance(sessionAddr);

        // Gas estimation - use actual network fees with a modest buffer (NOT the keeper's aggressive settlement fees)
        const feeData = await wallet.provider.getFeeData();
        const networkGasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");

        // Session trades: 2x network price with a reasonable floor of 50 gwei
        const sessionGasPrice = networkGasPrice * 2n;
        const minSessionGas = ethers.parseUnits("50", "gwei");
        const effectiveGasPrice = sessionGasPrice > minSessionGas ? sessionGasPrice : minSessionGas;

        // Use a tighter gas limit for balance checking (actual usage is ~300-400k)
        const estimatedGasLimit = 500000n;
        const gasCostEstimate = effectiveGasPrice * estimatedGasLimit;
        const totalNeeded = amountWei + gasCostEstimate;

        if (balance < totalNeeded) {
            throw new Error(`Insufficient session balance. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(totalNeeded)} (Amount + Gas)`);
        }

        logToFile(`[SESSION_TRADE] 🚀 Sending Tx for ${id} (Value: ${amount} USDC, Gas: ~${ethers.formatEther(gasCostEstimate)} USDC)`);

        // For the actual TX, use the keeper's gas prices to ensure it gets included quickly
        const fees = await blockchain._getGasPrice();

        const txArgs = {
            to: process.env.ARC_CONTRACT_ADDRESS,
            data: blockchain.contract.interface.encodeFunctionData("placeBet", [
                BigInt(id),
                Number(direction),
                BigInt(duration),
                BigInt(entryPrice),
                Number(marketId),
                sessionAddr // Payout goes to SESSION wallet for auto-signer trades
            ]),
            value: amountWei,
            gasLimit: 800000n,
            nonce: nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            type: 2 // Use EIP-1559 for auto-signer trades if supported
        };

        // Try to estimate or call first to catch revert reasons
        try {
            await wallet.estimateGas(txArgs);
        } catch (estError) {
            logToFile(`[SESSION_TRADE] ⚠️ Dry run failed: ${estError.message}`);
            // We still proceed if it's just an estimation error, but log it
        }

        const tx = await wallet.sendTransaction(txArgs);
        logToFile(`[SESSION_TRADE] ⛓️ Tx sent: ${tx.hash}. Returning to UI for background confirmation...`);

        // Return immediately to keep UI responsive
        res.json({ success: true, txHash: tx.hash, confirmed: false });

        // WAIT FOR CONFIRMATION in background (Non-blocking)
        tx.wait().then(async (receipt) => {
            if (receipt.status === 1) {
                // Register in memory store for settlement tracking
                const tradeData = {
                    id: id.toString(),
                    user: address,
                    sessionUser: sessionAddr,
                    amount: amount,
                    direction: direction,
                    duration: duration,
                    entryPrice: (Number(entryPrice) / 1e8).toFixed(4),
                    marketId: marketId,
                    expiry: Date.now() + (duration * 1000),
                    txHash: tx.hash,
                    confirmed: true,
                    startTime: Date.now()
                };
                await redis.setTrade(id, tradeData);
                logToFile(`[SESSION_TRADE] ✅ Background Confirmed: ${tx.hash}`);
            }
        }).catch(err => {
            logToFile(`[SESSION_TRADE] ❌ Background Wait Failed for ${tx.hash}: ${err.message}`);
        });

        return; // Ensure no double response
    } catch (e) {
        logToFile(`[SESSION_TRADE] ❌ Error: ${e.message}`);
        const { address: sessionAddr } = await deriveUserWallet(req.body.address);
        if (e.message.includes('nonce') || e.message.includes('already been used') || e.message.includes('too low')) {
            await nonceManager.syncWithChain(sessionAddr, blockchain.provider);
        }
        res.status(500).json({ error: e.message });
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
});

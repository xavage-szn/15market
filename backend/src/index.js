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

app.use(cors());
app.use(express.json());

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
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
];
let sessionProvider = null;
async function getSessionProvider() {
    if (sessionProvider) return sessionProvider;
    const provider = new ethers.JsonRpcProvider(SESSION_RPCS[0], 5042002, { staticNetwork: true });
    sessionProvider = provider;
    return provider;
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
        const activeTrades = await redis.getAllActiveTrades();

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
        logToFile(`[SESSION_TRADE] 🏁 Start: BetId ${id} for ${address}`);

        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        const nonce = await nonceManager.getNonce(sessionAddr, wallet.provider);
        // Ensure mapping is saved
        redis.saveSessionMapping(sessionAddr, address).catch(() => { });

        // 1. Balance Check
        if (!amount || isNaN(amount)) throw new Error("Invalid trade amount");
        const amountWei = ethers.parseUnits(amount.toString(), 18);
        const balance = await wallet.provider.getBalance(sessionAddr);

        // Estimating gas (roughly 500k-800k)
        // Estimating gas
        const gasPrice = await blockchain._getGasPrice();
        const gasLimit = 800000n;
        const totalNeeded = amountWei + (gasPrice * gasLimit);

        if (balance < totalNeeded) {
            throw new Error(`Insufficient session balance. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(totalNeeded)} (Amount + Gas)`);
        }

        logToFile(`[SESSION_TRADE] 🚀 Sending Tx for ${id} (Value: ${amount} USDC)`);

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
            type: 0 // Force Legacy for Arc compatibility
        };

        // Fee logic - always bump for speed but stay legacy
        txArgs.gasPrice = gasPrice;

        // Try to estimate or call first to catch revert reasons
        try {
            await wallet.estimateGas(txArgs);
        } catch (estError) {
            logToFile(`[SESSION_TRADE] ⚠️ Dry run failed: ${estError.message}`);
            // We still proceed if it's just an estimation error, but log it
        }

        const tx = await wallet.sendTransaction(txArgs);
        logToFile(`[SESSION_TRADE] ⛓️ Tx sent: ${tx.hash}, waiting for confirmation...`);

        // WAIT FOR CONFIRMATION (Strict Logic)
        const receipt = await tx.wait();
        if (receipt.status !== 1) {
            throw new Error("Transaction reverted on-chain");
        }

        // Register in memory store for settlement tracking
        const tradeData = {
            id: id.toString(),
            user: address, // Track by main address for UI consistency
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

        logToFile(`[SESSION_TRADE] ✅ Confirmed & Registered: ${tx.hash}`);
        res.json({ success: true, txHash: tx.hash, confirmed: true });
    } catch (e) {
        logToFile(`[SESSION_TRADE] ❌ Error: ${e.message}`);
        const { address: sessionAddr } = await deriveUserWallet(req.body.address);
        if (e.message.includes('nonce') || e.message.includes('already been used')) {
            await nonceManager.syncWithChain(sessionAddr, blockchain.provider);
        }
        res.status(500).json({ error: e.message });
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

        if (balance < amountWei) {
            return res.status(400).json({ error: `Insufficient session balance: ${ethers.formatEther(balance)} USDC` });
        }

        const feeData = await wallet.provider.getFeeData();
        const gasPrice = (feeData.gasPrice || ethers.parseUnits("30", "gwei")) * 300n / 100n; // 3x bump for speed
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
            gasPrice,
            gasLimit,
            nonce,
            type: 0,
            chainId: 5042002
        });

        res.json({ success: true, txHash: tx.hash });
    } catch (e) {
        logToFile(`[WITHDRAW] ❌ Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Server] Fast & Decentralized running on port ${PORT}`);
    processor.init();
});

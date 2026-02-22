const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const processor = require('./keeper/processor');
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis'); // Now points to MemoryStore
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
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
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
    const nonce = await provider.getTransactionCount(wallet.address, 'pending');
    await redis.saveSessionMapping(wallet.address, addr);
    return { wallet, address: wallet.address, nonce };
}

app.get('/settings', (req, res) => res.json(SETTINGS_RESPONSE));
app.get('/listings', (req, res) => res.json(LISTINGS_RESPONSE));

// Helper for history (Shared between /history and /profile)
const getHistoryFor = async (address) => {
    try {
        const currentBlock = await blockchain.getCurrentBlock();
        const fromBlock = Math.max(0, currentBlock - 500000); // Extended range for history sync

        const [placed, settled] = await Promise.all([
            blockchain.getPastEvents("BetPlaced", fromBlock),
            blockchain.getPastEvents("BetSettled", fromBlock)
        ]);

        const settledMap = new Map();
        settled.forEach(e => {
            settledMap.set(e.args.id.toString(), {
                status: e.args.won ? 'WON' : 'LOST',
                settlementPrice: (Number(e.args.settlementPrice) / 1e8).toFixed(3),
                payout: ethers.formatEther(e.args.payout)
            });
        });

        let trades = placed.map(e => {
            const id = e.args.id.toString();
            const s = settledMap.get(id);
            return {
                id,
                user: e.args.user,
                amount: ethers.formatEther(e.args.amount),
                direction: Number(e.args.direction) === 1 ? 'UP' : 'DOWN',
                duration: Number(e.args.duration),
                entryPrice: (Number(e.args.entryPrice) / 1e8).toFixed(3),
                timestamp: Number(e.args.timestamp) * 1000,
                status: s ? s.status : 'PENDING',
                settlementPrice: s ? s.settlementPrice : null,
                payout: s ? s.payout : null
            };
        });

        if (address) {
            const addr = address.toLowerCase();
            const { address: sessionAddr } = await deriveUserWallet(addr);
            const sessionLower = sessionAddr.toLowerCase();

            trades = trades.filter(t =>
                t.user.toLowerCase() === addr ||
                t.user.toLowerCase() === sessionLower
            );

            logToFile(`[History Sync] Merged ${trades.length} trades for ${addr} (Main) + ${sessionLower} (Session)`);
        }

        return trades.sort((a, b) => b.timestamp - a.timestamp);
    } catch (e) {
        console.error('[History Helper] Error:', e);
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
        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing bet ID' });

        logToFile(`[SETTLE] 🔔 Received manual settlement request for ${id}`);

        // The processor handles the heavy lifting
        const trade = await redis.getTrade(id);
        if (trade) {
            await processor._settleSingleTrade(trade);
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
            entryPrice: entryPrice,
            symbol: symbol || 'BTC',
            expiry: Date.now() + (duration * 1000)
        };
        await redis.setTrade(id, tradeData);
        logToFile(`[PING] Registered trade ${id} for ${address}`);
        res.json({ success: true });
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

        const { wallet, address: sessionAddr, nonce } = await deriveUserWallet(address);
        const provider = wallet.provider;

        // 1. Balance Check
        if (!amount || isNaN(amount)) throw new Error("Invalid trade amount");
        const amountWei = ethers.parseUnits(amount.toString(), 18);
        const balance = await provider.getBalance(sessionAddr);

        // Estimating gas (roughly 500k-800k)
        const feeData = await provider.getFeeData();
        const gasPrice = (feeData.gasPrice || feeData.maxFeePerGas || ethers.parseUnits("10", "gwei")) * 150n / 100n;
        const totalNeeded = amountWei + (gasPrice * 800000n);

        if (balance < totalNeeded) {
            throw new Error(`Insufficient session balance. Have ${ethers.formatEther(balance)}, need ${ethers.formatEther(totalNeeded)} (Amount + Gas)`);
        }

        logToFile(`[SESSION_TRADE] 🚀 Sending Tx for ${id} (Value: ${amount} USDC)`);

        // Use the user's MAIN address as the payout address, not the session wallet
        const txArgs = {
            to: process.env.ARC_CONTRACT_ADDRESS,
            data: blockchain.contract.interface.encodeFunctionData("placeBet", [
                BigInt(id),
                Number(direction),
                BigInt(duration),
                BigInt(entryPrice),
                Number(marketId),
                address // Payout goes to MAIN wallet
            ]),
            value: amountWei,
            gasLimit: 800000n,
            nonce: nonce,
            chainId: 5042002
        };

        if (feeData.maxFeePerGas) {
            txArgs.maxFeePerGas = (feeData.maxFeePerGas * 150n / 100n);
            txArgs.maxPriorityFeePerGas = (feeData.maxPriorityFeePerGas * 150n / 100n);
            txArgs.type = 2;
        } else {
            txArgs.gasPrice = (feeData.gasPrice || ethers.parseUnits("30", "gwei")) * 150n / 100n;
            txArgs.type = 0;
        }

        const tx = await wallet.sendTransaction(txArgs);

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
            txHash: tx.hash
        };
        await redis.setTrade(id, tradeData);

        logToFile(`[SESSION_TRADE] ✅ Sent: ${tx.hash}`);
        res.json({ success: true, txHash: tx.hash });
    } catch (e) {
        logToFile(`[SESSION_TRADE] ❌ Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

app.post('/session/withdraw', async (req, res) => {
    try {
        const { address, amount } = req.body;
        if (!address) return res.status(400).json({ error: 'Missing main address' });

        logToFile(`[WITHDRAW] 💸 Request from ${address} for ${amount} USDC`);
        const { wallet, address: sessionAddr, nonce } = await deriveUserWallet(address);

        const balance = await wallet.provider.getBalance(sessionAddr);
        const amountWei = amount ? ethers.parseUnits(amount.toString(), 18) : balance;

        if (balance < amountWei) {
            return res.status(400).json({ error: `Insufficient session balance: ${ethers.formatEther(balance)} USDC` });
        }

        const feeData = await wallet.provider.getFeeData();
        const gasPrice = (feeData.gasPrice * 150n) / 100n; // 50% bump for speed
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

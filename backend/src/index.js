const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const processor = require('./keeper/processor');
// const roundsProcessor = require('./keeper/roundsProcessor'); // Removed for separation
// const botService = require('./services/botService'); // Removed for separation
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis');
const nonceManager = require('./services/nonceManager');
const keepAlive = require('./services/keepAlive'); // Pulse service to prevent sleep
const fs = require('fs');

const LOG_FILE = path.join(__dirname, '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}

const app = express();
const PORT = process.env.PORT || 3010;

// ===== PRODUCTION CORS OVERHAUL (Fixed Preflight Blocks) =====
app.use((req, res, next) => {
    // Explicitly allow all origins, methods, and headers for cross-origin compatibility
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

app.get('/time', (req, res) => {
    res.json({ time: Date.now() });
});

// Support various API prefixes used by the frontend (arc, arc-api, api-arc)
app.use((req, res, next) => {
    // Regex to strip any of the common prefixes: /arc/, /arc-api/, /api-arc/
    req.url = req.url.replace(/^\/(arc|arc-api|api-arc)\//, '/');
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
const getSessionRpcs = () => {
    // Official Arc + dRPC only (Thirdweb/Quicknode removed — hit rate limits)
    return [
        "https://rpc.testnet.arc.network",
        "https://arc-testnet.drpc.org",
        "https://rpc.drpc.testnet.arc.network"
    ];
};

let sessionProvider = null;
async function getSessionProvider() {
    return blockchain.provider;
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

// Rounds logic has been moved to a separate microservice (rounds-backend)

// Helper for history (Shared between /history and /profile)
const getHistoryFor = async (address, limit = 100) => {
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

        const sorted = trades.sort((a, b) => (b.timestamp || b.startTime || 0) - (a.timestamp || a.startTime || 0));
        return limit > 0 ? sorted.slice(0, limit) : sorted;
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

        // Fetch FULL history for accurate stats
        const allHistory = await getHistoryFor(address, 0);

        // Stats calculation on ALL trades
        const stats = {
            totalTrades: allHistory.length,
            totalWins: allHistory.filter(t => t.status === 'WON').length,
            totalVolume: allHistory.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toFixed(2)
        };

        res.json({
            profile: {
                username: `Trader_${address.slice(2, 6)}`,
                avatar: ``,
                address: address
            },
            stats,
            history: allHistory.slice(0, 100), // Return only latest 100 as display history
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
            // 🔥 FRONTEND SOURCE OF TRUTH: 
            // We use the exitPrice provided by the frontend if it exists. 
            // This ensures the outcome shown to the user is exactly what is settled on-chain.

            const cleanPrice = (p) => parseFloat(p);
            const entryPrice = cleanPrice(trade.entryPrice);
            const exitPriceNum = cleanPrice(exitPrice || entryPrice);

            const isUp = (trade.direction === 1 || trade.direction === "UP" || trade.direction === "buy");

            // CRITICAL: Use high precision for win/loss determination to match on-chain contract logic
            const isWin = isUp ? (exitPriceNum > entryPrice) : (exitPriceNum < entryPrice);

            const duration = Number(trade.duration) || 15;
            const multiplier = duration <= 5 ? 6.98 : (duration <= 10 ? 4.98 : 1.98);
            const payout = isWin ? (Math.floor(Number(trade.amount) * multiplier * 100) / 100).toFixed(2) : "0.00";

            // Mark as settled in Redis immediately
            const settlementData = {
                id: id,
                status: isWin ? "WON" : "LOST",
                settlementPrice: exitPriceNum.toFixed(8),
                payout: payout,
                settled: true,
                lockedExitPrice: exitPriceNum.toFixed(8) // Save this so background processor uses it too
            };

            // Update history
            await redis.addHistoricalTrade(settlementData);

            // Update active trade so current session/polls see the finalized result
            await redis.setTrade(id, {
                ...trade,
                ...settlementData
            });

            // Trigger on-chain settlement in the BACKGROUND
            processor._settleSingleTrade(trade, exitPriceNum.toFixed(8)).catch(e => {
                logToFile(`[SETTLE] ❌ Background settlement failed for ${id}: ${e.message}`);
            });

            return res.json({ success: true, status: isWin ? "WON" : "LOST", payout });
        } else {
            // Check if already settled on-chain
            const isSettled = await blockchain.isBetSettled(id);
            if (isSettled) return res.json({ success: true, note: 'Already settled' });
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
            // Maintain 8 decimals for consistency with contract precision
            entryPrice: (Number(entryPrice) / 1e8).toFixed(8),
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
        let { wallet, address: sessionAddr } = await deriveUserWallet(address);
        logToFile(`[SESSION_TRADE] 👛 Sync took ${Date.now() - derivationStart}ms (${sessionAddr})`);

        redis.saveSessionMapping(sessionAddr, address).catch(() => { });

        // Pre-flight consistency check (Decoupled & More Resilient)
        logToFile(`[SESSION_TRADE] 📡 Preparing pre-flight for ${sessionAddr}...`);
        const preflightStart = Date.now();
        let balance = 0n, nonce, fees;

        // 1. Get Fees (Fastest)
        try {
            fees = await blockchain._getGasPrice();
        } catch (e) {
            fees = { maxFeePerGas: 300000000000n, maxPriorityFeePerGas: 150000000000n, gasPrice: 300000000000n }; // Safe fallback
        }

        // 2. Get Nonce (Crucial for broadcast)
        for (let i = 0; i < 3; i++) {
            try {
                nonce = await nonceManager.getNonce(sessionAddr, blockchain.provider);
                break;
            } catch (e) {
                if (i === 2) throw new Error("Nonce sync failed: " + e.message);
                await blockchain.rotateRpc();
            }
        }

        // 3. Get Balance (Most likely to timeout, use optimistic fallback)
        try {
            balance = await Promise.race([
                blockchain.provider.getBalance(sessionAddr),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 20000))
            ]);
            // Cache for reliability
            await redis.redis.set(`bal:${sessionAddr}`, balance.toString(), 'EX', 300);
        } catch (e) {
            logToFile(`[SESSION_TRADE] ⚠️ Balance check failed, using optimistic cloud cache...`);
            const cached = await redis.redis.get(`bal:${sessionAddr}`);
            if (cached) balance = BigInt(cached);
            else {
                // Final desperation: assume balance is sufficient if we just refilled
                logToFile(`[SESSION_TRADE] ⚠️ No cached balance. Proceeding optimistically...`);
                balance = ethers.parseUnits("1000", 18); // Assume success to let the TX flow
            }
        }
        logToFile(`[SESSION_TRADE] 📡 Pre-flight ready in ${Date.now() - preflightStart}ms (Nonce: ${nonce})`);

        const amtNum = parseFloat(amount);
        const amtWei = ethers.parseUnits(amtNum.toFixed(18), 18);

        // Calculate gas buffer based on MAX fee to be conservative
        const maxGasCost = BigInt(800000) * fees.maxFeePerGas;
        const totalNeeded = amtWei + maxGasCost;

        logToFile(`[SESSION_TRADE] 💰 Balance Check: Current=${ethers.formatEther(balance)}, Required=${ethers.formatEther(totalNeeded)} (Stake: ${amount} + MaxGas: ${ethers.formatEther(maxGasCost)})`);

        if (balance < totalNeeded) {
            const err = `Insufficient Session Balance: ${ethers.formatEther(balance)} USDC. Need ${ethers.formatEther(totalNeeded)} USDC (Stake: ${amount} + Gas Buffer: ${ethers.formatEther(maxGasCost)})`;
            logToFile(`[SESSION_TRADE] ❌ ${err}`);
            return res.status(400).json({ error: err });
        }

        logToFile(`[SESSION_TRADE] 📝 Preparing TX (Nonce: ${nonce}, Gas: ${ethers.formatUnits(fees.gasPrice, 'gwei')} gwei, Value: ${amtNum} USDC)`);

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

        logToFile(`[SESSION_TRADE] ✍️ Broadcasting TX for bet ${id} (Nonce: ${nonce})...`);
        const broadcastStart = Date.now();
        let tx;
        let lastError;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                logToFile(`[SESSION_TRADE] ✍️ Broadcast attempt ${attempts} for bet ${id} (Nonce: ${txArgs.nonce})...`);
                tx = await wallet.connect(blockchain.provider).sendTransaction(txArgs);
                break; // Success!
            } catch (err) {
                lastError = err;
                const errLower = err.message?.toLowerCase() || "";
                logToFile(`[SESSION_TRADE] ⚠️ Attempt ${attempts} Failed: ${err.message}`);

                const isTransient = errLower.includes("txpool is full") ||
                    errLower.includes("timeout") ||
                    errLower.includes("nonce") ||
                    errLower.includes("underpriced") ||
                    errLower.includes("replacement") ||
                    errLower.includes("already");

                if (isTransient && attempts < maxAttempts) {
                    logToFile(`[SESSION_TRADE] 🔄 Retrying transient error...`);
                    // Rotate RPC and Resync
                    await blockchain.rotateRpc();
                    const freshNonce = await nonceManager.syncWithChain(sessionAddr, blockchain.provider);
                    const freshFees = await blockchain._getGasPrice();

                    txArgs.nonce = freshNonce;
                    // Aggressively bump gas on each retry (+20% cumulative)
                    const bumpFactor = 10n + BigInt(attempts * 2);
                    txArgs.maxFeePerGas = freshFees.maxFeePerGas * bumpFactor / 10n;
                    txArgs.maxPriorityFeePerGas = freshFees.maxPriorityFeePerGas * bumpFactor / 10n;

                    // Re-connect wallet to the potentially new provider from rotation
                    wallet = wallet.connect(blockchain.provider);
                    continue;
                } else {
                    // Non-transient or final attempt failed
                    await nonceManager.syncWithChain(sessionAddr, blockchain.provider).catch(() => { });
                    throw err;
                }
            }
        }
        logToFile(`[SESSION_TRADE] ✅ Broadcasted ${id} in ${Date.now() - broadcastStart}ms: ${tx.hash}`);

        // Immediate Redis Register
        const trunc2 = (v) => Math.floor(parseFloat(v) * 100) / 100;
        const ID_ASSET_MAP = { 0: 'ETH', 1: 'BTC', 2: 'SOL', 3: 'MON', 4: 'JUP', 5: 'XRP' };
        const symbol = ID_ASSET_MAP[Number(marketId)] || 'BTC';

        const tradeData = {
            id: id.toString(),
            user: address, // Main wallet for identification
            owner: address,
            sessionOwner: sessionAddr,
            amount: amount,
            direction: direction,
            duration: duration,
            entryPrice: (Number(entryPrice) / 1e8).toFixed(8),
            symbol: symbol,
            // Expiry/StartTime set pessimistically, will be updated strictly on confirmation
            expiry: Date.now() + (duration * 1000),
            txHash: tx.hash,
            startTime: Date.now(),
            confirmed: false,
            isSessionTrade: true
        };
        await redis.setTrade(id, tradeData);

        // Return txHash immediately after successful broadcast
        // The EVM guarantees funds are locked once tx is in mempool
        res.json({ success: true, txHash: tx.hash, confirmed: false });
        logToFile(`[SESSION_TRADE] ✅ Responded to frontend with txHash: ${tx.hash}`);

        // Background confirmation tracking (non-blocking)
        (async () => {
            try {
                // Use a fresh provider for confirmation polling to avoid timeout issues
                const confirmProvider = blockchain.provider;
                const receipt = await confirmProvider.waitForTransaction(tx.hash, 1, 120000); // 120s timeout
                if (receipt && receipt.status === 1) {
                    const confirmedNow = Date.now();
                    const updatedData = {
                        ...tradeData,
                        confirmed: true,
                        startTime: confirmedNow,
                        expiry: confirmedNow + (Number(duration) * 1000)
                    };
                    await redis.setTrade(id, updatedData);
                    logToFile(`[SESSION_TRADE] ⛓️ Confirmed ${id}: ${tx.hash}`);
                } else {
                    logToFile(`[SESSION_TRADE] ❌ Reverted on-chain ${id}: ${tx.hash}`);
                    await redis.delTrade(id);
                }
            } catch (err) {
                logToFile(`[SESSION_TRADE] ⚠️ Background confirmation polling failed for ${tx.hash}: ${err.message}`);
                // Don't delete trade — it may still be pending in mempool
            }
        })();

    } catch (e) {
        const errorMsg = e.reason || e.message || "Unknown error";
        logToFile(`[SESSION_TRADE] ❌ FATAL Error: ${errorMsg}`);
        console.error(`[SESSION_TRADE] Trace:`, e);

        if (errorMsg.toLowerCase().includes('nonce') || errorMsg.toLowerCase().includes('already been used') || errorMsg.toLowerCase().includes('too low')) {
            try {
                const { address: sessionAddr } = await deriveUserWallet(req.body.address);
                await nonceManager.syncWithChain(sessionAddr, blockchain.provider);
            } catch (err) { }
        }
        if (!res.headersSent) res.status(500).json({ error: errorMsg });
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

const express = require('express');
const rateLimit = require('express-rate-limit');
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
const { deriveUserWallet } = require('./services/walletDerivation');
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

// ===== ANTI-DDOS RATE LIMITING PROTOCOL =====
// Global Limiter: Max 2000 requests per minute per IP (allows normal polling but blocks floods)
const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 2000, 
    message: { error: 'Rate limit exceeded. Please wait a moment.' },
    standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});

// Stricter Action Limiter: Max 100 requests per minute for sensitive operations (trades, settlements)
const actionLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100,
    message: { error: 'Transaction rate limit exceeded. Please slow down.' },
    standardHeaders: true,
    legacyHeaders: false,
});

// Apply the global limiter to all incoming requests
app.use(globalLimiter);

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
    systemBanner: "",
    bannerLevel: "info",
    payoutMultipliers: { "5": 2.90, "10": 2.40, "15": 1.90 }
};

const LISTINGS_RESPONSE = [
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' }
];

// --- SESSION LOGIC (Deterministic Session Wallets) ---
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET;
if (!SESSION_MASTER_SECRET) {
    console.error("SESSION_MASTER_SECRET missing");
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
    await blockchain._ensureReady();
    return blockchain.provider;
}

app.get('/settings', async (req, res) => {
    const settings = await redis.getSettings();
    res.json(settings || SETTINGS_RESPONSE);
});
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
        console.error('History error:', e.message);
        return [];
    }
};

// Support for historical/missing frontend routes
// --- CAMPAIGN & WINNER BANNER ENDPOINTS ---
app.get('/campaigns', async (req, res) => {
    try {
        const campaigns = await redis.getCampaigns();
        // Enrich with enrollment counts
        const enriched = await Promise.all(campaigns.map(async (c) => {
            const count = await redis.getEnrollmentCount(c.id);
            return { ...c, enrollmentCount: count };
        }));
        res.json(enriched);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/campaigns', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await redis.saveCampaigns(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/winner-banner', async (req, res) => {
    try {
        const banner = await redis.getWinnerBanner();
        res.json(banner || {});
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/winner-banner', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        await redis.saveWinnerBanner(req.body);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/enroll', actionLimiter, express.json(), async (req, res) => {
    try {
        const { campaignId, address } = req.body;
        if (!campaignId || !address) return res.status(400).json({ error: 'Missing parameters' });
        await redis.enrollUser(campaignId, address);
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/enroll', async (req, res) => {
    try {
        const { campaignId, address } = req.query;
        if (!campaignId || !address) return res.status(400).json({ error: 'Missing parameters' });
        const enrolled = await redis.isUserEnrolled(campaignId, address);
        res.json({ enrolled });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/leaderboard', async (req, res) => {
    try {
        const { campaignId } = req.query;
        if (!campaignId) return res.status(400).json({ error: 'campaignId required' });

        const campaigns = await redis.getCampaigns();
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return res.json([]);

        // Filter history by campaign timeframe
        const history = await redis.getFullHistory();
        const campaignTrades = history.filter(t => 
            t.timestamp >= campaign.startTime && 
            t.timestamp <= campaign.endTime
        );

        // Calculate rankings
        const rankings = {};
        campaignTrades.forEach(t => {
            const user = t.user?.toLowerCase();
            if (!user) return;
            if (!rankings[user]) rankings[user] = { address: user, volume: 0, wins: 0, trades: 0, pnl: 0 };
            
            const amount = parseFloat(t.amount || 0);
            rankings[user].volume += amount;
            rankings[user].trades += 1;
            
            if (t.status === 'WON') {
                rankings[user].wins += 1;
                rankings[user].pnl += parseFloat(t.payout || 0) - amount;
            } else if (t.status === 'LOST') {
                rankings[user].pnl -= amount;
            }
        });

        const sorted = Object.values(rankings).map(r => ({
            ...r,
            winRate: r.trades > 0 ? (r.wins / r.trades) * 100 : 0
        })).sort((a, b) => b.pnl - a.pnl); // Sort by PnL or volume as per your campaign rules
        
        res.json(sorted.slice(0, 50));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/campaign-trades', async (req, res) => {
    try {
        const { campaignId } = req.query;
        if (!campaignId) return res.status(400).json({ error: 'campaignId required' });
        
        const campaigns = await redis.getCampaigns();
        const campaign = campaigns.find(c => c.id === campaignId);
        if (!campaign) return res.json([]);

        const history = await redis.getFullHistory();
        const campaignTrades = history.filter(t => 
            t.timestamp >= campaign.startTime && 
            t.timestamp <= campaign.endTime
        ).sort((a, b) => b.timestamp - a.timestamp);

        res.json(campaignTrades.slice(0, 100));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

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
        console.log(`Active market: ${activeId}`);
    }
    res.json({ success: true, activeId });
});

// (Duplicate route declarations removed — /settings and /listings already registered above)

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

        // Fetch stored profile from Redis
        const storedProfile = await redis.getProfile(address);

        // Fetch FULL history for accurate stats
        const allHistory = await getHistoryFor(address, 0);

        // Stats calculation on ALL trades
        const stats = {
            totalTrades: allHistory.length,
            totalWins: allHistory.filter(t => t.status === 'WON').length,
            totalVolume: allHistory.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0).toFixed(2)
        };

        res.json({
            profile: storedProfile || {
                username: `Trader_${address.slice(2, 6)}`,
                avatar: ``,
                address: address,
                isInitial: true // Flag for frontend to trigger onboarding
            },
            stats,
            history: allHistory.slice(0, 100),
            transactions: []
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Update profile
app.post('/profile', async (req, res) => {
    try {
        const { address, profile } = req.body;
        if (!address || !profile) return res.status(400).json({ error: 'Address and profile data required' });
        
        await redis.saveProfile(address, profile);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ===== SETTLEMENT TRIGGER (Frontend calls this when timer hits 0) =====
app.post('/settle', actionLimiter, async (req, res) => {
    try {
        const settings = await redis.getSettings();
        if (settings?.maintenanceMode) return res.status(503).json({ error: 'Maintenance Mode Active' });

        const { id } = req.body;
        if (!id) return res.status(400).json({ error: 'Missing bet ID' });

        logToFile(`Settle ${id} (Fetching fresh price...)`);

        const trade = await redis.getTrade(id);
        if (trade) {
            // SECURITY PATCH: Do NOT trust the frontend for exitPrice.
            // We fetch the fresh price from our internal pricing service.
            const freshPrice = pricing.getCurrentPrice(trade.symbol || 'BTC');
            if (!freshPrice) {
                logToFile(`Settle ${id} failed: No pricing data available.`);
                return res.status(500).json({ error: 'Pricing service unavailable' });
            }

            const entryPrice = parseFloat(trade.entryPrice);
            const exitPriceNum = parseFloat(freshPrice);

            const isUp = (trade.direction === 1 || trade.direction === "UP" || trade.direction === "buy");

            // Determined by backend price oracle
            const isWin = isUp ? (exitPriceNum > entryPrice) : (exitPriceNum < entryPrice);

            const duration = Number(trade.duration) || 15;
            const multiplier = duration <= 5 ? 2.90 : (duration <= 10 ? 2.40 : 1.90);
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
                logToFile(`Settle failed for ${id}: ${e.message}`);
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
app.post('/trade-ping', actionLimiter, async (req, res) => {
    try {
        const settings = await redis.getSettings();
        if (settings?.maintenanceMode || settings?.tradingHalted) {
            return res.status(503).json({ error: 'Trading is currently paused' });
        }
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
        logToFile(`Trade registered: ${id} for ${address} (${tradeData.entryPrice})`);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/protocol-stats', async (req, res) => {
    try {
        // 1. Classic Binary Options Stats
        const history = await redis.getFullHistory();
        const activeTrades = await redis.getAllActiveTrades(true);
        const totalVolume = history.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0);
        const uniqueWallets = new Set(history.map(t => t.user?.toLowerCase())).size;

        // 2. Rounds Stats (Unified)
        const assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        let roundsVolume = 0;
        let roundsParticipants = 0;
        let activeRoundsCount = 0;

        for (const asset of assets) {
            const state = await redis.getRound(`${asset}_state`);
            if (state) {
                activeRoundsCount++;
                // Add next round participants (currently betting)
                roundsParticipants += state.next?.pools?.participants || 0;
                // Add live round participants
                roundsParticipants += state.live?.pools?.participants || 0;
                
                // Estimate volume from pools
                if (state.next?.pools) {
                    roundsVolume += (state.next.pools.long || 0) + (state.next.pools.short || 0) - 2.0; // Subtract initial 1.0/1.0
                }
                if (state.live?.pools) {
                    roundsVolume += (state.live.pools.long || 0) + (state.live.pools.short || 0) - 2.0;
                }
            }
        }

        res.json({
            totalVolume: (totalVolume + roundsVolume).toFixed(2),
            classicVolume: totalVolume.toFixed(2),
            roundsVolume: roundsVolume.toFixed(2),
            wallets: uniqueWallets,
            activeCount: activeTrades.length + roundsParticipants,
            classicActive: activeTrades.length,
            roundsActive: roundsParticipants,
            totalTrades: history.length,
            activeStakes: activeTrades.reduce((sum, t) => sum + parseFloat(t.amount || 0), 0) + roundsVolume,
            autoSignerFees: { arc: ((totalVolume + roundsVolume) * 0.01).toFixed(2) }
        });
    } catch (e) {
        console.error('[Stats] Error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/treasury', async (req, res) => {
    const balance = await blockchain.getNativeBalance(process.env.ARC_CONTRACT_ADDRESS);
    res.json({ balance: balance.toString(), formatted: ethers.formatEther(balance) + ' USDC' });
});

app.post('/session/init', actionLimiter, async (req, res) => {
    try {
        const { address } = req.body;
        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        logToFile(`[SESSION_INIT] 🛠️ Initializing for ${address} -> Session: ${sessionAddr}`);
        const balance = await blockchain.getNativeBalance(sessionAddr);
        res.json({ sessionAddress: sessionAddr, balance: ethers.formatEther(balance) });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.post('/session/trade', actionLimiter, async (req, res) => {
    console.log(`Trade request: ${req.body.user} - ${req.body.direction} @ ${req.body.amount}`);
    try {
        const settings = await redis.getSettings();
        if (settings?.maintenanceMode) {
            console.log("Refused: Maintenance Mode");
            return res.status(503).json({ error: 'Maintenance Mode Active' });
        }
        if (settings?.tradingHalted) {
            console.log("Refused: Trading Halted");
            return res.status(503).json({ error: 'Trading Halted by Admin' });
        }

        const { address, tradeParams } = req.body;
        const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;

        logToFile(`Trade ${id}: ${address} (${amount} USDC)`);

        if (!id || !address || !amount) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const lockTrade = await redis.lockTrade(id);
        if (!lockTrade) {
            logToFile(`Trade ${id} locked (duplicate)`);
            return res.status(409).json({ error: 'Trade already in progress' });
        }

        // Fetch Wallet & Provider
        const derivationStart = Date.now();
        let { wallet, address: sessionAddr } = await deriveUserWallet(address);
        logToFile(`Wallet sync ${Date.now() - derivationStart}ms (${sessionAddr})`);

        redis.saveSessionMapping(sessionAddr, address).catch(() => { });

        // Pre-flight consistency check (Parallelized for Ultra-Low Latency)
        const preflightStart = Date.now();
        let balance, nonce, fees;

        try {
            // FIRE ALL NETWORK CALLS IN PARALLEL
            const [fetchedFees, fetchedNonce, fetchedBalance] = await Promise.all([
                blockchain._getGasPrice().catch(() => ({ maxFeePerGas: 400000000000n, maxPriorityFeePerGas: 200000000000n, gasPrice: 400000000000n })),
                nonceManager.getNonce(sessionAddr, blockchain.provider),
                Promise.race([
                    blockchain.getNativeBalance(sessionAddr),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 15000))
                ]).catch(async () => {
                   const cached = await redis.redis.get(`bal:${sessionAddr}`);
                   return cached ? BigInt(cached) : ethers.parseUnits("1000", 18);
                })
            ]);

            fees = fetchedFees;
            nonce = fetchedNonce;
            balance = fetchedBalance;

            // Update balance cache
            await redis.redis.set(`bal:${sessionAddr}`, balance.toString(), 'EX', 30);
        } catch (e) {
            logToFile(`Pre-flight error: ${e.message}`);
            throw e;
        }

        logToFile(`Pre-flight ready ${Date.now() - preflightStart}ms (Nonce: ${nonce})`);

        const amtNum = parseFloat(amount);
        const amtWei = ethers.parseUnits(amtNum.toFixed(18), 18);

        // Calculate gas buffer based on MAX fee to be conservative
        const maxGasCost = BigInt(800000) * fees.maxFeePerGas;
        const totalNeeded = amtWei + maxGasCost;

        logToFile(`Balance: ${ethers.formatEther(balance)}, Need: ${ethers.formatEther(totalNeeded)}`);

        if (balance < totalNeeded) {
            const err = `Insufficient Session Balance: ${ethers.formatEther(balance)} USDC. Need ${ethers.formatEther(totalNeeded)} USDC (Stake: ${amount} + Gas Buffer: ${ethers.formatEther(maxGasCost)})`;
            logToFile(`Insufficient balance: ${err}`);
            return res.status(400).json({ error: err });
        }

        logToFile(`Preparing TX (Nonce: ${nonce}, Gas: ${ethers.formatUnits(fees.gasPrice, 'gwei')} gwei)`);

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

        logToFile(`Broadcasting TX for ${id} (Nonce: ${nonce})`);
        const broadcastStart = Date.now();
        let tx;
        let lastError;
        let attempts = 0;
        const maxAttempts = 3;

        while (attempts < maxAttempts) {
            attempts++;
            try {
                logToFile(`Broadcast attempt ${attempts} for ${id} (Nonce: ${txArgs.nonce})`);
                await blockchain._ensureReady();
                tx = await wallet.connect(blockchain.provider).sendTransaction(txArgs);
                break; // Success!
            } catch (err) {
                lastError = err;
                const errLower = err.message?.toLowerCase() || "";
                logToFile(`Attempt ${attempts} failed: ${err.message}`);

                const isTransient = errLower.includes("txpool is full") ||
                    errLower.includes("timeout") ||
                    errLower.includes("nonce") ||
                    errLower.includes("underpriced") ||
                    errLower.includes("replacement") ||
                    errLower.includes("already");

                if (isTransient && attempts < maxAttempts) {
                    logToFile(`Retrying transient error...`);
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
        logToFile(`Trade ${id} broadcasted: ${tx.hash}`);

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
        logToFile(`Responded with txHash: ${tx.hash}`);

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
                    logToFile(`Confirmed ${id}: ${tx.hash}`);
                } else {
                    logToFile(`Reverted ${id}: ${tx.hash}`);
                    await redis.delTrade(id);
                }
            } catch (err) {
                logToFile(`Confirmation poll failed for ${tx.hash}: ${err.message}`);
                // Don't delete trade — it may still be pending in mempool
            }
        })();

    } catch (e) {
        const errorMsg = e.reason || e.message || "Unknown error";
        logToFile(`Trade error: ${errorMsg}`);
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



app.post('/session/withdraw', actionLimiter, async (req, res) => {
    try {
        const { address, amount } = req.body;
        if (!address) return res.status(400).json({ error: 'Missing main address' });

        logToFile(`Withdraw request: ${address} for ${amount} USDC`);
        const { wallet, address: sessionAddr } = await deriveUserWallet(address);
        // 1. Gas & Nonce (Parallel Ready)
        const [fees, nonce, balance] = await Promise.all([
            blockchain._getGasPrice(),
            nonceManager.getNonce(sessionAddr, blockchain.provider),
            blockchain.getNativeBalance(sessionAddr)
        ]);
        const amountWei = amount ? ethers.parseUnits(amount.toString(), 18) : balance;

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

        logToFile(`Sweeping ${ethers.formatEther(sweepAmt)} from ${sessionAddr} to ${address}`);

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
        logToFile(`Withdraw error: ${e.message}`);
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

const roundsRouter = require('./rounds/router');
const roundsProcessor = require('./rounds/processor'); 

app.use('/rounds', roundsRouter);

// Admin: Global Settings
app.get('/admin/settings', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const settings = await redis.getSettings();
    res.json(settings || {
        maintenanceMode: false,
        tradingHalted: false,
        minBet: 0.1,
        maxBet: 100,
        systemBanner: "",
        bannerLevel: "info",
        payoutMultipliers: { "5": 2.90, "10": 2.40, "15": 1.90 }
    });
});

app.post('/admin/settings', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    await redis.saveSettings(req.body);
    res.json({ success: true });
});

// Broadcast Management
app.get('/broadcast', async (req, res) => {
    const b = await redis.getBroadcast();
    res.json(b || {});
});

app.post('/admin/broadcast', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const b = req.body; // { text, type, expiry, sender }
    await redis.saveBroadcast(b);
    res.json({ success: true });
});

// Admin: Treasury Drain
app.post('/admin/treasury/withdraw', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const { amount, destination } = req.body;
    if (!amount || !destination) return res.status(400).json({ error: 'Amount and destination required' });

    try {
        const balance = await blockchain.getNativeBalance(blockchain.wallet.address);
        const amountWei = ethers.parseUnits(amount.toString(), 18);
        const fees = await blockchain._getGasPrice();
        const gasLimit = 21000n;
        const gasCost = fees.gasPrice * gasLimit;
        
        let sendWei = amountWei;
        if (amountWei > (balance - gasCost)) {
            sendWei = balance - gasCost;
        }

        if (sendWei <= 0n) return res.status(400).json({ error: 'Insufficient funds for gas' });

        logToFile(`Admin Treasury Drain to ${destination}: ${ethers.formatEther(sendWei)} USDC`);

        const tx = await blockchain.wallet.sendTransaction({
            to: destination,
            value: sendWei,
            chainId: 5042002
        });

        res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(sendWei) });
    } catch (e) {
        logToFile(`Admin Treasury Drain Error: ${e.message}`);
        res.status(500).json({ error: e.message });
    }
});

// Admin: Staff Management
app.get('/admin/staff', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const staff = await redis.getAllStaff();
    res.json(staff);
});

app.post('/admin/staff', express.json(), async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const staff = req.body;
    if (!staff.address) return res.status(400).json({ error: 'Address required' });
    await redis.saveStaff(staff);
    res.json({ success: true });
});

app.delete('/admin/staff/:address', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    await redis.deleteStaff(req.params.address);
    res.json({ success: true });
});

// User Profiles & Onboarding
app.get('/profiles/:address', async (req, res) => {
    const profile = await redis.getProfile(req.params.address.toLowerCase());
    res.json(profile || { error: 'Profile not found' });
});

app.post('/profiles', express.json(), async (req, res) => {
    // Accept both flat format { address, username, bio, avatar }
    // and the nested format from OnboardingFlow { address, profile: { username, avatar, xHandle } }
    const { address } = req.body;
    const flat = req.body;
    const nested = req.body.profile || {};

    const username = nested.username || flat.username;
    const bio = nested.bio || flat.bio || '';
    const avatar = nested.avatar || flat.avatar;
    const xHandle = nested.xHandle || flat.xHandle || '';
    const discordHandle = nested.discordHandle || flat.discordHandle || '';
    const onboardedAt = nested.onboardedAt || flat.onboardedAt || null;

    if (!address || !username) return res.status(400).json({ error: 'Address and username required' });
    
    const profile = {
        address: address.toLowerCase(),
        username,
        bio,
        xHandle,
        discordHandle,
        avatar: avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${username}`,
        onboardedAt,
        createdAt: Date.now()
    };
    
    await redis.saveProfile(address.toLowerCase(), profile);
    res.json({ success: true, profile });
});

// Admin: All Profiles (Directory)
app.get('/admin/profiles', async (req, res) => {
    if (req.headers['authorization'] !== `Bearer ${process.env.ADMIN_TOKEN}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    const profiles = await redis.getAllProfiles();
    res.json(profiles);
});

app.listen(PORT, '0.0.0.0', async () => {
    console.log(`Server running on port ${PORT}`);
    
    // Start Binary Options (Classic) Processor
    processor.init();
    
    roundsProcessor.start().catch(e => {
        console.error('Rounds processor fail:', e.message);
    });

    keepAlive.startKeepAlive();
});


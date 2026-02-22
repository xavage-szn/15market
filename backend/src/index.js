const express = require('express');
const cors = require('cors');
const { ethers } = require('ethers');
require('dotenv').config();

const processor = require('./keeper/processor');
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis');

const app = express();
const PORT = process.env.PORT || 3012;

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

// ===== RESPONSE CACHE: Reduce redundant Redis reads for same-second requests =====
const responseCache = new Map();
const CACHE_TTL = {
    settings: 30000,     // 30s — settings rarely change
    listings: 60000,     // 60s — listings almost never change
    activeMarket: 30000, // 30s
    history: 2000,       // 2s — history changes on settlements
    treasury: 10000,     // 10s
};

function getCached(key, ttl) {
    const entry = responseCache.get(key);
    if (entry && (Date.now() - entry.time < ttl)) {
        return entry.data;
    }
    return null;
}

function setCache(key, data) {
    responseCache.set(key, { data, time: Date.now() });
}

// Log requests (but not noisy polling endpoints)
const QUIET_ROUTES = new Set(['/health', '/settings', '/listings', '/active-market', '/price']);
app.use((req, res, next) => {
    if (!QUIET_ROUTES.has(req.path.split('/')[1] ? `/${req.path.split('/')[1]}` : req.path)) {
        console.log(`[Request] ${req.method} ${req.url}`);
    }
    if (req.url.startsWith('/arc/')) {
        req.url = req.url.replace('/arc/', '/');
    } else if (req.url === '/arc') {
        req.url = '/';
    }
    next();
});

// Monitoring Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
});

// ===== STATIC RESPONSES: Cached in-memory =====
const SETTINGS_RESPONSE = {
    minBet: 0.1,
    maxBet: 1000000.0,
    maintenanceMode: false,
    tradingHalted: false,
    payoutMultipliers: {
        "5": 6.98,
        "10": 4.98,
        "15": 1.98
    }
};

const LISTINGS_RESPONSE = [
    { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' },
    { id: 'sol', symbol: 'SOL', name: 'Solana', pythId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' }
];

app.get('/settings', (req, res) => {
    res.json(SETTINGS_RESPONSE);
});

app.get('/listings', (req, res) => {
    res.json(LISTINGS_RESPONSE);
});

app.get('/active-market', (req, res) => {
    res.json({ activeId: 'btc' });
});

app.get('/trades/:address', async (req, res) => {
    try {
        const addr = req.params.address.toLowerCase();
        const profile = await redis.getProfile(addr);

        const addresses = [addr];
        if (profile && profile.sessionWalletAddress) {
            const sessionAddr = profile.sessionWalletAddress.toLowerCase();
            if (sessionAddr !== addr && !addresses.includes(sessionAddr)) {
                addresses.push(sessionAddr);
            }
        }
        const mainAddr = await redis.getMainAddressForSession(addr);
        if (mainAddr && !addresses.includes(mainAddr)) {
            addresses.push(mainAddr);
            const mainProfile = await redis.getProfile(mainAddr);
            if (mainProfile && mainProfile.sessionWalletAddress) {
                const sAddr = mainProfile.sessionWalletAddress.toLowerCase();
                if (!addresses.includes(sAddr)) addresses.push(sAddr);
            }
        }

        // ===== Use Redis pipeline for batch fetch =====
        const pipeline = redis.client.pipeline();
        for (const a of addresses) {
            pipeline.get(`history:${a}`);
        }
        const results = await pipeline.exec();

        let allHistory = [];
        results.forEach(([err, d]) => {
            if (d && !err) {
                try {
                    const parsed = JSON.parse(d);
                    if (Array.isArray(parsed)) allHistory = allHistory.concat(parsed);
                } catch (e) { }
            }
        });

        const uniqueMap = new Map();
        allHistory.forEach(item => {
            const id = item.id || item.tx || item.nonce;
            if (!id) return;
            const existing = uniqueMap.get(id);
            if (!existing || (existing.status === 'PENDING' && item.status !== 'PENDING') || (!existing.status && item.status)) {
                uniqueMap.set(id, item);
            }
        });

        const unique = Array.from(uniqueMap.values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 100)
            .map(normalizeTrade);

        res.json(unique);
    } catch (e) {
        console.error('[Server] Error fetching trades:', e);
        res.json([]);
    }
});

app.get('/active-bets/:address', async (req, res) => {
    const trades = await processor.getActiveTradesForUser(req.params.address);
    res.json(trades.map(normalizeTrade));
});

app.get('/campaigns', (req, res) => {
    res.json([]);
});

app.get('/history', async (req, res) => {
    try {
        const cached = getCached('history', CACHE_TTL.history);
        if (cached) return res.json(cached);

        const history = await processor.getGlobalHistory();
        setCache('history', history);
        res.json(history);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/profile', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: 'Missing address' });

    const userData = await redis.getUserData(address);
    if (userData) {
        if (userData.history) userData.history = userData.history.map(normalizeTrade);
        if (userData.transactions) userData.transactions = userData.transactions.map(normalizeTrade);

        if (userData.history && userData.history.length > 0) {
            const uniqueTrades = new Map();
            for (const t of userData.history) {
                const tradeId = t.id || t.tx;
                if (tradeId && (t.status === 'WON' || t.status === 'LOST')) {
                    if (!uniqueTrades.has(tradeId) || (t.settledAt || t.timestamp || 0) > (uniqueTrades.get(tradeId).settledAt || uniqueTrades.get(tradeId).timestamp || 0)) {
                        uniqueTrades.set(tradeId, t);
                    }
                }
            }

            const settledTrades = Array.from(uniqueTrades.values());
            const wins = settledTrades.filter(t => t.status === 'WON').length;
            const losses = settledTrades.filter(t => t.status === 'LOST').length;
            const totalTrades = settledTrades.length;

            let totalVolume = 0;
            for (const t of settledTrades) {
                let amt = parseFloat(t.amount || 0);
                if (amt > 1000000) {
                    try { amt = parseFloat(ethers.formatEther(t.amount.toString())); } catch (e) { }
                }
                totalVolume += amt;
            }

            if (userData.profile) {
                userData.profile.totalTrades = totalTrades;
                userData.profile.totalWins = wins;
                userData.profile.totalLosses = losses;
                userData.profile.totalVolume = totalVolume.toFixed(3);
            }
        }
    }
    res.json(userData);
});

app.post('/sync-profile', async (req, res) => {
    const { address, profile } = req.body;
    if (!address || !profile) return res.status(400).json({ error: 'Missing address or profile' });

    const success = await redis.saveProfile(address, profile);
    res.json({ success });
});

app.post('/push-tx', async (req, res) => {
    const { address, transaction } = req.body;
    if (!address || !transaction) return res.status(400).json({ error: 'Missing address or transaction' });

    await redis.pushUserTransaction(address, transaction);
    res.json({ success: true });
});

// ===== CRITICAL: High-speed trade registration =====
app.post('/trade-ping', async (req, res) => {
    try {
        const { id, address, amount, direction, duration, entryPrice, expiry, expiryMs, symbol, network } = req.body;

        if (!id || !address) {
            return res.status(400).json({ error: 'Missing id or address' });
        }

        const SYMBOL_TO_MARKET_ID = { 'ETH': 0, 'BTC': 1, 'SOL': 2, 'MON': 3, 'JUP': 4, 'XRP': 5 };
        const marketId = SYMBOL_TO_MARKET_ID[symbol?.toUpperCase()] ?? 0;

        let normalizedEntry = Number(entryPrice);
        if (normalizedEntry > 100000000) {
            normalizedEntry = normalizedEntry / 1e8;
        }

        const tradeData = {
            id: id.toString(),
            user: address,
            amount: Number(amount).toFixed(4),
            direction: direction,
            duration: Number(duration),
            entryPrice: normalizedEntry.toFixed(3),
            marketId: marketId,
            symbol: symbol || 'BTC',
            network: network || 'arc',
            isSessionTrade: req.body.isSessionTrade || false,
            expiry: (expiryMs ? Number(expiryMs) : (expiry ? Number(expiry) * 1000 : Date.now() + (Number(duration) * 1000))),
            registeredAt: Date.now()
        };

        // Register trade — this is non-blocking internally
        processor.registerTrade(tradeData);

        // Respond IMMEDIATELY — don't wait for Redis persistence
        console.log(`[TradePing] Registered trade ${id} for ${address} (${symbol}, ${duration}s)`);
        res.json({ success: true, trade: tradeData });

    } catch (e) {
        console.error('[TradePing] Error:', e);
        res.status(500).json({ error: e.message });
    }
});

// Debug & Admin Endpoints
app.get('/debug/cache', async (req, res) => {
    const activeTrades = await redis.getAllActiveTrades();
    res.json({
        activeCount: activeTrades.length,
        memoryCacheSize: redis.memoryCache.size,
        historyCacheSize: redis.historyCache?.length || 0,
        activeSettlements: processor.activeSettlementCount,
        settlingIds: Array.from(processor.settlingIds),
        keys: Array.from(redis.memoryCache.keys()),
        trades: activeTrades
    });
});

app.post('/admin/sync-cache', async (req, res) => {
    await redis.syncFromRedis();
    res.json({ success: true, message: 'RAM cache re-synced from Redis' });
});

app.get('/price/:symbol', async (req, res) => {
    const price = await pricing.getPrice(req.params.symbol.toUpperCase());
    res.json({ symbol: req.params.symbol, price });
});

app.get('/treasury', async (req, res) => {
    try {
        const cached = getCached('treasury', CACHE_TTL.treasury);
        if (cached) return res.json(cached);

        const balance = await blockchain.getNativeBalance(process.env.ARC_CONTRACT_ADDRESS);
        const data = {
            address: process.env.ARC_CONTRACT_ADDRESS,
            balance: balance.toString(),
            formatted: ethers.formatEther(balance) + ' USDC'
        };
        setCache('treasury', data);
        res.json(data);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SERVER-SIDE AUTO-SIGNER (Custodial/Stateless) ---
const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";

const SESSION_RPCS = [
    "https://5042002.rpc.thirdweb.com",
    "https://rpc.testnet.arc.network",
    "https://rpc-test-1.arc.market",
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
];

let sessionProvider = null;
let sessionProviderHealthy = true;
let sessionProviderLastCheck = 0;

async function getSessionProvider() {
    const now = Date.now();
    if (sessionProvider && sessionProviderHealthy && (now - sessionProviderLastCheck < 60000)) {
        return sessionProvider;
    }

    const { FetchRequest } = ethers;
    const network = ethers.Network.from(5042002);

    for (const rpc of SESSION_RPCS) {
        try {
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 8000; // Reduced from 12s
            const provider = new ethers.JsonRpcProvider(fetchReq, network, { staticNetwork: true });

            await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 6000)) // Reduced from 8s
            ]);

            sessionProvider = provider;
            sessionProviderHealthy = true;
            sessionProviderLastCheck = Date.now();
            return provider;
        } catch (e) {
            console.warn(`[AutoSigner] ⚠️ RPC failed: ${rpc} — ${e.message}`);
        }
    }

    if (sessionProvider) {
        sessionProviderHealthy = false;
        return sessionProvider;
    }

    const fetchReq = new FetchRequest(SESSION_RPCS[0]);
    fetchReq.timeout = 15000;
    sessionProvider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
    return sessionProvider;
}

// ===== WALLET CACHE: Avoid re-deriving for every request =====
const walletCache = new Map();

async function deriveUserWallet(userAddress) {
    const addr = userAddress.toLowerCase();
    const cached = walletCache.get(addr);

    if (cached && cached.provider === sessionProvider) {
        return cached.wallet;
    }

    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const provider = await getSessionProvider();
    const wallet = new ethers.Wallet(privateKey, provider);

    walletCache.set(addr, { wallet, provider });
    return wallet;
}

app.post('/session/init', async (req, res) => {
    try {
        const { address, signature } = req.body;
        if (!address) return res.status(400).json({ error: "Missing address" });

        const wallet = await deriveUserWallet(address);
        const balance = await wallet.provider.getBalance(wallet.address);

        res.json({
            sessionAddress: wallet.address,
            balance: ethers.formatEther(balance)
        });
    } catch (e) {
        console.error("Session Init Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/session/trade', async (req, res) => {
    try {
        const { address, tradeParams } = req.body;

        const wallet = await deriveUserWallet(address);
        const contract = new ethers.Contract(process.env.ARC_CONTRACT_ADDRESS, blockchain.abi, wallet);

        console.log(`[AutoSigner] Executing trade for ${address} via ${wallet.address}`);

        const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;
        const amountWei = ethers.parseUnits(amount.toString(), 18);

        const tx = await contract.placeBet(
            BigInt(id),
            Number(direction),
            BigInt(duration),
            BigInt(entryPrice),
            Number(marketId),
            wallet.address,
            { value: amountWei, gasLimit: 500000n }
        );

        console.log(`[AutoSigner] TX Sent: ${tx.hash}`);

        // Respond immediately with TX hash
        res.json({ txHash: tx.hash, sessionAddress: wallet.address });

        // Wait for confirmation in background
        tx.wait().then(r => console.log(`[AutoSigner] Confirmed: ${r.hash}`));

    } catch (e) {
        console.error("AutoSigner Trade Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/session/withdraw', async (req, res) => {
    try {
        const { address, amount, signature } = req.body;
        if (!address || !amount) return res.status(400).json({ error: "Missing params" });

        const cleanAmount = parseFloat(amount).toFixed(6);
        const wallet = await deriveUserWallet(address);

        const sessionBal = await wallet.provider.getBalance(wallet.address);
        const amountWei = ethers.parseUnits(cleanAmount, 18);
        const feeData = await wallet.provider.getFeeData();
        const gasPrice = feeData.gasPrice || ethers.parseUnits("1.5", "gwei");
        const gasLimit = 100000n;
        const totalGasCost = gasPrice * gasLimit;

        if (sessionBal < amountWei + totalGasCost) {
            const maxWithdrawWei = sessionBal - totalGasCost;
            if (maxWithdrawWei <= 0n) {
                return res.status(400).json({ error: "Insufficient balance to cover gas fees." });
            }
        }

        let tx;
        try {
            const txPromise = wallet.sendTransaction({
                to: address,
                value: amountWei,
                gasLimit: gasLimit,
                gasPrice: gasPrice
            });
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("RPC timeout")), 30000)
            );
            tx = await Promise.race([txPromise, timeoutPromise]);
        } catch (rpcErr) {
            sessionProviderHealthy = false;
            const retryWallet = await deriveUserWallet(address);
            const retryFeeData = await retryWallet.provider.getFeeData();
            const txPromise = retryWallet.sendTransaction({
                to: address,
                value: amountWei,
                gasLimit: gasLimit,
                gasPrice: retryFeeData.gasPrice || gasPrice
            });
            const retryTimeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("RPC timeout after retry")), 30000)
            );
            tx = await Promise.race([txPromise, retryTimeout]);
        }

        console.log(`[AutoSigner] Sweep TX Sent: ${tx.hash}`);
        res.json({ success: true, txHash: tx.hash });

        tx.wait().then(r => console.log(`[AutoSigner] Sweep Confirmed: ${r.hash}`))
            .catch(e => console.error(`[AutoSigner] Sweep confirmation error:`, e.message));

    } catch (e) {
        console.error("AutoSigner Sweep Error:", e.message);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log(`[Server] Running on port ${PORT}`);

    try {
        await processor.init();
        console.log('[Server] Trade Processor started successfully');
    } catch (e) {
        console.error('[Server] Failed to start Trade Processor:', e);
    }
});

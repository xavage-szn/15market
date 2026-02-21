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
    // Normalize Amount: if > 1M, assume it's in Wei (18 decimals)
    if (t.amount && Number(t.amount) > 1000000) {
        try {
            t.amount = ethers.formatEther(t.amount.toString());
        } catch (e) { }
    }
    // Normalize Entry/Exit Prices: if > 100M, assume it's scaled by 1e8
    if (t.entryPrice && Number(t.entryPrice) > 100000000) {
        t.entryPrice = (Number(t.entryPrice) / 1e8).toFixed(4);
    }
    if (t.settlementPrice && Number(t.settlementPrice) > 100000000) {
        t.settlementPrice = (Number(t.settlementPrice) / 1e8).toFixed(4);
    }
    return t;
};

// Log every request and handle optional /arc prefix
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    if (req.url.startsWith('/arc/')) {
        req.url = req.url.replace('/arc/', '/');
        console.log(`[Request] Rewritten to ${req.url}`);
    } else if (req.url === '/arc') {
        req.url = '/';
    }
    next();
});

// Monitoring Endpoints
app.get('/health', (req, res) => {
    res.json({ status: 'healthy', timestamp: Date.now() });
});

// UI Expects these routes
app.get('/settings', (req, res) => {
    res.json({
        minBet: 0.1,
        maxBet: 1000000.0,
        maintenanceMode: false,
        tradingHalted: false,
        payoutMultipliers: {
            "5": 6.98,
            "10": 4.98,
            "15": 1.98
        }
    });
});

app.get('/listings', (req, res) => {
    res.json([
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: 'ff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: 'e62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' },
        { id: 'sol', symbol: 'SOL', name: 'Solana', pythId: 'ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' }
    ]);
});

app.get('/active-market', (req, res) => {
    res.json({ activeId: 'btc' });
});

app.get('/trades/:address', async (req, res) => {
    try {
        const addr = req.params.address.toLowerCase();
        const profile = await redis.getProfile(addr);

        // Collect all linked addresses (main + session)
        const addresses = [addr];
        if (profile && profile.sessionWalletAddress) {
            const sessionAddr = profile.sessionWalletAddress.toLowerCase();
            if (sessionAddr !== addr && !addresses.includes(sessionAddr)) {
                addresses.push(sessionAddr);
            }
        }
        // Also check if this IS a session address pointing to a main
        const mainAddr = await redis.getMainAddressForSession(addr);
        if (mainAddr && !addresses.includes(mainAddr)) {
            addresses.push(mainAddr);
            // Also get the main profile's session address for completeness
            const mainProfile = await redis.getProfile(mainAddr);
            if (mainProfile && mainProfile.sessionWalletAddress) {
                const sAddr = mainProfile.sessionWalletAddress.toLowerCase();
                if (!addresses.includes(sAddr)) addresses.push(sAddr);
            }
        }

        // Fetch history from all linked addresses
        const historyPromises = addresses.map(a => redis.client.get(`history:${a}`));
        const historyData = await Promise.all(historyPromises);

        let allHistory = [];
        historyData.forEach(d => {
            if (d) {
                try {
                    const parsed = JSON.parse(d);
                    if (Array.isArray(parsed)) allHistory = allHistory.concat(parsed);
                } catch (e) { }
            }
        });

        // De-duplicate by trade id with priority for settled status
        const uniqueMap = new Map();
        allHistory.forEach(item => {
            const id = item.id || item.tx || item.nonce || item.id;
            if (!id) return;
            const existing = uniqueMap.get(id);
            // Prioritize settled status or newer timestamp
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
    // Filter active trades from Redis for this user
    const trades = await processor.getActiveTradesForUser(req.params.address);
    res.json(trades.map(normalizeTrade));
});

app.get('/campaigns', (req, res) => {
    res.json([]);
});

app.get('/history', async (req, res) => {
    try {
        const history = await processor.getGlobalHistory();
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
        // Normalize History & Transactions
        if (userData.history) userData.history = userData.history.map(normalizeTrade);
        if (userData.transactions) userData.transactions = userData.transactions.map(normalizeTrade);

        // Normalize Profile Metrics (Volume)
        if (userData.profile && userData.profile.totalVolume) {
            const vol = Number(userData.profile.totalVolume);
            // If volume is cosmically large (> 1 Quadrillion), it's definitely Wei contamination
            if (vol > 1000000000000000) {
                try {
                    userData.profile.totalVolume = ethers.formatEther(userData.profile.totalVolume.toString());
                } catch (e) { }
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

// CRITICAL: Frontend pings this after every trade to register it for settlement
app.post('/trade-ping', async (req, res) => {
    console.log(`[TradePing] Received request: ${JSON.stringify(req.body)}`);
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
            amount: Number(amount).toFixed(4), // Force normal float string
            direction: direction,
            duration: Number(duration),
            entryPrice: normalizedEntry.toFixed(4),
            marketId: marketId,
            symbol: symbol || 'BTC',
            network: network || 'arc',
            expiry: (expiryMs ? Number(expiryMs) : (expiry ? Number(expiry) * 1000 : Date.now() + (Number(duration) * 1000))),
            registeredAt: Date.now()
        };

        await processor.registerTrade(tradeData);
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
        keys: Array.from(redis.memoryCache.keys()),
        trades: activeTrades
    });
});

app.post('/admin/sync-cache', async (req, res) => {
    // In production, you'd check process.env.ADMIN_TOKEN here
    await redis.syncFromRedis();
    res.json({ success: true, message: 'RAM cache re-synced from Redis' });
});

app.get('/price/:symbol', async (req, res) => {
    const price = await pricing.getPrice(req.params.symbol.toUpperCase());
    res.json({ symbol: req.params.symbol, price });
});

app.get('/treasury', async (req, res) => {
    try {
        const balance = await blockchain.getNativeBalance(process.env.ARC_CONTRACT_ADDRESS);
        res.json({
            address: process.env.ARC_CONTRACT_ADDRESS,
            balance: balance.toString(),
            formatted: ethers.formatEther(balance) + ' USDC'
        });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// --- SERVER-SIDE AUTO-SIGNER (Custodial/Stateless) ---
// Securely derives a session wallet for the user so keys never leave the server.
// Using a deterministic derivation ensures the same user always gets the same session wallet
// across all devices without needing to sync private keys.

const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";

function deriveUserWallet(userAddress) {
    // Deterministic Private Key = Keccak256(MasterSecret + UserAddress)
    // This ensures consistency across devices.
    const entropy = ethers.toUtf8Bytes(SESSION_MASTER_SECRET + userAddress.toLowerCase());
    const privateKey = ethers.keccak256(entropy);
    const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
    return new ethers.Wallet(privateKey, provider); // Returns a standard Ethers wallet
}

app.post('/session/init', async (req, res) => {
    try {
        const { address, signature } = req.body;
        if (!address) return res.status(400).json({ error: "Missing address" });

        // Verify identity (optional but recommended)
        // const recovered = ethers.verifyMessage(`Authorize 15market Auto-Signer for ${address.toLowerCase()}`, signature);
        // if (recovered.toLowerCase() !== address.toLowerCase()) return res.status(403).json({ error: "Invalid signature" });

        const wallet = deriveUserWallet(address);
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
        // In a real prod env, verify 'signature' here again to ensure auth for this trade

        const wallet = deriveUserWallet(address);
        const contract = new ethers.Contract(process.env.ARC_CONTRACT_ADDRESS, blockchain.abi, wallet);

        console.log(`[AutoSigner] Executing trade for ${address} via ${wallet.address}`);

        // Parse params
        const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;
        const amountWei = ethers.parseUnits(amount.toString(), 18);

        const tx = await contract.placeBet(
            BigInt(id),
            Number(direction),
            BigInt(duration),
            BigInt(entryPrice),
            Number(marketId),
            wallet.address, // Payout goes back to session wallet so balance actually increases for continued trading
            { value: amountWei, gasLimit: 500000n }
        );

        console.log(`[AutoSigner] TX Sent: ${tx.hash} (Payout directed to ${wallet.address})`);
        res.json({ txHash: tx.hash, sessionAddress: wallet.address });

        // Wait for confirmation in background
        tx.wait().then(r => console.log(`[AutoSigner] Confirmed: ${r.hash}`));

    } catch (e) {
        console.error("AutoSigner Trade Error:", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, async () => {
    console.log(`[Server] Running on port ${PORT}`);

    // Initialize Trade Processor
    try {
        await processor.init();
        console.log('[Server] Trade Processor started successfully');
    } catch (e) {
        console.error('[Server] Failed to start Trade Processor:', e);
    }
});

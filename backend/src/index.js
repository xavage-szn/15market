const express = require('express');
const cors = require('cors');
require('dotenv').config();

const processor = require('./keeper/processor');
const blockchain = require('./services/blockchain');
const pricing = require('./services/pricing');
const redis = require('./services/redis');

const app = express();
const PORT = process.env.PORT || 3012;

app.use(cors());
app.use(express.json());

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

        // De-duplicate by trade id and sort by timestamp desc
        const unique = Array.from(new Map(allHistory.map(item => [item.id || item.tx, item])).values())
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
            .slice(0, 100);

        res.json(unique);
    } catch (e) {
        console.error('[Server] Error fetching trades:', e);
        res.json([]);
    }
});

app.get('/active-bets/:address', async (req, res) => {
    // Filter active trades from Redis for this user
    const trades = await processor.getActiveTradesForUser(req.params.address);
    res.json(trades);
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
        const { id, address, amount, direction, duration, entryPrice, expiry, symbol, network } = req.body;

        if (!id || !address) {
            return res.status(400).json({ error: 'Missing id or address' });
        }

        const SYMBOL_TO_MARKET_ID = { 'BTC': 0, 'ETH': 1, 'MON': 2, 'JUP': 3, 'XRP': 4, 'SOL': 5 };
        const marketId = SYMBOL_TO_MARKET_ID[symbol?.toUpperCase()] ?? 0;

        const tradeData = {
            id: id.toString(),
            user: address,
            amount: amount,
            direction: direction,
            duration: Number(duration),
            marketId: marketId,
            symbol: symbol || 'BTC',
            network: network || 'arc',
            expiry: expiry ? expiry * 1000 : Date.now() + (Number(duration) * 1000), // expiry from frontend is unix seconds
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

const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const { program, connection, readConnection, PublicKey, START_TIME, SOLANA_FALLBACKS } = require("./config");
const { settleBet } = require("./settler");
const bs58 = require("bs58");
const { Connection } = require("@solana/web3.js");
const pricing = require('shared-utils/pricing');
const Logger = require('shared-utils/logger');
const redis = require('shared-utils/redis');


// --- SETUP LOGGER ---
const logger = new Logger('SOLANA_KEEPER');
console.log = (...args) => logger.info(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
console.error = (...args) => logger.error(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
console.warn = (...args) => logger.warn(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));

// --- STATE MANAGEMENT ---
const STORAGE_FILE = path.resolve(__dirname, '../storage.json');
let state = {
    listings: [
        { id: 'sol', symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', pair: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' },
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f8dc41b5e', binance: 'BTCUSDT' },
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: '0xffb26477e64e100806440db74f762a40788d7734bcc991d798150495f5431682', binance: 'ETHUSDT' }
    ],
    activeMarket: { activeId: 'sol' },
    campaigns: [],
    winnerBanner: null,
    enrollments: {},
    stats: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 },
    autoSignerFees: 0,
    userProfiles: {},
    totalTrades: 0,
    history: []
};
const trackedBets = new Map();
const oauthStates = new Map();

// --- ARC DATA AGGREGATION ---
let arcStats = { stake: 0, count: 0, totalVolume: 0, balance: 0, address: 'Scanning...' };
let arcHistory = [];
const KEEPER_URL_ARC = process.env.KEEPER_URL_ARC || "http://localhost:3010";

async function syncArcData() {
    try {
        // Fetch Arc Stats
        const statsRes = await fetch(`${KEEPER_URL_ARC}/escrow-stats`);
        if (statsRes.ok) {
            const data = await statsRes.json();
            if (data.arc) arcStats = data.arc;
        }

        // Fetch Arc History
        const historyRes = await fetch(`${KEEPER_URL_ARC}/history`);
        if (historyRes.ok) {
            arcHistory = await historyRes.json();
        }
    } catch (e) {
        console.warn(`[SYNC] Failed to fetch Arc data: ${e.message}`);
    }
}

// --- REDIS SYNC LOGIC ---
async function syncFromRedis() {
    try {
        const platformSettings = await redis.get('platform_settings');
        if (platformSettings) {
            state.settings = platformSettings;
        }

        const listings = await redis.get('platform_listings');
        if (listings) {
            state.listings = listings;
        }

        const activeMarket = await redis.get('active_market');
        if (activeMarket) {
            state.activeMarket = activeMarket;
        }

        const campaigns = await redis.get('active_campaigns');
        if (campaigns) {
            state.campaigns = campaigns;
        }
    } catch (e) {
        console.warn(`[REDIS_SYNC] Failed: ${e.message}`);
    }
}

// Global Sync Loop (Backend linking)
syncRedis();
setInterval(syncRedis, 10000); // Sync every 10s for perfect linkage

// Initial sync and then every 15s
syncArcData();
setInterval(syncArcData, 15000);

async function syncRedis() {
    await syncFromRedis();
}

// Load State
try {
    if (fs.existsSync(STORAGE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        state = { ...state, ...saved };
    }
} catch (e) {
    console.error("Failed to load storage:", e.message);
}

// --- REDIS INITIALIZATION ---
redis.connect()
    .then(() => {
        console.log('✅ REDIS CONNECTED SUCCESSFULLY');
        console.log('📍 Redis URL:', process.env.REDIS_URL || 'default (localhost:6379)');
        syncRedis(); // Initial sync
        setInterval(syncRedis, 10000); // Sync every 10s
    })
    .catch(err => {
        console.error('❌ REDIS CONNECTION FAILED:', err.message);
        console.error('📍 Attempted URL:', process.env.REDIS_URL || 'default (localhost:6379)');
        console.error('⚠️ WARNING: Running in LOCAL MODE - data will NOT sync across instances!');
    });

function saveState() {
    try {
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error("Save failed:", e.message);
    }
}


// --- EXPRESS SERVER ---
const app = express();
app.set('trust proxy', 1); // Trust Dokploy/Nginx proxy
app.use(cors({
    origin: true, // Allow all origins in production
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json()); // Body parser

const PORT = process.env.PORT || 3005;

// Middleware for logging
app.use((req, res, next) => {
    if (req.path !== '/logs') console.log(`[REQ] ${req.method} ${req.path}`);
    next();
});

// Routes
app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
app.get('/logs', (req, res) => res.json(logger.getLogs()));

app.post('/listings', async (req, res) => {
    if (Array.isArray(req.body)) {
        state.listings = req.body;
        saveState();
        await redis.set('platform_listings', state.listings);
        res.json({ success: true });
    } else res.status(400).end();
});

app.get('/active-market', (req, res) => res.json(state.activeMarket));
app.post('/active-market', async (req, res) => {
    state.activeMarket = req.body;
    saveState();
    await redis.set('active_market', state.activeMarket);
    res.json({ success: true });
});

app.get('/campaigns', (req, res) => res.json(state.campaigns));
app.post('/campaigns', async (req, res) => {
    state.campaigns = req.body;
    saveState();
    await redis.set('active_campaigns', state.campaigns);
    res.json({ success: true });
});

app.get('/winner-banner', (req, res) => res.json(state.winnerBanner));
app.post('/winner-banner', (req, res) => {
    state.winnerBanner = req.body;
    saveState();
    res.json({ success: true });
});

app.get('/enroll', (req, res) => {
    const { campaignId, address } = req.query;
    const enrolled = state.enrollments[campaignId]?.[address] || false;
    res.json({ enrolled });
});
app.post('/enroll', (req, res) => {
    const { campaignId, address } = req.body;
    if (!state.enrollments[campaignId]) state.enrollments[campaignId] = {};
    state.enrollments[campaignId][address] = true;
    saveState();
    res.json({ success: true });
});

app.get('/history', (req, res) => {
    const combined = [...state.history, ...arcHistory];
    combined.sort((a, b) => b.timestamp - a.timestamp);
    res.json(combined.slice(0, 200));
});
app.get('/active-bets', async (req, res) => {
    try {
        const arcRes = await fetch(`${KEEPER_URL_ARC}/active-bets`);
        let arcBets = [];
        if (arcRes.ok) arcBets = await arcRes.json();

        const solBets = Array.from(trackedBets.values());
        res.json([...solBets, ...arcBets]);
    } catch (e) {
        res.json(Array.from(trackedBets.values()));
    }
});

app.get('/protocol-stats', async (req, res) => {
    try {
        const totalVolume = await redis.get('global_total_volume') || 0;
        const totalTrades = await redis.get('global_total_trades') || 0;
        const wallets = await redis.get('global_total_wallets') || 0;
        const autoSignerFees = await redis.get('global_autosigner_fees') || 0;
        const platformSettings = await redis.get('platform_settings') || state.settings;

        res.json({
            activeCount: trackedBets.size + (arcStats.count || 0),
            totalTrades: Number(totalTrades),
            totalVolume: Number(totalVolume),
            wallets: Number(wallets),
            autoSignerFees: Number(autoSignerFees),
            settings: platformSettings
        });
    } catch (e) {
        res.json({
            activeCount: trackedBets.size + (arcStats.count || 0),
            totalTrades: (state.totalTrades || 0) + (arcHistory.length || 0),
            totalVolume: (state.stats.totalVolume || 0) + (arcStats.totalVolume || 0),
            wallets: Object.keys(state.userProfiles || {}).length,
            autoSignerFees: state.autoSignerFees || 0
        });
    }
});

app.get('/escrow-stats', (req, res) => res.json({
    solana: state.stats,
    arc: arcStats
}));

app.get('/settings', (req, res) => res.json(state.settings || {
    minBet: 0.1,
    maxBet: 5.0,
    maintenanceMode: false
}));

app.post('/settings', async (req, res) => {
    state.settings = { ...(state.settings || {}), ...req.body };
    saveState();

    // Sync to Redis
    await redis.set('platform_settings', state.settings);

    res.json({ success: true });
});


app.post('/record-fee', async (req, res) => {
    const { amount } = req.body;
    if (typeof amount === 'number') {
        state.autoSignerFees = (state.autoSignerFees || 0) + amount;
        saveState();

        // Sync to Redis
        try {
            const current = await redis.get('global_autosigner_fees') || 0;
            await redis.set('global_autosigner_fees', Number(current) + amount);
        } catch (e) { }

        console.log(`💰 [FEE] +${amount} SOL`);
        res.json({ success: true, autoSignerFees: state.autoSignerFees });
    } else {
        res.status(400).json({ error: "Invalid data" });
    }
});

app.get('/profile', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Missing address" });
    const lookupAddress = address.startsWith('0x') ? address.toLowerCase() : address;

    // 1. Check Redis Cache
    const cached = await redis.hget('user_profiles', lookupAddress);
    if (cached) return res.json(cached);

    // 2. Fallback to local state (for migration)
    const local = state.userProfiles[lookupAddress] || null;
    if (local) {
        await redis.hset('user_profiles', lookupAddress, local);
    }
    res.json(local);
});

app.post('/sync-profile', async (req, res) => {
    const { address, username, xHandle, xProfileImage, tosAccepted } = req.body;
    if (address && username) {
        const lookupAddress = address.startsWith('0x') ? address.toLowerCase() : address;

        // Check if new user
        const existing = await redis.hget('user_profiles', lookupAddress);
        if (!existing) {
            try {
                const currentWallets = await redis.get('global_total_wallets') || 0;
                await redis.set('global_total_wallets', Number(currentWallets) + 1);
            } catch (e) { }
        }

        const profile = {
            username,
            xHandle: xHandle || "",
            xProfileImage: xProfileImage || "",
            tosAccepted: !!tosAccepted,
            network: 'solana',
            timestamp: Date.now()
        };

        // 1. Save to Redis
        await redis.hset('user_profiles', lookupAddress, profile);

        // 2. Legacy fallback
        state.userProfiles[lookupAddress] = profile;
        saveState();

        console.log(`👤 [PROFILE] ${username} (${address.slice(0, 8)}...)`);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Missing address or username" });
    }
});



// Twitter OAuth (Proxy should route /auth/twitter/* to here if matching)
// But front-end logic might need adjustment if using different ports/prefixes.
app.post('/auth/twitter/prepare', (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Missing address" });
    const stateId = Math.random().toString(36).substring(2, 15);
    oauthStates.set(stateId, { address, timestamp: Date.now() });
    res.json({ state: stateId });
});

app.get('/auth/twitter/callback', async (req, res) => {
    // Basic OAuth implementation (Simplified)
    console.log("[OAUTH] Callback received");
    res.send("OAuth Callback Handled by Solana Keeper");
});

app.post('/trade-ping', async (req, res) => {
    // Only handle Solana pings
    const { id, amount, network, address, expiry, entryPrice, direction, duration, symbol, mainOwner } = req.body;
    if (network !== 'solana') return res.status(200).json({ ignored: true });

    try {
        const pdaStr = id; // Assuming ID is the PDA or we derive it
        // Basic tracking logic
        const betData = {
            id: pdaStr,
            owner: address,
            mainOwner: mainOwner || address,
            nonce: id, // Simplified
            amountLamports: (amount * 1e9).toString(),
            entryPrice, direction, duration, symbol: symbol || 'SOL', expiry,
            network: 'solana'
        };
        trackedBets.set(pdaStr, betData);

        // Add to history
        state.history.unshift({
            id: pdaStr,
            owner: address,
            amount,
            currency: "SOL",
            direction: direction === 1 ? "UP" : "DOWN",
            entryPrice,
            timestamp: Date.now(),
            status: "ACTIVE",
            network: 'solana',
            user: state.userProfiles[address]?.username || address.slice(0, 4)
        });
        if (state.history.length > 200) state.history.pop();

        state.totalTrades = (state.totalTrades || 0) + 1;

        // Update Stats Volume
        state.stats.totalVolume = (state.stats.totalVolume || 0) + parseFloat(amount);
        state.stats.count = (state.stats.count || 0) + 1;

        saveState();

        // Sync to Redis Global Stats
        try {
            const v = await redis.get('global_total_volume') || 0;
            const t = await redis.get('global_total_trades') || 0;
            await redis.set('global_total_volume', Number(v) + parseFloat(amount));
            await redis.set('global_total_trades', Number(t) + 1);

            await redis.set('total_trades', (state.totalTrades || 0)); // Scroller compat
            await redis.set('protocol_history', state.history.slice(0, 50)); // Cache recent history
        } catch (e) { }

        res.json({ success: true });

    } catch (e) {
        console.error("Ping error", e);
        res.status(500).json({ error: e.message });
    }
});

app.listen(PORT, () => console.log(`[SOLANA KEEPER] Running on port ${PORT}`));


// --- BLOCKCHAIN MONITORING ---
const ASSET_MAP = { 0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL' };
let activeConnection = connection;

function setupAccountSubscription() {
    console.log(`[MONITOR] connecting to ${activeConnection.rpcEndpoint}`);
    activeConnection.onProgramAccountChange(
        program.programId,
        async (info) => {
            if (info.accountInfo.data.length > 100) {
                try {
                    const decoded = program.coder.accounts.decode("bet", info.accountInfo.data);
                    if (!decoded.resolved && decoded.timestamp.toNumber() >= START_TIME) {
                        const id = info.accountId.toBase58();
                        const expiry = decoded.timestamp.toNumber() + decoded.duration.toNumber();
                        if (!trackedBets.has(id)) {
                            // New bet
                            const assetId = Number(decoded.nonce.toNumber() % 100n);
                            const symbol = ASSET_MAP[assetId] || 'SOL';
                            const direction = typeof decoded.direction === 'number' ? decoded.direction : decoded.direction.toNumber();
                            const amt = Number(decoded.amountLamports) / 1e9;

                            const betData = {
                                id,
                                owner: decoded.owner.toBase58(),
                                mainOwner: decoded.mainOwner.toBase58(),
                                nonce: decoded.nonce.toString(),
                                amountLamports: decoded.amountLamports.toString(),
                                entryPrice: Number(decoded.entryPrice.toString()) / 1e6,
                                direction, duration: decoded.duration, symbol, expiry
                            };
                            trackedBets.set(id, betData);

                            // Update Volume from On-Chain Event (if not already tracked)
                            state.stats.totalVolume = (state.stats.totalVolume || 0) + amt;
                            state.stats.count = (state.stats.count || 0) + 1;
                            saveState();

                            console.log(`[NEW BET] ${id.slice(0, 8)} | ${amt} ${symbol}`);
                        }
                    } else if (decoded.resolved) {
                        trackedBets.delete(info.accountId.toBase58());
                    }
                } catch (e) { }
            }
        },
        "confirmed"
    );
}

setupAccountSubscription();

// --- SETTLEMENT LOOP ---
setInterval(async () => {
    const now = Math.floor(Date.now() / 1000);
    const toSettle = [];

    for (const [id, bet] of trackedBets.entries()) {
        if (now >= bet.expiry) {
            toSettle.push(bet);
        }
    }

    // Process separately
    for (const bet of toSettle) {
        const verdict = await pricing.getResultVerdict(bet.entryPrice, bet.symbol);
        if (verdict.isReliable) {
            await settleBet(bet.id, bet, verdict.price);
            trackedBets.delete(bet.id);
            // Update history
            const histIdx = state.history.findIndex(h => h.id === bet.id);
            if (histIdx !== -1) {
                state.history[histIdx].status = "RESOLVED";
                state.history[histIdx].finalPrice = verdict.price;
            }
            saveState();
        }
    }
}, 3000);

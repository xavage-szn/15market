require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const pricing = require('shared-utils/pricing');
const Logger = require('shared-utils/logger');
const redis = require('shared-utils/redis');
const crypto = require('crypto');


// --- DNS FIX ---
const dns = require('dns');
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'rpc.testnet.arc.network') {
        if (options && options.all) return callback(null, [{ address: '64.130.40.38', family: 4 }]);
        return callback(null, '64.130.40.38', 4);
    }
    return originalLookup(hostname, options, callback);
};

// --- LOGGING ---
const logger = new Logger('ARC_KEEPER');
console.log = (...args) => logger.info(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));
console.error = (...args) => logger.error(args.map(a => typeof a === 'object' ? JSON.stringify(a) : a).join(' '));

// --- CONFIG ---
const ARC_RPC_LIST = [
    process.env.ARC_RPC || "https://rpc.testnet.arc.network",
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1",
    "wss://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
];
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const KEEPER_URL_BASE = process.env.KEEPER_URL || "http://localhost:3010";
const KEEPER_URL = process.env.KEEPER_URL_ARC || (KEEPER_URL_BASE.includes('localhost') ? KEEPER_URL_BASE : `${KEEPER_URL_BASE}/arc`);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || "15MARKET_ADMIN_SECRET_KEY_2024";
const PORT = process.env.PORT || 3010;

const ASSET_MAP = {
    0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL', 6: 'LINK', 7: 'PEPE'
};

// --- STATE ---
const STORAGE_FILE = path.resolve(__dirname, '../storage.json');
let state = {
    listings: [
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace', binance: 'ETHUSDT' },
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43', binance: 'BTCUSDT' }
    ],
    activeMarket: { activeId: 'eth' },
    campaigns: [],
    winnerBanner: null,
    enrollments: {},
    activeBets: {}, // Using object for JSON persistence
    history: [],
    stats: { totalTrades: 0, wins: 0, volume: 0 },
    autoSignerFees: 0,
    settings: {
        minBet: 1.0,
        maxBet: 1000000.0,
        maintenanceMode: false
    }
};

const saveState = () => {
    try {
        const tempFile = `${STORAGE_FILE}.tmp`;
        fs.writeFileSync(tempFile, JSON.stringify(state, null, 2));
        fs.renameSync(tempFile, STORAGE_FILE);
    } catch (e) {
        console.error("❌ [STORAGE] Save failed:", e);
    }
};

try {
    if (fs.existsSync(STORAGE_FILE)) {
        const raw = fs.readFileSync(STORAGE_FILE, 'utf8');
        if (raw && raw.trim().length > 0) {
            const saved = JSON.parse(raw);
            state = { ...state, ...saved };

            // Sync with Redis to ensure we have latest listings etc
            syncRedis();

            let resetCount = 0;
            for (const id in state.activeBets) {
                if (state.activeBets[id].processing) {
                    state.activeBets[id].processing = false;
                    resetCount++;
                }
            }
            if (resetCount > 0) console.log(`🔄 [STATE] Reset ${resetCount} stuck 'processing' bets.`);
        }
    }
} catch (e) {
    console.error("⚠️ [STATE] Load failed (corrupted?), starting fresh:", e.message);
    // If corrupted, rename to .bak for inspection
    if (fs.existsSync(STORAGE_FILE)) {
        fs.renameSync(STORAGE_FILE, `${STORAGE_FILE}.${Date.now()}.bak`);
    }
}

// --- REDIS SYNC LOGIC ---
async function syncRedis() {
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
    } catch (e) {
        console.warn(`[REDIS_SYNC] Failed: ${e.message}`);
    }
}

// --- REDIS ---
redis.connect()
    .then(() => {
        console.log('✅ REDIS CONNECTED SUCCESSFULLY');
        console.log('📍 Redis URL:', process.env.REDIS_URL || 'default (localhost:6379)');
        syncRedis(); // Initial sync
        setInterval(syncRedis, 10000); // 10s linkage
    })
    .catch(err => {
        console.error('❌ REDIS CONNECTION FAILED:', err.message);
        console.error('📍 Attempted URL:', process.env.REDIS_URL || 'default (localhost:6379)');
        console.error('⚠️ WARNING: Running in LOCAL MODE - data will NOT sync across instances!');
    });




// --- EXPRESS ---
const app = express();
app.set('trust proxy', 1); // Trust Dokploy/Nginx proxy
app.use(cors({
    origin: ["https://15market.online", "https://admin.15market.online", "http://localhost:3000", "http://localhost:5173"],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

app.use((req, res, next) => {
    if (req.path !== '/logs') console.log(`[REQ] ${req.method} ${req.path}`);

    // Prefix handling: If the frontend sends /arc/..., strip it so matching works
    if (req.url.startsWith('/arc/')) {
        req.url = req.url.replace('/arc/', '/');
    } else if (req.url === '/arc') {
        req.url = '/';
    }

    next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', timestamp: Date.now() }));
app.get('/logs', (req, res) => res.json(logger.getLogs()));
app.get('/history', (req, res) => res.json(state.history));
app.get('/trades/:address', (req, res) => {
    const { address } = req.params;
    if (!address) return res.status(400).json({ error: 'Missing address' });

    const userTrades = state.history.filter(t => {
        const owner = (t.owner || t.user || t.userPublicKey || t.userAddress || "").toString().toLowerCase();
        return owner === address.toLowerCase();
    });

    res.json(userTrades);
});
app.get('/active-bets', (req, res) => {
    const now = Date.now() / 1000;
    const activeBets = Object.values(state.activeBets).filter(b => {
        // Filter out bets that expired more than 60 seconds ago
        if (b.expiry && now > b.expiry + 60) {
            console.warn(`⚠️ [STALE_BET] Bet #${b.id} expired ${Math.floor(now - b.expiry)}s ago but still in activeBets. Removing...`);
            delete state.activeBets[b.id];
            return false;
        }
        return true;
    });
    res.json(activeBets);
});
app.get('/active-bets/:address', (req, res) => {
    const { address } = req.params;
    if (!address) return res.status(400).json({ error: 'Missing address' });

    const now = Date.now() / 1000;
    const userActive = Object.values(state.activeBets).filter(b => {
        // Filter out expired bets
        if (b.expiry && now > b.expiry + 60) {
            console.warn(`⚠️ [STALE_BET] Bet #${b.id} expired ${Math.floor(now - b.expiry)}s ago but still in activeBets. Removing...`);
            delete state.activeBets[b.id];
            return false;
        }
        return b.user && b.user.toLowerCase() === address.toLowerCase();
    });

    res.json(userActive);
});

app.get('/listings', (req, res) => res.json(state.listings));
app.post('/listings', (req, res) => {
    if (Array.isArray(req.body)) {
        state.listings = req.body;
        saveState();
        res.json({ success: true });
    } else res.status(400).end();
});

app.get('/active-market', (req, res) => res.json(state.activeMarket));
app.post('/active-market', (req, res) => {
    state.activeMarket = req.body;
    saveState();
    res.json({ success: true });
});

app.get('/settings', (req, res) => res.json(state.settings));
app.post('/settings', async (req, res) => {
    state.settings = { ...state.settings, ...req.body };
    saveState();
    await redis.set('platform_settings', state.settings);
    res.json({ success: true });
});

app.get('/campaigns', (req, res) => res.json(state.campaigns));
app.post('/campaigns', (req, res) => {
    state.campaigns = req.body;
    saveState();
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

app.post('/withdraw', async (req, res) => {
    const { amount, password } = req.body;
    if (password !== ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });

    try {
        const amtWei = ethers.parseUnits(amount.toString(), 18); // Arc Native USDC uses 18 decimals
        const tx = await keeper.contract.withdraw(amtWei);
        await tx.wait();
        res.json({ success: true, hash: tx.hash });
    } catch (e) {
        console.error("Manual Arc withdraw failed:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/manual-settle', async (req, res) => {
    const { betId, exitPrice, password } = req.body;
    if (password !== ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });

    try {
        const priceParam = BigInt(Math.floor(exitPrice * 100000000));
        const tx = await keeper.contract.settleBet(betId, priceParam);
        await tx.wait();

        // Update local state if needed
        delete state.activeBets[betId];
        saveState();

        res.json({ success: true, hash: tx.hash });
    } catch (e) {
        console.error("Manual Arc settle failed:", e);
        res.status(500).json({ error: e.message });
    }
});

app.post('/trade-ping', (req, res) => {
    const trade = req.body;
    console.log(`📡 [PING] New trade ping received: #${trade.id} from ${trade.address}`);

    // Optimistically add to active bets if not already there
    const betId = String(trade.id);
    if (!state.activeBets[betId]) {
        state.activeBets[betId] = {
            id: betId,
            user: trade.address,
            symbol: trade.symbol || 'SOL',
            duration: Number(trade.duration),
            amount: trade.amount,
            direction: Number(trade.direction),
            entryPrice: Number(trade.entryPrice),
            timestamp: Math.floor(Date.now() / 1000),
            status: 'PENDING',
            isPing: true // Flag to indicate it came from a ping
        };
        saveState();
    }
    res.json({ success: true });
});

app.get('/profile', async (req, res) => {
    const { address } = req.query;
    if (!address) return res.status(400).json({ error: "Missing address" });

    // 1. Check Redis Cache for social profile
    let profile = await redis.hget('user_profiles', address.toLowerCase());
    if (!profile) profile = { address: address.toLowerCase() };

    // 2. Calculate authoritative metrics from state.history
    const userTrades = state.history.filter(t => {
        const owner = (t.owner || t.user || t.userPublicKey || t.userAddress || "").toString().toLowerCase();
        return owner === address.toLowerCase();
    });

    const totalTrades = userTrades.length;
    const totalWins = userTrades.filter(t => t.status === "WON").length;
    const totalLosses = userTrades.filter(t => t.status === "LOST").length;
    const totalVolume = userTrades.reduce((acc, t) => acc + parseFloat(t.amount || 0), 0);

    // Merge profile with metrics
    const result = {
        ...profile,
        totalTrades,
        totalWins,
        totalLosses,
        totalVolume: totalVolume.toFixed(2)
    };

    res.json(result);
});

app.post('/sync-profile', async (req, res) => {
    const { address, username, xHandle, xProfileImage, tosAccepted } = req.body;
    if (address && username) {
        const profile = {
            username,
            xHandle: xHandle || "",
            xProfileImage: xProfileImage || "",
            tosAccepted: !!tosAccepted,
            network: 'arc',
            timestamp: Date.now()
        };

        // 1. Save to Redis (Global sync)
        await redis.hset('user_profiles', address.toLowerCase(), profile);

        console.log(`👤 [PROFILE] ${username} (${address.slice(0, 8)}...)`);
        res.json({ success: true });
    } else {
        res.status(400).json({ error: "Missing address or username" });
    }
});


// --- X OAUTH ---
const X_CLIENT_ID = (process.env.X_CLIENT_ID || 'cDdEeHQwYnp4Y2lJRVMzdk5CRlg6MTpjaQ').trim();
const X_CLIENT_SECRET = (process.env.X_CLIENT_SECRET || 'Bt5h0g_Lr7XtksAQnynyEwRIN5ldvHljhIaFlYJc3SY-1Zt6rm').trim();
const CLEAN_KEEPER_URL = KEEPER_URL.endsWith('/') ? KEEPER_URL.slice(0, -1) : KEEPER_URL;
const CALLBACK_URL = `${CLEAN_KEEPER_URL}/auth/twitter/callback`;

app.get('/auth/twitter/diag', (req, res) => {
    res.json({
        CALLBACK_URL,
        X_CLIENT_ID,
        FRONTEND_URL: process.env.FRONTEND_URL,
        KEEPER_URL,
        ENV_KEEPER_URL_ARC: process.env.KEEPER_URL_ARC
    });
});
app.post('/auth/twitter/prepare', async (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Missing address" });

    const stateId = crypto.randomUUID();
    // Store full body so we can handle origin/onboarding in callback
    await redis.set(`x_auth_state:${stateId}`, req.body, 600);
    res.json({ state: stateId });
});

app.get('/auth/twitter/callback', async (req, res) => {
    const { code, state } = req.query;

    const defaultFront = process.env.FRONTEND_URL || "http://localhost:3000";
    let redirectBase = defaultFront;

    try {
        const rawState = await redis.get(`x_auth_state:${state}`);

        if (!rawState) return res.redirect(`${defaultFront}?error=invalid_state`);

        const { address, origin } = rawState;
        if (origin) redirectBase = origin;

        // Exchange code for token
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('redirect_uri', CALLBACK_URL);
        params.append('code_verifier', 'challenge');

        console.log("📡 [X_AUTH] Attempting token exchange (Basic Auth)...", {
            url: 'https://api.twitter.com/2/oauth2/token',
            callback: CALLBACK_URL,
            client_id: X_CLIENT_ID
        });

        const tokenRes = await axios.post('https://api.twitter.com/2/oauth2/token', params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64')}`
            }
        });

        const { access_token } = tokenRes.data;
        if (!access_token) throw new Error("no_access_token");

        // Get User Info
        const userRes = await axios.get('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
            headers: { 'Authorization': `Bearer ${access_token}` }
        });

        const { username, profile_image_url } = userRes.data.data;

        // Auto-update profile in Redis to expedite frontend unlocking
        try {
            const existingRaw = await redis.hget('user_profiles', address.toLowerCase());
            if (existingRaw) {
                const profile = typeof existingRaw === 'string' ? JSON.parse(existingRaw) : existingRaw;
                profile.xHandle = username;
                profile.xProfileImage = profile_image_url;
                await redis.hset('user_profiles', address.toLowerCase(), profile);
                console.log(`✅ [X_AUTH] Updated existing profile for ${address}`);
            } else if (rawState.username) {
                const newProfile = {
                    username: rawState.username,
                    xHandle: username,
                    xProfileImage: profile_image_url,
                    tosAccepted: false,
                    network: 'arc',
                    timestamp: Date.now()
                };
                await redis.hset('user_profiles', address.toLowerCase(), newProfile);
                console.log(`🆕 [X_AUTH] Pre-registered profile for ${address}`);
            }
        } catch (redisErr) {
            console.error("⚠️ [X_AUTH] Redis sync failed (non-fatal):", redisErr.message);
        }

        // Redirect back to frontend with data
        res.redirect(`${redirectBase}?x_handle=${username}&x_image=${encodeURIComponent(profile_image_url)}`);

    } catch (e) {
        const errorData = e.response?.data;
        console.error("❌ [X_AUTH] Failed:", errorData || e.message);

        let errorType = "auth_failed";
        if (errorData?.error === "invalid_request") errorType = "invalid_config";
        if (errorData?.error === "unauthorized_client") errorType = "client_error";

        res.redirect(`${redirectBase}?error=${errorType}`);
    }
});

app.post('/record-fee', async (req, res) => {
    const { amount } = req.body;
    if (typeof amount === 'number') {
        state.autoSignerFees = (state.autoSignerFees || 0) + amount;
        saveState();

        // Sync to Redis
        await redis.set('auto_signer_fees_arc', state.autoSignerFees);

        console.log(`💰 [FEE_RECORDED] ${amount} USDC | Total: ${state.autoSignerFees}`);
        res.json({ success: true, total: state.autoSignerFees });
    } else {
        res.status(400).json({ error: 'Invalid amount' });
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
            activeCount: Object.keys(state.activeBets).length,
            totalTrades: Number(totalTrades),
            totalVolume: Number(totalVolume),
            wallets: Number(wallets),
            autoSignerFees: Number(autoSignerFees),
            settings: platformSettings
        });
    } catch (e) {
        res.json({
            autoSignerFees: state.autoSignerFees || 0,
            totalTrades: state.stats.totalTrades,
            totalVolume: state.stats.volume,
            wallets: 0,
            activeCount: Object.keys(state.activeBets).length,
            settings: state.settings
        });
    }
});

app.get('/escrow-stats', (req, res) => {
    res.json({
        arc: {
            stake: parseFloat(Object.values(state.activeBets).reduce((acc, b) => acc + (parseFloat(b.amount) || 0), 0)),
            count: Object.keys(state.activeBets).length,
            totalVolume: state.stats.volume,
            address: process.env.CONTRACT_ADDRESS
        }
    });
});

// --- KEEPER CLASS ---
class ArcKeeper {
    constructor() {
        this.currentRpcIdx = 0;
        this.settlementQueue = [];
        this.lastCheckedBlock = 0;
        this.nonce = -1;
        this.isSettling = false;
        this.isRateLimited = false;

        this.initProvider();
    }

    initProvider() {
        const rpc = ARC_RPC_LIST[this.currentRpcIdx];
        // ethers v6 uses FetchRequest for timeout
        const fetchReq = new ethers.FetchRequest(rpc);
        fetchReq.timeout = 30000; // 30 seconds

        // USE WEBSOCKET IF AVAILABLE FOR INSTANT EVENTS
        if (rpc.startsWith('http')) {
            this.provider = new ethers.JsonRpcProvider(fetchReq, undefined, { staticNetwork: true });
        } else {
            this.provider = new ethers.WebSocketProvider(rpc, undefined, { staticNetwork: true });
        }

        this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(CONTRACT_ADDRESS, this.getAbi(), this.wallet);

        // SETUP REAL-TIME LISTENERS
        this.setupListeners();
    }

    setupListeners() {
        console.log("📡 [EVENT] Setting up real-time contract listeners...");
        this.contract.on("BetPlaced", async (...args) => {
            const event = args[args.length - 1]; // Ethers v6 event is last
            console.log(`⚡ [REALTIME] New Bet Detected: #${event.args.id}`);
            await this.ingestBet(event, false);
        });
    }

    getAbi() {
        return [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];
    }

    rotateRpc() {
        this.currentRpcIdx = (this.currentRpcIdx + 1) % ARC_RPC_LIST.length;
        console.log(`🔄 [NETWORK] Rotating Arc RPC to: ${ARC_RPC_LIST[this.currentRpcIdx]}`);
        this.initProvider();
    }

    async callWithRetry(fn, label = "RPC", retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                if (this.isRateLimited) await new Promise(r => setTimeout(r, 5000));
                return await fn();
            } catch (err) {
                const isLimit = err.message.includes("limit reached") || err.code === -32007 || err.code === -32005;
                const isQuota = err.message.includes("daily request limit") || err.code === -32003;

                if (isQuota) {
                    console.error(`🚨 [QUOTA] RPC quota hit. Rotating...`);
                    this.rotateRpc();
                    continue;
                }

                if (isLimit) {
                    this.isRateLimited = true;
                    console.warn(`⚠️ [RATE_LIMIT] Cooling down... (Attempt ${i + 1}/${retries})`);
                    await new Promise(r => setTimeout(r, delay * (i + 1)));
                    continue;
                }
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    async init() {
        console.log("🚀 Initializing Isolated Arc Keeper...");
        try {
            const network = await this.callWithRetry(() => this.provider.getNetwork(), "INIT_NETWORK");
            console.log(`✅ Connected to Chain ID: ${network.chainId}`);

            this.nonce = await this.callWithRetry(() => this.wallet.getNonce(), "INIT_NONCE");
            console.log(`🔢 Initial Nonce: ${this.nonce}`);

            // OWNER VERIFICATION
            try {
                const owner = await this.callWithRetry(() => this.contract.owner(), "CHECK_OWNER");
                console.log(`👤 Contract Owner: ${owner}`);
                if (owner.toLowerCase() === this.wallet.address.toLowerCase()) {
                    console.log("✅ Keeper IS the authorized owner.");
                } else {
                    console.warn(`❌ [WARNING] Keeper (${this.wallet.address}) is NOT the owner. Settlement will fail!`);
                }
            } catch (ownerErr) {
                console.warn("⚠️ Could not verify owner status:", ownerErr.message);
            }

            // SPEED OPTIMIZATION: Faster polling and evaluation
            setInterval(() => this.pollEvents(), 5000); // 5s sync (Very fast for 'instant' feel)
            setInterval(() => this.evaluateBets(), 1000); // Check expiry every second
            setInterval(() => this.processSettlementQueue(), 500); // Check settlement queue every 0.5s
            setInterval(() => this.checkBalance(), 60000);

            // PROACTIVE NONCE RESYNC: Ensure nonce doesn't drift
            setInterval(async () => {
                this.nonce = await this.callWithRetry(() => this.provider.getTransactionCount(this.wallet.address, "pending"), "PERIODIC_NONCE_SYNC");
            }, 300000); // Every 5 minutes

            // COMPREHENSIVE DISCOVERY: Look back 5000 blocks for missed bets
            const currentBlock = await this.callWithRetry(() => this.provider.getBlockNumber(), "GET_INITIAL_BLOCK");
            const lookback = 5000;
            const fromBlock = Math.max(0, currentBlock - lookback);
            this.lastCheckedBlock = currentBlock;

            console.log(`🛰️ [DISCOVERY] Booting up discovery phase...`);
            this.discoverActiveBets();

            // Heartbeat
            setInterval(() => {
                this.isRateLimited = false;
                console.log(`💓 [HEARTBEAT] Arc Keeper Valid. Tracking: ${Object.keys(state.activeBets).length}`);
            }, 30000);

        } catch (err) {
            console.error(`❌ Init Failure: ${err.message}`);
        }
    }

    async checkBalance() {
        try {
            // Check Contract Balance (this is what pays users)
            const bal = await this.provider.getBalance(CONTRACT_ADDRESS);
            const ethBal = ethers.formatUnits(bal, 18); // Arc Native USDC uses 18 decimals
            console.log(`💰 [TREASURY] Contract Balance: ${ethBal} ARC`);
            if (parseFloat(ethBal) < 1.0) {
                console.warn(`⚠️ [LOW FUNDS] Contract balance is low! Payouts may fail.`);
            }

            // Check Keeper Balance (for gas)
            const gasBal = await this.provider.getBalance(this.wallet.address);
            if (parseFloat(ethers.formatUnits(gasBal, 18)) < 0.1) {
                console.warn(`⚠️ [LOW GAS] Keeper wallet low on gas: ${ethers.formatUnits(gasBal, 18)} ARC`);
            }
        } catch (e) { console.error("Balance check failed", e.message); }
    }

    async discoverActiveBets() {
        const currentBlock = await this.callWithRetry(() => this.provider.getBlockNumber(), "GET_BLOCK");
        const LOOKBACK = 5000; // Increased to recover more history
        const MAX_CHUNK = 100; // Increased for faster recovery
        let fromBlock = Math.max(0, currentBlock - LOOKBACK);

        console.log(`🔍 Scanning last ${LOOKBACK} blocks for historical trades...`);

        try {
            const filter = this.contract.filters.BetPlaced();

            for (let i = fromBlock; i < currentBlock; i += MAX_CHUNK) {
                const to = Math.min(i + MAX_CHUNK - 1, currentBlock);
                try {
                    const events = await this.callWithRetry(
                        () => this.contract.queryFilter(filter, i, to),
                        "DISCOVERY_CHUNK"
                    );

                    for (const e of events) await this.ingestBet(e, true);
                    await new Promise(r => setTimeout(r, 50));
                } catch (chunkErr) {
                    console.warn(`  ⚠️ Chunk ${i}-${to} failed: ${chunkErr.message}`);
                }
            }
        } catch (err) { console.warn(`Discovery failed: ${err.message}`); }

        this.lastCheckedBlock = currentBlock;
        console.log(`✅ Discovery complete. History size: ${state.history.length}`);
    }

    async pollEvents() {
        try {
            const currentBlock = await this.callWithRetry(() => this.provider.getBlockNumber(), "POLL_BLOCK");
            if (currentBlock <= this.lastCheckedBlock) return;

            const filter = this.contract.filters.BetPlaced();
            const MAX_CHUNK = 100;

            for (let i = this.lastCheckedBlock + 1; i <= currentBlock; i += MAX_CHUNK) {
                const to = Math.min(i + MAX_CHUNK - 1, currentBlock);
                try {
                    const events = await this.callWithRetry(
                        () => this.contract.queryFilter(filter, i, to), "POLL_CHUNK"
                    );
                    // Parallel ingestion with individual catch to avoid total failure
                    await Promise.all(events.map(e =>
                        this.ingestBet(e, false).catch(err => {
                            console.error(`❌ [INGEST_FAILED] Trade #${e.args.id}:`, err.message);
                        })
                    ));
                } catch (e) {
                    console.error(`❌ [POLL_FAILED] Chunk ${i}-${to}:`, e.message);
                }
            }

            this.lastCheckedBlock = currentBlock;
        } catch (err) { }
    }

    async ingestBet(event, isHistorical = false) {
        const { id, user, amount, direction, entryPrice, duration, timestamp, marketId } = event.args;
        const betId = id.toString();

        if (state.activeBets[betId]) return;

        // Skip really old historical trades to prevent bloating
        const expiry = Number(timestamp) + Number(duration);
        if (isHistorical && (Date.now() / 1000 > expiry + 86400)) return; // Older than 24h

        try {
            const betStruct = await this.callWithRetry(() => this.contract.bets(id), `CHECK_${betId}`, 2, 1000);

            if (betStruct.settled) {
                // Recover settled bet into history if missing
                if (!state.history.find(h => String(h.id) === betId)) {
                    state.history.unshift({
                        id: betId,
                        owner: user,
                        amount: ethers.formatUnits(amount, 18), // Arc Native USDC uses 18 decimals
                        currency: "USDC",
                        direction: Number(direction) === 1 ? "UP" : "DOWN",
                        entryPrice: (Number(entryPrice) / 100000000), // Keep as float for precision
                        exitPrice: (Number(betStruct.settlementPrice) / 100000000),
                        timestamp: Number(timestamp) * 1000,
                        status: betStruct.won ? "WON" : "LOST",
                        network: 'arc'
                    });
                    if (state.history.length > 2000) state.history.pop();
                    if (!isHistorical) saveState();
                }
                return;
            }

            const symbol = ASSET_MAP[marketId] || 'SOL';
            state.activeBets[betId] = {
                id: betId, user, symbol, duration: Number(duration),
                amount: ethers.formatUnits(amount, 18), // Arc Native USDC uses 18 decimals
                direction: Number(direction),
                entryPrice: Number(entryPrice) / 100000000,
                timestamp: Number(timestamp),
                expiry: expiry,
                tx: event.transactionHash,
                processing: false,
                processingStartedAt: 0 // New field to track stuck processing
            };

            // Update Stats
            state.stats.totalTrades = (state.stats.totalTrades || 0) + 1;
            const amtNum = parseFloat(ethers.formatUnits(amount, 18)); // Arc Native USDC uses 18 decimals
            state.stats.volume = (state.stats.volume || 0) + amtNum;

            saveState();

            // Push to Global Redis Sync
            try {
                const v = await redis.get('global_total_volume') || 0;
                const t = await redis.get('global_total_trades') || 0;
                await redis.set('global_total_volume', Number(v) + amtNum);
                await redis.set('global_total_trades', Number(t) + 1);
            } catch (e) { }

            // Report to logs
            console.log(`📥 [INGEST] Bet #${betId} | User: ${user.slice(0, 10)}... | Amount: ${state.activeBets[betId].amount} ARC | Asset: ${symbol}`);
        } catch (e) {
            console.error(`❌ [INGEST_FAILED] Bet #${betId}: ${e.message}`);
        }
    }

    async evaluateBets() {
        const now = Date.now() / 1000;
        for (const [id, bet] of Object.entries(state.activeBets)) {
            // STUCK PROCESSING GUARD: Reset if stuck > 120s (Allow more time for slow testnet)
            if (bet.processing) {
                if (bet.processingStartedAt && (now - bet.processingStartedAt > 120)) {
                    console.warn(`⚠️ [STUCK] Bet #${bet.id} stuck in processing > 120s. Resetting.`);
                    bet.processing = false;
                    bet.processingStartedAt = 0;
                }
                continue;
            }

            if (now >= bet.expiry) {
                bet.processing = true;
                bet.processingStartedAt = now;
                this.settlementQueue.push(bet);
            }
        }
    }

    async processSettlementQueue() {
        if (this.isSettling || this.settlementQueue.length === 0) return;
        this.isSettling = true;

        try {
            const batch = this.settlementQueue.splice(0, 5);
            console.log(`⚡ Settling batch of ${batch.length}...`);

            const uniqueSymbols = [...new Set(batch.map(b => b.symbol))];
            const priceMap = {};

            await Promise.all(uniqueSymbols.map(async s => {
                try {
                    const verdict = await pricing.getResultVerdict(0, s);
                    priceMap[s] = verdict.price;
                } catch (priceErr) {
                    console.error(`❌ [PRICE_FETCH] Failed for ${s}:`, priceErr.message);
                }
            }));

            const txPromises = batch.map(async (bet) => {
                const exitPrice = priceMap[bet.symbol];
                if (!exitPrice) {
                    bet.processing = false; // logic retry
                    this.settlementQueue.push(bet);
                    return;
                }

                // SECURITY CHECK: Is it already settled on-chain?
                try {
                    const onChainBet = await this.callWithRetry(() => this.contract.bets(bet.id), "CHECK_STATUS");
                    if (onChainBet && onChainBet.settled) {
                        console.log(`ℹ️ [SKIP] Bet #${bet.id} already settled on-chain.`);
                        delete state.activeBets[bet.id];

                        // Ensure history update even if we skip settlement
                        const isWon = onChainBet.won;
                        const exitP = (Number(onChainBet.settlementPrice) / 100000000).toFixed(4);

                        if (!state.history.find(h => String(h.id) === bet.id)) {
                            state.history.unshift({
                                id: bet.id,
                                owner: bet.user,
                                amount: bet.amount,
                                currency: "USDC",
                                direction: Number(bet.direction) === 1 ? "UP" : "DOWN",
                                entryPrice: bet.entryPrice,
                                exitPrice: exitP,
                                timestamp: Number(bet.timestamp) * 1000,
                                status: isWon ? "WON" : "LOST",
                                network: 'arc'
                            });
                            if (state.history.length > 2000) state.history.pop();
                        }

                        saveState();
                        return;
                    }
                } catch (statusErr) {
                    console.warn(`⚠️ [STATUS_CHECK_FAILED] #${bet.id}: ${statusErr.message}`);
                }

                const isWin = (Number(bet.direction) === 1 && exitPrice > bet.entryPrice) ||
                    (Number(bet.direction) === 0 && exitPrice < bet.entryPrice);

                try {
                    const priceParam = BigInt(Math.floor(exitPrice * 100000000));
                    const useNonce = this.nonce++;

                    // Log gas check & Use aggressive gas pricing
                    const feeData = await this.provider.getFeeData();
                    // 30% Buffer for Tip
                    const priorityFee = feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * 130n / 100n) : 2000000000n;
                    const maxFee = feeData.maxFeePerGas ? (feeData.maxFeePerGas * 120n / 100n) : undefined;

                    const activeGasPrice = maxFee || feeData.gasPrice || 20000000000n;
                    const requiredGas = 1500000n * activeGasPrice;
                    const bal = await this.provider.getBalance(this.wallet.address);

                    console.log(`⛽ [GAS] Req: ${ethers.formatUnits(requiredGas, 18)} | Current: ${ethers.formatUnits(bal, 18)} | Nonce: ${useNonce}`);

                    if (bal < requiredGas) {
                        console.error(`🔴 [GAS_FAILURE] Keeper has ${ethers.formatUnits(bal, 18)} ARC, but needs ~${ethers.formatUnits(requiredGas, 18)} ARC for settlement safety.`);
                        bet.processing = false;
                        this.settlementQueue.push(bet);
                        return;
                    }

                    const tx = await this.callWithRetry(() =>
                        this.contract.settleBet(BigInt(bet.id), priceParam, {
                            nonce: useNonce,
                            gasLimit: 1500000,
                            maxPriorityFeePerGas: priorityFee,
                            maxFeePerGas: maxFee
                        }), `SEND_TX_${bet.id}`
                    );

                    console.log(`📤 [SENT] #${bet.id} (${isWin ? 'WIN' : 'LOSS'}) | Price: $${exitPrice} | TX: ${tx.hash.substr(0, 10)}...`);

                    // TIMEOUT WRAPPER FOR TX CONFIRMATION
                    const waitPromise = tx.wait();
                    const timeoutPromise = new Promise((_, reject) =>
                        setTimeout(() => reject(new Error("Confirmation Timeout")), 60000)
                    );

                    Promise.race([waitPromise, timeoutPromise]).then(async (receipt) => {
                        if (receipt.status === 1) {
                            console.log(`✅ [CONFIRMED] Bet #${bet.id}`);
                            // Log events for debugging
                            if (receipt.logs.length > 0) {
                                console.log(`📜 [LOGS] ${receipt.logs.length} events emitted. Check explorer for details.`);
                            } else {
                                console.warn(`⚠️ [NO_LOGS] Confirmed but no events? Payout might have failed.`);
                            }

                            delete state.activeBets[bet.id];

                            // Fetch the actual on-chain result to get authoritative won/lost status
                            let actualWon = isWin; // Fallback to calculated value
                            try {
                                const settledBet = await this.callWithRetry(() => this.contract.bets(bet.id), `VERIFY_${bet.id}`);
                                if (settledBet && settledBet.settled) {
                                    actualWon = settledBet.won;
                                    console.log(`✓ [VERIFIED] Bet #${bet.id} on-chain result: ${actualWon ? 'WON' : 'LOST'}`);
                                }
                            } catch (verifyErr) {
                                console.warn(`⚠️ [VERIFY_FAILED] Could not verify on-chain result for #${bet.id}, using calculated: ${isWin ? 'WON' : 'LOST'}`);
                            }

                            // History Update with actual on-chain result
                            state.history.unshift({
                                id: bet.id,
                                owner: bet.user,
                                amount: bet.amount,
                                currency: "USDC",
                                direction: Number(bet.direction) === 1 ? "UP" : "DOWN",
                                entryPrice: bet.entryPrice,
                                exitPrice,
                                timestamp: Number(bet.timestamp) * 1000,
                                status: actualWon ? "WON" : "LOST",
                                network: 'arc',
                                absIndex: state.stats.totalTrades
                            });
                            if (state.history.length > 2000) state.history.pop();
                            saveState();

                            // Settlement complete
                            console.log(`✅ [SETTLED] Bet #${bet.id} | Won: ${actualWon}`);

                        }
                    }).catch(e => {
                        console.error(`❌ [FAILED/TIMEOUT] Bet #${bet.id} confirmation: ${e.message}`);
                        // Don't reset processing here immediately, let the "evaluateBets" stuck guard handle it
                        // This prevents rapid retry loops if the RPC is just slow
                    });

                } catch (txErr) {
                    console.error(`❌ [TX_ERROR] #${bet.id}: ${txErr.message}`);
                    bet.processing = false;
                    this.settlementQueue.push(bet);
                    // Reset nonce synchronization on error to prevent spiral
                    // Resync nonce using 'pending' to avoid stuck tx
                    this.nonce = await this.callWithRetry(() => this.provider.getTransactionCount(this.wallet.address, "pending"), "RESYNC_NONCE");
                }
            });

            await Promise.all(txPromises);
        } finally {
            this.isSettling = false;
        }
    }
}

// Start Server & Keeper
const keeper = new ArcKeeper();
keeper.init();

app.listen(PORT, async () => {
    console.log(`[ARC KEEPER] Running on port ${PORT}`);

    // Self-warmup on start
    try {
        await axios.get(`http://localhost:${PORT}/health`);
        console.log('🔥 Self-warmup complete');
    } catch (e) {
        console.warn('⚠️ Self-warmup failed:', e.message);
    }
});

// --- KEEP ALIVE ---
// Self-ping to keep the instance warm if running on a platform that sleeps (like Render/Dokploy free tiers)
setInterval(async () => {
    try {
        const fetch = (await import('node-fetch')).default;
        await fetch(`http://localhost:${PORT}/health`);
        // Silently success or debug log if needed
    } catch (e) {
        // Ignore errors from self-ping
    }
}, 60000);

// --- STALE BET CLEANUP ---
// Remove bets that have expired but weren't properly settled
setInterval(() => {
    const now = Date.now() / 1000;
    let cleanedCount = 0;

    Object.keys(state.activeBets).forEach(betId => {
        const bet = state.activeBets[betId];

        // IMPORTANT: Never cleanup a bet currently being processed
        if (bet.processing) return;

        // Remove bets that expired more than 5 minutes ago (generous for network lag)
        if (bet.expiry && now > bet.expiry + 300) {
            console.warn(`🧹 [CLEANUP] Removing stale bet #${betId} (expired ${Math.floor(now - bet.expiry)}s ago)`);

            // Move to history if not already there
            if (!state.history.find(h => String(h.id) === betId)) {
                state.history.unshift({
                    id: betId,
                    owner: bet.user,
                    amount: bet.amount,
                    currency: "USDC",
                    direction: Number(bet.direction) === 1 ? "UP" : "DOWN",
                    entryPrice: bet.entryPrice,
                    exitPrice: "0.00", // Unknown exit price
                    timestamp: Number(bet.timestamp) * 1000,
                    status: "TIMEOUT",
                    network: 'arc'
                });
                if (state.history.length > 2000) state.history.pop();
            }

            delete state.activeBets[betId];
            cleanedCount++;
        }
    });

    if (cleanedCount > 0) {
        console.log(`🧹 [CLEANUP] Removed ${cleanedCount} stale bet(s)`);
        saveState();
    }
}, 30000); // Run every 30 seconds

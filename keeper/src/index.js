const http = require('http');
const fs = require('fs');
const path = require('path');
const { program, readConnection, connection, PublicKey, SOLANA_FALLBACKS } = require("./config");
const { getConsensusPrice } = require("./arbiter");
const { settleBet } = require("./settler");
const bs58 = require("bs58");
const { Connection } = require("@solana/web3.js");

let activeConnection = connection;
let activeReadConnection = readConnection;

function rotateSolanaRpc() {
    const currentUrl = activeConnection.rpcEndpoint;
    const idx = SOLANA_FALLBACKS.indexOf(currentUrl);
    const nextUrl = SOLANA_FALLBACKS[(idx + 1) % SOLANA_FALLBACKS.length];
    console.warn(`🔄 [NETWORK] Rotating Solana RPC due to errors: ${nextUrl}`);
    activeConnection = new Connection(nextUrl, "confirmed");
    activeReadConnection = activeConnection; // Sync them
    setupAccountSubscription(); // Restart listener on new RPC
    return activeConnection;
}

let subscriptionId = null;
function setupAccountSubscription() {
    if (subscriptionId !== null && activeConnection) {
        try { activeConnection.removeProgramAccountChangeListener(subscriptionId); } catch (e) { }
    }

    console.log(`[KEEPER] 📡 Connecting to WebSocket for real-time monitoring on ${activeConnection.rpcEndpoint}`);

    subscriptionId = activeConnection.onProgramAccountChange(
        program.programId,
        async (info) => {
            if (info.accountInfo.data.length > 100) {
                try {
                    const decoded = program.coder.accounts.decode("bet", info.accountInfo.data);
                    if (!decoded.resolved && decoded.timestamp.toNumber() >= START_TIME) {
                        const id = info.accountId.toBase58();
                        const amt = Number(decoded.amountLamports) / 1e9;
                        const exp = decoded.timestamp.toNumber() + decoded.duration.toNumber();

                        const assetId = Number(decoded.nonce.toNumber() % 100n);
                        const symbol = ASSET_MAP[assetId] || 'SOL';
                        const direction = typeof decoded.direction === 'number' ? decoded.direction : decoded.direction.toNumber();

                        const betData = {
                            id,
                            owner: decoded.owner.toBase58(),
                            mainOwner: decoded.mainOwner.toBase58(),
                            nonce: decoded.nonce.toString(),
                            amountLamports: decoded.amountLamports.toString(),
                            entryPrice: Number(decoded.entryPrice.toString()) / 1e6,
                            direction: direction,
                            duration: decoded.duration,
                            symbol,
                            expiry: exp
                        };

                        if (!trackedBets.has(id)) {
                            console.log(`[KEEPER] 🔔 NEW BET DETECTED LIVE: ${id.slice(0, 8)} | ${amt} ${symbol} | Expire: ${new Date(exp * 1000).toLocaleTimeString()}`);
                            trackedBets.set(id, betData);

                            // Add to unified history
                            state.totalTrades = (state.totalTrades || 0) + 1;
                            if (!state.history) state.history = [];
                            state.history.unshift({
                                id,
                                owner: betData.owner,
                                amount: amt,
                                currency: symbol,
                                direction: direction === 1 ? "UP" : "DOWN",
                                entryPrice: betData.entryPrice,
                                timestamp: Date.now(),
                                status: "ACTIVE",
                                network: 'solana',
                                user: state.userProfiles[betData.owner]?.username || id.slice(0, 4) + '...' + id.slice(-4)
                            });
                            if (state.history.length > 200) state.history.pop();
                            saveState();
                        }

                        // Terminal compatibility log
                        console.log(`✨ [BET_DATA] ID:${id} | AMT:${amt} | EXP:${exp} | NET:solana`);
                    } else if (decoded.resolved) {
                        // If we see it's resolved on-chain, remove from our tracking
                        trackedBets.delete(info.accountId.toBase58());
                    }
                } catch (e) { }
            }
        },
        "confirmed"
    );
}

// Look back 3 days to catch any stuck bets during restarts
const START_TIME = Math.floor(Date.now() / 1000) - 259200;

// Track bets detected live via WebSocket to bypass RPC limits
const trackedBets = new Map();

// ==========================================
// 1. DATA STORAGE & PERSISTENCE
// ==========================================
const STORAGE_FILE = path.resolve(__dirname, '../storage.json');

let state = {
    logs: [],
    listings: [
        { id: 'sol', symbol: 'SOL', name: 'Solana', mint: 'So11111111111111111111111111111111111111112', pair: 'Czfq3xZZDmsdGdUyrNLtRhGc47cXcZtLG4crryfu44zE', pythId: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d', binance: 'SOLUSDT' },
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', pythId: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f8dc41b5e', binance: 'BTCUSDT' },
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', pythId: '0xffb26477e64e100806440db74f762a40788d7734bcc991d798150495f5431682', binance: 'ETHUSDT' }
    ],
    activeMarket: { activeId: 'sol' },
    campaigns: [],
    winnerBanner: null,
    enrollments: {}, // { campaignId: { address: true } }
    escrowStats: {
        solana: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 },
        arc: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 }
    },
    autoSignerFees: { solana: 0, arc: 0 },
    userProfiles: {}, // { address: { username, tosAccepted, network, timestamp } }
    totalTrades: 0,
    history: []
};
const oauthStates = new Map(); // { stateId: { address, network, timestamp } }

// Load from disk
try {
    if (fs.existsSync(STORAGE_FILE)) {
        const saved = JSON.parse(fs.readFileSync(STORAGE_FILE, 'utf8'));
        state = { ...state, ...saved, logs: [] }; // Don't persist logs
    }
} catch (e) {
    console.error("Failed to load storage:", e.message);
}

function saveState() {
    try {
        // Exclude logs and heavy stats from persistence if needed
        const { logs, ...toSave } = state;
        fs.writeFileSync(STORAGE_FILE, JSON.stringify(toSave, null, 2));
    } catch (e) {
        console.error("Save failed:", e.message);
    }
}

// ==========================================
// 2. LOG BRIDGE
// ==========================================
function captureLog(type, args) {
    const message = args.map(arg =>
        typeof arg === 'object' ? JSON.stringify(arg) : String(arg)
    ).join(' ');

    const entry = {
        id: Date.now() + Math.random(),
        timestamp: new Date().toLocaleTimeString(),
        type,
        message
    };
    state.logs.push(entry);
    if (state.logs.length > 200) state.logs.shift();
}

const originalLog = console.log;
const originalError = console.error;
const originalWarn = console.warn;

console.log = (...args) => { captureLog('INFO', args); originalLog.apply(console, args); };
console.error = (...args) => { captureLog('ERROR', args); originalError.apply(console, args); };
console.warn = (...args) => { captureLog('WARN', args); originalWarn.apply(console, args); };

// ==========================================
// 3. HTTP SERVER (BACKEND API)
// ==========================================
const port = 8080;
const server = http.createServer(async (req, res) => {
    // CORS
    const allowedOrigins = [
        'https://15market.online',
        'https://admin.15market.online',
        'http://localhost:5173',
        'http://localhost:3000',
        'http://localhost:3001'
    ];
    const origin = req.headers.origin;

    // Simplified but robust CORS for production subdomains
    if (origin && (origin.endsWith('.15market.online') || origin === 'https://15market.online' || allowedOrigins.includes(origin))) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    } else {
        // Fallback for direct browser access or localhost
        res.setHeader('Access-Control-Allow-Origin', origin || '*');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, DELETE');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    if (req.method === 'OPTIONS') { res.writeHead(200); res.end(); return; }

    const url = new URL(req.url, `http://${req.headers.host}`);
    const pathName = url.pathname;

    // Frontend URL for OAuth redirects
    const FRONTEND_URL = process.env.FRONTEND_URL || 'https://15market.online';

    // Log incoming requests for debugging
    if (pathName !== '/logs') {
        console.log(`[REQ] ${req.method} ${pathName}`);
    }

    // Helper to read body
    const readBody = (cb) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
            try { cb(JSON.parse(body)); } catch (e) { cb({}); }
        });
    };

    // --- ROUTES ---

    if (pathName === '/health') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ status: 'ok', timestamp: Date.now() }));
    }
    else if (pathName === '/logs') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(state.logs));
    }

    else if (pathName === '/arc-history') {
        const arcTrades = (state.history || []).filter(t => t.network === 'arc');
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(arcTrades));
    }
    else if (pathName === '/listings') {
        if (req.method === 'POST') {
            readBody(data => {
                if (Array.isArray(data)) {
                    state.listings = data;
                    saveState();
                    res.writeHead(200); res.end(JSON.stringify({ success: true }));
                } else { res.writeHead(400); res.end(); }
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.listings));
        }
    }
    else if (pathName === '/active-market') {
        if (req.method === 'POST') {
            readBody(data => {
                state.activeMarket = data;
                saveState();
                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.activeMarket));
        }
    }
    else if (pathName === '/campaigns') {
        if (req.method === 'POST') {
            readBody(data => {
                state.campaigns = data;
                saveState();
                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.campaigns));
        }
    }
    else if (pathName === '/winner-banner') {
        if (req.method === 'POST') {
            readBody(data => {
                state.winnerBanner = data;
                saveState();
                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.winnerBanner));
        }
    }
    else if (pathName === '/enroll') {
        if (req.method === 'POST') {
            readBody(data => {
                const { campaignId, address } = data;
                if (!state.enrollments[campaignId]) state.enrollments[campaignId] = {};
                state.enrollments[campaignId][address] = true;
                saveState();
                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else {
            // GET /enroll?campaignId=X&address=Y
            const cId = url.searchParams.get('campaignId');
            const addr = url.searchParams.get('address');
            const enrolled = state.enrollments[cId]?.[addr] || false;
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ enrolled }));
        }
    }
    else if (pathName === '/escrow-stats') {
        if (req.method === 'POST') {
            readBody(data => {
                // Merge stats
                if (data.arc) state.escrowStats.arc = { ...state.escrowStats.arc, ...data.arc };
                if (data.solana) state.escrowStats.solana = { ...state.escrowStats.solana, ...data.solana };
                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(state.escrowStats));
        }
    }
    else if (pathName === '/history') {
        const hist = state.history || [];
        console.log(`[SERVE] Serving ${hist.length} history items`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(hist));
    }
    else if (pathName === '/active-bets') {
        const active = Array.from(trackedBets.values());
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(active));
    }
    else if (pathName === '/protocol-stats') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            wallets: state.wallets || 0,
            activeCount: trackedBets.size,
            totalVolume: state.totalVolume || 0,
            totalTrades: state.totalTrades || 0,
            autoSignerFees: state.autoSignerFees || { solana: 0, arc: 0 },
            escrowStats: state.escrowStats || {
                solana: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 },
                arc: { stake: 0, count: 0, totalVolume: 0, wallets: 0, balance: 0 }
            }
        }));
    }
    else if (pathName === '/record-fee') {
        if (req.method === 'POST') {
            readBody(data => {
                const { network, amount } = data;
                if (network && typeof amount === 'number') {
                    if (!state.autoSignerFees) state.autoSignerFees = { solana: 0, arc: 0 };
                    state.autoSignerFees[network] = (state.autoSignerFees[network] || 0) + amount;
                    saveState();
                    console.log(`💰 [FEE_RECORDED] ${network.toUpperCase()}: +${amount}`);
                    res.writeHead(200); res.end(JSON.stringify({ success: true, fees: state.autoSignerFees }));
                } else {
                    res.writeHead(400); res.end(JSON.stringify({ error: "Invalid data" }));
                }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (pathName === '/sync-profile') {
        if (req.method === 'POST') {
            readBody(data => {
                const { address, username, xHandle, xProfileImage, tosAccepted, network } = data;
                if (address && username) {
                    state.userProfiles[address] = {
                        username,
                        xHandle: xHandle || "",
                        xProfileImage: xProfileImage || "",
                        tosAccepted: !!tosAccepted,
                        network: network || 'unknown',
                        timestamp: Date.now()
                    };
                    saveState();
                    console.log(`👤 [PROFILE_SYNC] ${username} (@${xHandle || '?'}) (${address.slice(0, 8)}...) on ${network}`);
                    res.writeHead(200); res.end(JSON.stringify({ success: true }));
                } else {
                    res.writeHead(400); res.end(JSON.stringify({ error: "Missing address or username" }));
                }
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (pathName === '/profile') {
        const address = url.searchParams.get('address');
        const profile = state.userProfiles[address] || null;
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(profile));
    }
    else if (pathName === '/report-arc-trade') {
        if (req.method === 'POST') {
            readBody(data => {
                // Log the Arc trade as if it happened here for the terminal
                console.log(`✨ [BET_DATA] ID:${data.id} | AMT:${data.amount} | EXP:${data.timestamp} | NET:arc`);
                if (data.won) {
                    console.log(`✅ [ARC_PAYOUT] Winner ${data.user.slice(0, 6)}... received ${data.payout} ARC`);
                }

                // Add to unified history
                const isWon = !!data.won;
                const dir = (data.direction !== undefined)
                    ? (Number(data.direction) === 1 ? "UP" : "DOWN")
                    : (data.strike < data.final ? "UP" : "DOWN");

                const newTrade = {
                    id: data.id,
                    owner: data.user,
                    amount: parseFloat(data.amount),
                    currency: "USDC",
                    direction: dir,
                    entryPrice: data.strike,
                    timestamp: data.timestamp > 2000000000 ? data.timestamp : data.timestamp * 1000,
                    status: isWon ? "WON" : "LOST",
                    won: isWon,
                    network: 'arc',
                    user: state.userProfiles[data.user]?.username || data.user.slice(0, 4) + '...' + data.user.slice(-4)
                };

                if (!state.history) state.history = [];
                const existingIdx = state.history.findIndex(t => t.id === newTrade.id && t.network === 'arc');
                if (existingIdx !== -1) {
                    state.history[existingIdx] = { ...state.history[existingIdx], ...newTrade };
                } else {
                    state.history.unshift(newTrade);
                    state.totalTrades = (state.totalTrades || 0) + 1;
                }
                if (state.history.length > 200) state.history.pop();

                saveState();

                // Cleanup tracked bets if they exist
                const arcKey = `arc_${data.id}`;
                if (trackedBets.has(arcKey)) {
                    trackedBets.delete(arcKey);
                }

                res.writeHead(200); res.end(JSON.stringify({ success: true }));
            });
        } else { res.writeHead(404); res.end(); }
    }
    else if (pathName === '/auth/twitter/prepare') {
        if (req.method === 'POST') {
            readBody(data => {
                const { address, network } = data;
                if (!address) {
                    res.writeHead(400); res.end(JSON.stringify({ error: "Missing address" }));
                    return;
                }
                const stateId = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
                oauthStates.set(stateId, {
                    address,
                    network: network || 'unknown',
                    timestamp: Date.now()
                });

                // Cleanup old states (older than 10 mins)
                const now = Date.now();
                for (const [id, s] of oauthStates.entries()) {
                    if (now - s.timestamp > 600000) oauthStates.delete(id);
                }

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ state: stateId }));
            });
        } else { res.writeHead(405); res.end(); }
    }
    else if (pathName === '/auth/twitter/callback') {
        const code = url.searchParams.get('code');
        const stateParam = url.searchParams.get('state');

        if (!code) {
            res.writeHead(400); res.end("Missing authorization code");
            return;
        }

        try {
            const fetch = require('node-fetch');
            const auth = Buffer.from(`${process.env.X_CLIENT_ID}:${process.env.X_CLIENT_SECRET}`).toString('base64');

            // Standardize redirect_uri to match EXACTLY what is in the Twitter Portal
            // Use the host from headers if available, otherwise fallback to API domain
            const host = req.headers.host || 'api.15market.online';
            const redirectUri = `https://${host}/auth/twitter/callback`;

            console.log(`[X_AUTH] 🔐 Exchanging authorization code for access token...`);
            console.log(`[X_AUTH] 📍 Using Redirect URI: ${redirectUri}`);

            const tokenResponse = await fetch('https://api.twitter.com/2/oauth2/token', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                    'Authorization': `Basic ${auth}`
                },
                body: new URLSearchParams({
                    code,
                    grant_type: 'authorization_code',
                    redirect_uri: redirectUri,
                    code_verifier: 'challenge'
                })
            });

            const tokenData = await tokenResponse.json();
            if (!tokenData.access_token) {
                console.error("[X_AUTH] ❌ Token exchange failed:", tokenData);
                res.writeHead(400); res.end("Failed to exchange code for token");
                return;
            }

            console.log(`[X_AUTH] ✅ Access token obtained, fetching user profile...`);

            const profileResponse = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
                headers: {
                    'Authorization': `Bearer ${tokenData.access_token}`,
                    'User-Agent': '15market-keeper'
                }
            });
            const profileData = await profileResponse.json();
            const username = profileData.data?.username;
            const profileImageUrl = profileData.data?.profile_image_url;

            if (username) {
                console.log(`[X_AUTH] ✅ Verified user: @${username}`);

                // Look up state info
                const savedState = oauthStates.get(stateParam);
                if (!savedState) {
                    console.warn("[X_AUTH] ⚠️ Invalid or expired state:", stateParam);
                }

                // Store the X handle association with the wallet address
                const targetAddress = savedState?.address;
                if (targetAddress) {
                    if (!state.userProfiles[targetAddress]) {
                        state.userProfiles[targetAddress] = {};
                    }
                    state.userProfiles[targetAddress].xHandle = username;
                    state.userProfiles[targetAddress].xProfileImage = profileImageUrl || "";
                    saveState();
                    console.log(`[X_AUTH] 💾 Linked @${username} to wallet ${targetAddress.slice(0, 8)}...`);

                    // Consume the state
                    oauthStates.delete(stateParam);
                }

                // Redirect back to frontend with the handle and image
                const redirectTo = `${FRONTEND_URL}/?x_handle=${username}${profileImageUrl ? `&x_image=${encodeURIComponent(profileImageUrl)}` : ''}`;
                console.log(`[X_AUTH] 🔄 Redirecting to: ${redirectTo}`);
                res.writeHead(302, { 'Location': redirectTo });
                res.end();
            } else {
                console.error("[X_AUTH] ❌ Failed to get profile data:", profileData);
                res.writeHead(400); res.end("Failed to get profile");
            }
        } catch (e) {
            console.error("[X_AUTH] ❌ Error:", e);
            res.writeHead(500); res.end("Internal error");
        }
    }
    else if (pathName === '/trade-ping' && req.method === 'POST') {
        readBody(data => {
            const { id, amount, network, address, expiry, entryPrice, direction, duration, symbol, mainOwner } = data;
            console.log(`[PING] 🔔 New trade detected via ping: ${id} | Amt: ${amount} | Net: ${network}`);

            if (network === 'solana' && address && id) {
                try {
                    const userPubkey = new PublicKey(address);
                    const nonceBuffer = Buffer.alloc(8);
                    nonceBuffer.writeBigUInt64LE(BigInt(id));
                    const [betPda] = PublicKey.findProgramAddressSync(
                        [Buffer.from("bet_v7"), userPubkey.toBuffer(), nonceBuffer],
                        program.programId
                    );
                    const pdaStr = betPda.toBase58();

                    if (!trackedBets.has(pdaStr)) {
                        const betData = {
                            id: pdaStr,
                            owner: address,
                            mainOwner: mainOwner || address,
                            nonce: id.toString(),
                            amountLamports: (amount * 1e9).toString(),
                            entryPrice: entryPrice,
                            direction: direction,
                            duration: duration,
                            symbol: symbol || 'SOL',
                            expiry: expiry,
                            network: 'solana'
                        };
                        trackedBets.set(pdaStr, betData);
                        console.log(`[PING] 🚀 Auto-tracking Solana bet: ${pdaStr.slice(0, 8)} (via Ping)`);

                        // Add to unified history (Live)
                        if (!state.history) state.history = [];
                        if (!state.history.find(t => t.id === pdaStr && t.network === 'solana')) {
                            state.history.unshift({
                                id: pdaStr,
                                owner: address,
                                amount: amount,
                                currency: "SOL",
                                direction: direction === 1 ? "UP" : "DOWN",
                                entryPrice: entryPrice,
                                timestamp: Date.now(),
                                status: "ACTIVE",
                                network: 'solana',
                                user: state.userProfiles[address]?.username || address.slice(0, 4) + '...' + address.slice(-4)
                            });
                            state.totalTrades = (state.totalTrades || 0) + 1;
                            if (state.history.length > 200) state.history.pop();
                        }
                        saveState();
                    }
                } catch (e) {
                    console.error("[PING] ❌ Failed to derive PDA from ping data:", e.message);
                }
            } else if (network === 'arc' && address && id) {
                const arcId = `arc_${id}`;
                if (!trackedBets.has(arcId)) {
                    const betData = {
                        id: id.toString(), // The numeric ID for the contract
                        owner: address,
                        amount: amount,
                        entryPrice: entryPrice,
                        direction: direction,
                        duration: duration,
                        symbol: symbol || 'SOL',
                        expiry: expiry,
                        network: 'arc'
                    };
                    trackedBets.set(arcId, betData);
                    console.log(`[PING] 🚀 Auto-tracking Arc bet: ${id} (via Ping)`);

                    // Add to unified history (Live)
                    if (!state.history) state.history = [];
                    if (!state.history.find(t => t.id === id.toString() && t.network === 'arc')) {
                        state.history.unshift({
                            id: id.toString(),
                            owner: address,
                            amount: amount,
                            currency: "USDC",
                            direction: direction === 1 ? "UP" : "DOWN",
                            entryPrice: entryPrice,
                            timestamp: Date.now(),
                            status: "ACTIVE",
                            network: 'arc',
                            user: state.userProfiles[address]?.username || address.slice(0, 4) + '...' + address.slice(-4)
                        });
                        state.totalTrades = (state.totalTrades || 0) + 1;
                        if (state.history.length > 200) state.history.pop();
                    }
                    saveState();
                }
            }

            res.writeHead(200);
            res.end(JSON.stringify({ success: true }));
        });
    }
    // Analytics Mock endpoints
    else if (pathName === '/leaderboard') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([
            { rank: 1, user: "8xJ...4k2", wins: 42, volume: "120.5" },
            { rank: 2, user: "3mP...9s1", wins: 38, volume: "95.2" },
            { rank: 3, user: "Root Admin", wins: 15, volume: "440.0" }
        ]));
    }
    else if (pathName === '/campaign-trades') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify([]));
    }
    else if (pathName === '/status') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
            uptime: Math.floor(process.uptime()),
            trackedBets: trackedBets.size,
            historyCount: (state.history || []).length,
            lastFetch: state.lastFetch || "never",
            rpc: process.env.NETWORK
        }));
    }
    else {
        res.writeHead(404);
        res.end();
    }
});

const PORT = process.env.PORT || 8080;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`[KEEPER] Server running on port ${PORT}`);
});

// ==========================================
// 4. SOLANA KEEPER LOGIC
// ==========================================
const ASSET_MAP = {
    0: 'BTC',
    1: 'ETH',
    2: 'MON',
    3: 'JUP',
    4: 'XRP',
    5: 'SOL'
};

const BET_DISCRIMINATOR = bs58.encode(Buffer.from([147, 23, 35, 59, 15, 75, 155, 32]));

async function fetchPendingBets() {
    try {
        const filters = [
            {
                memcmp: {
                    offset: 0,
                    bytes: BET_DISCRIMINATOR
                }
            }
        ];

        const accounts = await activeReadConnection.getProgramAccounts(program.programId, {
            filters,
            commitment: "confirmed"
        }).catch(err => {
            if (err.message.includes("403") || err.message.includes("Forbidden") || err.message.includes("not available")) {
                rotateSolanaRpc();
                return [];
            }
            throw err;
        });

        const pending = [];
        const now = Math.floor(Date.now() / 1000);

        let solActiveStake = 0;
        let solActiveCount = 0;

        for (const { pubkey, account } of accounts) {
            try {
                const decoded = program.coder.accounts.decode("bet", account.data);

                // Track stats
                if (!decoded.resolved) {
                    const amt = Number(decoded.amountLamports) / 1e9;
                    solActiveStake += amt;
                    solActiveCount++;
                }

                if (decoded.resolved) continue;

                const ts = decoded.timestamp.toNumber();
                const dur = decoded.duration.toNumber();
                const expiry = ts + dur;

                // Ignore legacy bets created before keeper start
                if (ts < START_TIME) continue;

                if (expiry <= now) {
                    const assetId = Number(decoded.nonce.toNumber() % 100n);
                    const symbol = ASSET_MAP[assetId] || 'SOL';
                    const direction = typeof decoded.direction === 'number' ? decoded.direction : decoded.direction.toNumber();

                    const betData = {
                        id: pubkey.toBase58(),
                        owner: decoded.owner.toBase58(),
                        mainOwner: decoded.mainOwner.toBase58(),
                        nonce: decoded.nonce.toString(),
                        amountLamports: decoded.amountLamports.toString(),
                        entryPrice: Number(decoded.entryPrice.toString()) / 1e6,
                        direction: direction,
                        duration: decoded.duration,
                        symbol,
                        expiry
                    };
                    pending.push(betData);
                    // Also track it locally if we found it
                    trackedBets.set(pubkey.toBase58(), betData);
                    console.log(`[KEEPER] Bet ${pubkey.toBase58().slice(0, 8)} ready: ${symbol} | Entry: ${betData.entryPrice} | Dir: ${direction === 1 ? 'UP' : 'DOWN'}`);
                } else if (!decoded.resolved) {
                    // Not ready yet but valid, track it for future check
                    const assetId = Number(decoded.nonce.toNumber() % 100n);
                    const symbol = ASSET_MAP[assetId] || 'SOL';
                    const direction = typeof decoded.direction === 'number' ? decoded.direction : decoded.direction.toNumber();

                    trackedBets.set(pubkey.toBase58(), {
                        id: pubkey.toBase58(),
                        owner: decoded.owner.toBase58(),
                        mainOwner: decoded.mainOwner.toBase58(),
                        nonce: decoded.nonce.toString(),
                        amountLamports: decoded.amountLamports.toString(),
                        entryPrice: Number(decoded.entryPrice.toString()) / 1e6,
                        direction: direction,
                        duration: decoded.duration,
                        symbol,
                        expiry
                    });
                }
            } catch (e) {
                // Skip decoding errors
            }
        }

        // Update Stats
        state.escrowStats.solana.stake = solActiveStake;
        state.escrowStats.solana.count = solActiveCount;

        return pending;
    } catch (e) {
        console.error(`[KEEPER] Error fetching accounts: ${e.message}`);
        return [];
    }
}

async function fetchProtocolHistory() {
    try {
        const [profiles, bets] = await Promise.all([
            activeReadConnection.getProgramAccounts(program.programId, { filters: [{ dataSize: 104 }] }),
            activeReadConnection.getProgramAccounts(program.programId, {
                filters: [
                    { dataSize: 112 },
                    { memcmp: { offset: 74, bytes: bs58.encode(Buffer.from([1])) } } // true (resolved)
                ],
                commitment: "confirmed"
            })
        ]);

        const history = bets.map(b => {
            try {
                const decoded = program.coder.accounts.decode("bet", b.account.data);
                return {
                    publicKey: b.pubkey.toBase58(),
                    owner: decoded.owner.toBase58(),
                    amount: Number(decoded.amountLamports) / 1e9,
                    direction: Number(decoded.direction) === 1 ? "UP" : "DOWN",
                    entryPrice: Number(decoded.entryPrice) / 1e6,
                    timestamp: decoded.timestamp.toNumber() * 1000,
                    duration: decoded.duration.toNumber(),
                    resolved: true,
                    network: 'solana',
                    won: !!decoded.userWon,
                    status: decoded.userWon ? "WON" : "LOST"
                };
            } catch (e) { return null; }
        }).filter(b => b !== null).sort((a, b) => b.timestamp - a.timestamp).slice(0, 100);

        const solanaHistory = history;
        const arcHistory = (state.history || []).filter(item => item.network === 'arc');

        state.history = [...solanaHistory, ...arcHistory]
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice(0, 200);

        state.wallets = profiles.length;
        state.totalVolume = solanaHistory.reduce((acc, b) => acc + b.amount, 0);

        // Ensure totalTrades reflects at least the current history length
        if (!state.totalTrades || state.totalTrades < state.history.length) {
            state.totalTrades = state.history.length;
        }
        state.lastFetch = new Date().toISOString();

        console.log(`[KEEPER] Cache Updated: ${history.length} trades | ${profiles.length} wallets`);
    } catch (e) {
        if (!e.message.includes("getProgramAccounts is not available") && !e.message.includes("403")) {
            console.error(`[KEEPER] History scan error: ${e.message}`);
        } else {
            rotateSolanaRpc();
        }
    }
}

async function runKeeper() {
    console.log(`[KEEPER] 🚀 Starting loop | START_TIME: ${START_TIME}`);

    // Initial history scan
    fetchProtocolHistory();
    // Refresh history every 2 minutes (slow scan)
    setInterval(fetchProtocolHistory, 120000);

    setupAccountSubscription();

    let fetchErrors = 0;
    let loopCount = 0;
    while (true) {
        try {
            loopCount++;
            if (loopCount % 100 === 0) console.log(`[KEEPER] 💓 Heartbeat | Loop: ${loopCount} | Tracked: ${trackedBets.size}`);

            const now = Math.floor(Date.now() / 1000);

            // 1. Check our tracked bets queue (FAST CHECK)
            const readyToSettle = [];
            for (const [id, bet] of trackedBets.entries()) {
                // Stale Bet Cleanup (Auto-remove if > 1 hour past expiry)
                if (now > bet.expiry + 3600) {
                    trackedBets.delete(id);
                    continue;
                }

                if (bet.expiry <= now && bet.network !== 'arc') {
                    readyToSettle.push(bet);
                }
            }

            // 2. Supplement with RPC fetch (SLOW CHECK - FALLBACK for missed WS events)
            if (readyToSettle.length === 0 && loopCount % 50 === 0) {
                const rpcBets = await fetchPendingBets();
                if (rpcBets.length > 0) {
                    readyToSettle.push(...rpcBets);
                    fetchErrors = 0;
                }
            }

            // 3. Process Settlements
            if (readyToSettle.length > 0) {
                // Deduplicate and prioritize OLDER bets (those that have been waiting longest)
                const uniqueBets = Array.from(new Map(readyToSettle.map(b => [b.id, b])).values())
                    .sort((a, b) => a.expiry - b.expiry);

                const burstMode = uniqueBets.length > 5;
                if (burstMode) {
                    console.log(`[KEEPER] 🔥 BURST MODE: Processing ${uniqueBets.length} pending settlements...`);
                } else {
                    const idList = uniqueBets.map(b => b.id.slice(0, 8)).join(", ");
                    console.log(`[KEEPER] 🔍 Processing ${uniqueBets.length} settlement(s): [${idList}]`);
                }

                // Batch price fetching
                const symbols = [...new Set(uniqueBets.map(b => b.symbol))];
                const priceMap = {};
                await Promise.all(symbols.map(async (sym) => {
                    const price = await getConsensusPrice(sym);
                    if (price) {
                        priceMap[sym] = price;
                    } else {
                        console.warn(`[KEEPER] ⚠️ Price fetch failed for ${sym}`);
                    }
                }));

                // Parallel execution with concurrency limit
                // Burst mode uses higher concurrency to clear backlog
                const CONCURRENCY = burstMode ? 10 : 3;
                let treasuryLow = false;

                for (let i = 0; i < uniqueBets.length; i += CONCURRENCY) {
                    const chunk = uniqueBets.slice(i, i + CONCURRENCY);

                    await Promise.all(chunk.map(async (bet) => {
                        const price = priceMap[bet.symbol];
                        if (!price) {
                            console.log(`[KEEPER] ⏳ Skipping ${bet.id.slice(0, 8)} - No price available for ${bet.symbol}`);
                            return;
                        }

                        // SAFETY: Wait at least 2s after expiry to allow for RPC propagation
                        const age = now - bet.expiry;
                        if (age < 2) {
                            console.log(`[KEEPER] ⏳ Skipping ${bet.id.slice(0, 8)} - Too fresh (${age}s post-expiry)`);
                            return;
                        }

                        // If treasury is known to be low, only process LOSSES (sweeping to treasury)
                        // to recover funds, skip WINNINGS until treasury is refilled.
                        const dir = Number(bet.direction); // Fix: Ensure it's a Number (some RPCs return strings)
                        const isWinByDirection = (dir === 1) ? (price > bet.entryPrice) : (price < bet.entryPrice);
                        if (isWinByDirection && treasuryLow) {
                            console.log(`[KEEPER] ⚠️ Skipping win settlement for ${bet.id.slice(0, 8)} - waiting for treasury refill`);
                            return;
                        }

                        let res = await settleBet(bet.id, bet, price);

                        if (res.success) {
                            console.log(`✅ [SETTLED] ${bet.network || 'solana'} | ${bet.id.slice(0, 8)} | Price: ${price} | Won: ${res.userWon !== undefined ? res.userWon : '?'}`);

                            // Remove from tracking using the map key
                            const mapKey = bet.network === 'arc' ? `arc_${bet.id}` : bet.id;
                            trackedBets.delete(mapKey);

                            // FORCE IMMEDIATE BALANCE REFRESH after settlement
                            try {
                                const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);
                                const bal = await activeConnection.getBalance(treasuryPda);
                                state.escrowStats.solana.balance = bal / 1e9;
                                console.log(`💰 [BALANCE_REFRESH] New Solana Balance: ${state.escrowStats.solana.balance} SOL`);
                            } catch (e) { }
                        } else {
                            const err = res.error || "";
                            console.warn(`[KEEPER] ❌ Settlement failed for ${bet.id.slice(0, 12)}...: ${err}`);

                            // 1. Permanent Failures - Cleanup
                            const isAlreadySettled = err.includes("3012") ||
                                err.includes("AlreadySettled") ||
                                err.includes("AccountNotInitialized") ||
                                err.includes("not initialized");

                            if (isAlreadySettled) {
                                console.log(`[KEEPER] 🧹 Cleaning up missing/settled bet: ${bet.id.slice(0, 8)}`);
                                trackedBets.delete(bet.id);
                                return;
                            }

                            // 2. Treasury Issues - Save state to skip other winnings in this loop
                            if (err.includes("InsufficientTreasury") || err.includes("0x1774")) {
                                console.error(`[KEEPER] 🚨 TREASURY DEPLETED! Blocking winning settlements until refill.`);
                                treasuryLow = true;
                                // Keep in trackedBets for next loop retry
                            }

                            // 3. RPC/Network issues - Keep in trackedBets for retry
                        }
                    }));
                }
            }

            // 4. Update Stats throttled (Every 10 loops = ~10s or ~2s depending on loop delay)
            if (loopCount % 10 === 0) {
                try {
                    const [treasuryPda] = PublicKey.findProgramAddressSync([Buffer.from("treasury")], program.programId);
                    const bal = await activeConnection.getBalance(treasuryPda);
                    state.escrowStats.solana.balance = bal / 1e9;
                } catch (e) { }
            }

        } catch (e) {
            fetchErrors++;
            console.error(`[KEEPER] Loop error: ${e.message}`);
        }

        const delay = trackedBets.size > 0 ? 200 : 2000;
        await new Promise(r => setTimeout(r, delay));
    }
}

runKeeper().catch(console.error);

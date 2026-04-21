const express = require('express');
const axios = require('axios');
const { ethers } = require('ethers');
const proxy = require('express-http-proxy');
require('dotenv').config();

const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const blockchain = require('./blockchain');
const redis = require('./redis');
const pricing = require('./pricing');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Active trade monitors — betId → TradeMonitor instance
const activeMonitors = new Map();

// ─── TradeMonitor ─────────────────────────────────────────────────────────────
// One instance per active trade. Subscribes to the live pricing feed, emits
// trade_tick every second, locks exit price at expiry, settles on-chain, and
// emits a single authoritative trade_settled event.
class TradeMonitor {
    constructor({ betId, addr, direction, amount, entryPrice, entryPriceActual,
                  duration, marketId, symbol }) {
        this.betId       = String(betId);
        this.addr        = addr;
        this.direction   = parseInt(direction);
        this.amount      = parseFloat(amount);
        this.entryPriceRaw    = entryPrice;        // raw scaled value sent to contract
        this.entryPriceActual = parseFloat(entryPriceActual) || 0; // real $ price at entry
        this.duration    = parseInt(duration);
        this.marketId    = parseInt(marketId);
        this.symbol      = symbol; // 'eth' | 'btc' | 'sol'
        this.stake       = parseFloat(amount);
        this.latestPrice = pricing.getPrice(symbol) || this.entryPriceActual;
        this.tickInterval  = null;
        this.settleTimer   = null;
        this.settled       = false;
    }

    start() {
        const TICK_MS  = 1000;
        const expiryMs = (this.duration * 1000) + 500; // 500ms buffer past expiry
        let elapsed    = 0;

        // Subscribe to live pricing feed
        pricing.subscribe(this.betId, (prices) => {
            const p = prices[this.symbol];
            if (p && p > 0) this.latestPrice = p;
        });

        // Emit trade_tick every second
        this.tickInterval = setInterval(() => {
            if (this.settled) return;
            elapsed += TICK_MS;
            const timeLeft     = Math.max(0, this.duration - elapsed / 1000);
            const currentPrice = this.latestPrice;
            const isWinning    = this.direction === 1
                ? currentPrice > this.entryPriceActual
                : currentPrice < this.entryPriceActual;

            io.to(this.addr).emit('trade_tick', {
                betId: this.betId,
                timeLeft: parseFloat(timeLeft.toFixed(1)),
                currentPrice,
                entryPrice: this.entryPriceActual,
                direction: this.direction,
                amount: this.amount,
                symbol: this.symbol.toUpperCase(),
                isWinning,
            });
        }, TICK_MS);

        // Settlement timer
        this.settleTimer = setTimeout(() => this._settle(), expiryMs);
        console.log(`[TradeMonitor] ▶ Started #${this.betId} (${this.symbol.toUpperCase()}, ${this.duration}s, entry $${this.entryPriceActual})`);
    }

    async _settle() {
        if (this.settled) return;
        this.settled = true;
        this._cleanup();

        console.log(`[TradeMonitor] ⏰ Expiry for #${this.betId}. Locking exit price...`);

        let exitPrice = this.latestPrice;
        if (!exitPrice || exitPrice <= 0) {
            // Single 2s retry
            await new Promise(r => setTimeout(r, 2000));
            exitPrice = pricing.getPrice(this.symbol);
        }
        if (!exitPrice || exitPrice <= 0) {
            console.error(`[TradeMonitor] ✗ No price for #${this.betId}. Settling as LOST.`);
            await this._emitSettlement(false, 0, '0.00', null);
            return;
        }

        const won = this.direction === 1
            ? exitPrice > this.entryPriceActual
            : exitPrice < this.entryPriceActual;

        // Scale exit price for on-chain call (matches original formula)
        let scaledExitPrice;
        if (this.marketId === 2) scaledExitPrice = Math.floor(exitPrice * 1000000);
        else scaledExitPrice = Math.floor(exitPrice * 100);

        const multiplier = this.duration <= 5 ? 2.90 : (this.duration <= 10 ? 2.40 : 1.90);
        const payout     = won ? (this.stake * multiplier).toFixed(4) : '0.00';

        // On-chain settlement
        let settleTx = null;
        try {
            settleTx = await blockchain.settleBet(this.betId, scaledExitPrice);
            console.log(`[TradeMonitor] ✓ On-chain TX for #${this.betId}: ${settleTx?.hash}`);
        } catch (e) {
            console.error(`[TradeMonitor] ✗ On-chain settle failed for #${this.betId}:`, e.message);
        }

        console.log(`[TradeMonitor] ${won ? '🟢 WON' : '🔴 LOST'} #${this.betId} @ $${exitPrice} | Entry $${this.entryPriceActual} | Payout: ${payout}`);

        await this._emitSettlement(won, exitPrice, payout, settleTx?.hash);
        await redis.srem('active_trades', this.betId);
        pricing.trackTrade(false);
        activeMonitors.delete(this.betId);
        emitAdminStats();
    }

    async _emitSettlement(won, exitPrice, payout, txHash) {
        const symbolMap  = { 0: 'ETH', 1: 'BTC', 2: 'SOL' };
        const symbolDisp = symbolMap[this.marketId] || this.symbol.toUpperCase();

        const event = {
            type: 'TRADE_SETTLED',
            betId:        this.betId,
            won,
            payout,
            exitPrice,
            entryPrice:   this.entryPriceActual,
            direction:    this.direction,
            duration:     this.duration,
            marketId:     this.marketId,
            amount:       this.stake,
            symbol:       symbolDisp,
            multiplier:   this.duration <= 5 ? 2.90 : (this.duration <= 10 ? 2.40 : 1.90),
            timestamp:    Date.now(),
            userAddr:     this.addr,
            txHash:       txHash || null,
        };

        // Persist full report to Redis activity log
        await redis.lpush(`activity:${this.addr}`, JSON.stringify(event));

        // Broadcast to user's private room + globally
        io.to(this.addr).emit('trade_settled', event);
        io.emit('trade_settled', event);

        // Balance update
        try {
            const sessionAddr = await redis.get(`addr:${this.addr}`);
            const balAddr     = sessionAddr || this.addr;
            const newBal      = await blockchain.getBalance(balAddr);
            io.to(this.addr).emit('balance_update', {
                balance: newBal,
                reason:  won ? 'WIN' : 'LOSS',
                betId:   this.betId,
                payout,
            });
        } catch (e) {}
    }

    _cleanup() {
        clearInterval(this.tickInterval);
        clearTimeout(this.settleTimer);
        this.tickInterval = null;
        this.settleTimer  = null;
        pricing.unsubscribe(this.betId);
    }

    stop() { this.settled = true; this._cleanup(); }
}
// ─────────────────────────────────────────────────────────────────────────────

// Price Oracle State
let prices    = { btc: 0, eth: 0, sol: 0 };
let oracleReady = false;

pricing.onPriceUpdate = (newPrices) => {
    prices = { ...newPrices };
    oracleReady = true;
};

// Keep oracle warm always
pricing.trackTrade(true);

// Socket
io.on('connection', (socket) => {
    console.log('[Socket] Client Connected');
    socket.emit('price_update', prices);

    socket.on('join', (room) => {
        if (room) { socket.join(room.toLowerCase()); console.log(`[Socket] User joined room: ${room}`); }
    });
    socket.on('auth_admin', (token) => {
        if (token === process.env.ADMIN_TOKEN) { socket.join('admin_room'); socket.emit('auth_success'); }
    });
    socket.on('join_user', (address) => {
        if (address) socket.join(address.toLowerCase());
    });
    socket.on('disconnect', () => { console.log(`[Socket] Disconnected: ${socket.id}`); });
});

const emitAdminStats = async () => {
    const adminRoom = io.sockets.adapter.rooms.get('admin_room');
    if (!adminRoom || adminRoom.size === 0) return;
    try {
        const totalVolume  = await redis.get('stats:total_volume') || '0';
        const totalTrades  = await redis.get('stats:total_trades') || '0';
        const treasuryBalance = await blockchain.getBalance(blockchain.arcWallet.address);
        const activeUsersCount = await redis.scard('stats:active_users_set') || 0;
        io.emit('admin_metrics_update', { totalVolume, totalTrades, treasuryBalance, activeUsers: activeUsersCount, timestamp: Date.now() });
    } catch (e) {}
};

const trackActivity = async (addr) => {
    if (!addr) return;
    await redis.sadd('stats:active_users_set', addr.toLowerCase());
};

// --- Balances ---
app.get('/balance/:address', async (req, res) => {
    const balance = await blockchain.getBalance(req.params.address);
    res.json({ balance });
});

app.get('/session/balance/:address', async (req, res) => {
    const addr = req.params.address.toLowerCase();
    try {
        const sessionAddr = await redis.get(`addr:${addr}`);
        if (!sessionAddr) return res.json({ balance: '0.0' });
        const balance = await blockchain.getBalance(sessionAddr);
        res.json({ success: true, balance: balance || '0.0', sessionAddress: sessionAddr });
    } catch (e) { res.json({ balance: '0.0' }); }
});

// --- Rounds Proxy (paused) ---
app.use('/rounds', (req, res) => {
    res.status(503).json({ success: false, error: "Rounds service is currently paused." });
});

// --- Session Management ---
app.post('/session/init', async (req, res) => {
    const { address } = req.body;
    if (!address) return res.status(400).json({ error: "Address required" });
    const addr = address.toLowerCase();
    try {
        let pk = await redis.get(`pk:${addr}`);
        let sessionAddr = await redis.get(`addr:${addr}`);
        if (!pk) {
            const w = ethers.Wallet.createRandom();
            pk = w.privateKey; sessionAddr = w.address;
            await redis.set(`pk:${addr}`, pk);
            await redis.set(`addr:${addr}`, sessionAddr);
            console.log(`[Session] Created account for ${addr}: ${sessionAddr}`);
        }
        const balance = await blockchain.getBalance(sessionAddr);
        res.json({ success: true, sessionAddress: sessionAddr, balance: balance || '0.0' });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// --- Trades ---
app.post('/session/execute', async (req, res) => {
    const { address, tradeParams } = req.body;
    if (!address || !tradeParams) return res.status(400).json({ error: "Missing params" });

    const addr = address.toLowerCase();
    const pk   = await redis.get(`pk:${addr}`);
    if (!pk) return res.status(400).json({ error: "Session wallet not found" });

    const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;
    const assetMap = ['eth', 'btc', 'sol'];
    const symbol   = assetMap[parseInt(marketId)] || 'eth';

    try {
        const walletAddress    = await redis.get(`addr:${addr}`);
        const currentOnChainBal = await blockchain.getBalance(walletAddress);
        const currentBal       = parseFloat(currentOnChainBal || '0.0');
        const stake            = parseFloat(amount);

        if (currentBal < stake + 0.0005) return res.status(400).json({ error: "Insufficient session balance" });

        // Capture actual dollar price at entry time (used by monitor for tick display & comparison)
        const entryPriceActual = pricing.getPrice(symbol) || 0;

        // Persist trade to Redis
        const tradeData = { id, userAddr: addr, direction, amount, entryPrice, entryPriceActual, duration, marketId, symbol, timestamp: Date.now(), status: 'PENDING' };
        await redis.set(`bet_owner:${id}`, addr, 'EX', 86400);
        await redis.set(`trade:${id}`, JSON.stringify(tradeData), 'EX', 86400);
        await redis.sadd('active_trades', id);
        pricing.trackTrade(true);

        // Place bet on-chain
        const receipt = await blockchain.placeBetForUser(pk, id, direction, duration, entryPrice, marketId, amount);

        await redis.incrbyfloat('stats:total_volume', stake);
        await redis.incr('stats:total_trades');

        const activityRecord = {
            type: 'TRADE_PLACED', id, amount, direction,
            symbol: symbol.toUpperCase(), timestamp: Date.now(),
            txHash: receipt.hash, userAddr: addr
        };
        await redis.lpush(`activity:${addr}`, JSON.stringify(activityRecord));
        io.emit('new_trade', activityRecord);
        trackActivity(addr);

        console.log(`[API] Trade placed #${id}. TX: ${receipt.hash}`);
        io.to(addr).emit('trade_placed', { id, txHash: receipt.hash });
        emitAdminStats();

        // ── Start TradeMonitor (replaces raw setTimeout) ──────────────────────
        const monitor = new TradeMonitor({ betId: id, addr, direction, amount, entryPrice, entryPriceActual, duration, marketId, symbol });
        monitor.start();
        activeMonitors.set(String(id), monitor);

        res.json({ success: true, txHash: receipt.hash });
    } catch (error) {
        console.error(`[API] Trade execution failed:`, error.message);
        res.status(500).json({ error: error.message });
    }
});

app.get('/history/:address', async (req, res) => {
    const addr = req.params.address.toLowerCase();
    try {
        const activities = await redis.lrange(`activity:${addr}`, 0, 50);
        res.json(activities.map(a => JSON.parse(a)));
    } catch (e) { res.json([]); }
});

app.post('/settle', async (req, res) => {
    res.json({ success: true, message: "Settlement handled by TradeMonitor" });
});

// --- Platform Settings & Admin ---
app.get('/settings', (req, res) => {
    res.json({ minBet: 0.1, maxBet: 10000, maintenanceMode: false, tradingHalted: false, systemBanner: "", bannerLevel: "info" });
});

app.post('/settings', async (req, res) => {
    io.emit('settings_updated', req.body);
    res.json({ success: true, settings: req.body });
});

app.post('/broadcast', async (req, res) => {
    const { text, duration, level } = req.body;
    io.emit('broadcast_received', { text, duration, level });
    res.json({ success: true });
});

app.post('/session/record', async (req, res) => {
    const { address, transaction } = req.body;
    if (!address || !transaction) return res.status(400).json({ error: "Missing data" });
    const addr = address.toLowerCase();
    try {
        if (transaction.type === 'DEPOSIT') {
            await redis.lpush(`activity:${addr}`, JSON.stringify({ ...transaction, timestamp: Date.now() }));
        }
        res.json({ success: true });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/session/cashout', async (req, res) => {
    const { address, amount } = req.body;
    if (!address || amount === undefined) return res.status(400).json({ error: "Missing data" });
    const addr = address.toLowerCase();
    try {
        const pk         = await redis.get(`pk:${addr}`);
        const sessionAddr = await redis.get(`addr:${addr}`);
        if (!pk || !sessionAddr) return res.status(404).json({ error: "Session wallet not found" });
        const currentBal  = parseFloat(await blockchain.getBalance(sessionAddr) || '0.0');
        const withdrawAmt = parseFloat(amount);
        if (isNaN(withdrawAmt) || withdrawAmt <= 0) return res.status(400).json({ error: "Invalid amount" });
        if (currentBal < withdrawAmt) return res.status(400).json({ error: "Insufficient balance" });
        const receipt = await blockchain.withdrawBurner(pk, addr, withdrawAmt);
        await redis.lpush(`activity:${addr}`, JSON.stringify({ type: 'WITHDRAW', amount: withdrawAmt.toFixed(4), timestamp: Date.now(), txHash: receipt.hash, userAddr: addr }));
        res.json({ success: true, txHash: receipt.hash });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/profiles/:address', async (req, res) => {
    const addr = req.params.address.toLowerCase();
    try {
        const data = await redis.get(`user:${addr}`);
        if (!data) return res.status(404).json({ error: "Profile not found" });
        res.json(JSON.parse(data));
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/profiles', async (req, res) => {
    const { address, username, xHandle, avatar } = req.body;
    const addr = address.toLowerCase();
    try {
        const profile = { address: addr, username, xHandle, avatar, createdAt: Date.now() };
        await redis.set(`user:${addr}`, JSON.stringify(profile));
        res.json(profile);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/campaigns', (req, res) => {
    res.json([{ id: 'early-adopter', name: 'Early Adopter Bonus', endTime: Date.now() + (86400000 * 30), description: 'Join the vanguard of Arc traders.' }]);
});

app.get('/winner-banner', (req, res) => {
    res.json({ address: "0x...123", amount: "1000", market: "BTC", timestamp: Date.now() });
});

app.get('/enroll', async (req, res) => {
    const { campaignId, address } = req.query;
    if (!campaignId || !address) return res.status(400).json({ error: "Missing params" });
    const enrolled = await redis.get(`enrollment:${campaignId}:${address.toLowerCase()}`);
    res.json({ enrolled: !!enrolled });
});

app.get('/protocol-stats', async (req, res) => {
    const totalVolume  = await redis.get('stats:total_volume') || '0';
    const totalTrades  = await redis.get('stats:total_trades') || '0';
    const activeUsers  = await redis.scard('stats:active_users_set') || 0;
    res.json({ totalVolume, totalTrades, activeUsers, treasuryBalance: await blockchain.getBalance(blockchain.arcWallet.address) });
});

app.get('/listings', (req, res) => {
    res.json([
        { id: 'btc', symbol: 'BTC', name: 'Bitcoin', binance: 'BTCUSDT' },
        { id: 'eth', symbol: 'ETH', name: 'Ethereum', binance: 'ETHUSDT' },
        { id: 'sol', symbol: 'SOL', name: 'Solana', binance: 'SOLUSDT' },
        { id: 'mon', symbol: 'MON', name: 'Monad', binance: 'SOLUSDT' },
    ]);
});

app.get('/prices', (req, res) => {
    const hasAnyPrice = Object.values(prices || {}).some(v => Number(v) > 0);
    res.json({ ...prices, oracleReady, hasAnyPrice });
});

app.get('/active-market', (req, res) => res.json({ activeId: 'btc' }));
app.post('/active-market', (req, res) => {
    const { activeId } = req.body;
    if (activeId) { io.emit('market_changed', { activeId }); res.json({ success: true, activeId }); }
    else res.status(400).json({ error: "activeId required" });
});

app.post('/admin/flush-trades', async (req, res) => {
    const { token } = req.body;
    if (token !== process.env.ADMIN_TOKEN) return res.status(401).json({ error: "Unauthorized" });
    try {
        // Stop all active monitors
        activeMonitors.forEach(m => m.stop());
        activeMonitors.clear();
        const activeIds = await redis.smembers('active_trades');
        for (const id of activeIds) {
            try {
                const raw = await redis.get(`trade:${id}`);
                if (raw) {
                    const trade = JSON.parse(raw);
                    const exitPrice = trade.direction === 1 ? 10 : 999999999;
                    await blockchain.settleBet(id, Math.floor(exitPrice * 100));
                }
            } catch (e) { console.warn(`[Admin] Could not settle #${id}:`, e.message); }
        }
        await redis.flushall();
        blockchain.localNonces = {};
        res.json({ success: true, message: `System Reset: ${activeIds.length} trades purged.` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/time', (req, res) => res.json({ time: Date.now() }));
app.get('/health', (req, res) => res.json({ status: 'OK', oracle: oracleReady ? 'READY' : 'NOT_READY', timestamp: Date.now() }));

app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ error: "Internal Server Error" });
});

// --- Recovery: restart monitors for trades missed during downtime ---
const recoverPendingSettlements = async () => {
    console.log("[Recovery] Scanning for missed settlements...");
    try {
        const activeIds = await redis.smembers('active_trades');
        const now       = Date.now();

        for (const id of activeIds) {
            pricing.trackTrade(true);
            const raw = await redis.get(`trade:${id}`);
            if (!raw) { await redis.srem('active_trades', id); continue; }

            const trade  = JSON.parse(raw);
            const expiry = trade.timestamp + (parseInt(trade.duration) * 1000);

            if (now > expiry + 30000) {
                // Expired >30s ago — settle immediately
                console.log(`[Recovery] Settling abandoned trade #${id}...`);
                const assetMap = ['eth', 'btc', 'sol'];
                const symbol   = assetMap[trade.marketId] || 'eth';
                const exitPrice = pricing.getPrice(symbol);
                if (exitPrice > 0) {
                    let scaledExit = trade.marketId === 2 ? Math.floor(exitPrice * 1000000) : Math.floor(exitPrice * 100);
                    await blockchain.settleBet(id, scaledExit).catch(e => console.warn(`[Recovery] Settle failed #${id}:`, e.message));
                    await redis.srem('active_trades', id);
                    pricing.trackTrade(false);
                }
            } else {
                // Still within window — restart the monitor with remaining time
                const remaining    = Math.max(1, Math.ceil((expiry - now) / 1000));
                const symbolMap    = ['eth', 'btc', 'sol'];
                const symbol       = symbolMap[trade.marketId] || 'eth';
                const entryActual  = trade.entryPriceActual || (trade.marketId === 2 ? parseFloat(trade.entryPrice) / 1000000 : parseFloat(trade.entryPrice) / 100);
                console.log(`[Recovery] Restarting monitor for #${id} (~${remaining}s remaining)`);
                const monitor = new TradeMonitor({
                    betId: id, addr: trade.userAddr, direction: trade.direction,
                    amount: trade.amount, entryPrice: trade.entryPrice,
                    entryPriceActual: entryActual, duration: remaining,
                    marketId: trade.marketId, symbol
                });
                monitor.start();
                activeMonitors.set(String(id), monitor);
            }
        }
    } catch (e) { console.error("[Recovery] Failed:", e.message); }
};

const PORT = process.env.PORT || 3010;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend running on port ${PORT}`);
    setTimeout(recoverPendingSettlements, 5000);
});

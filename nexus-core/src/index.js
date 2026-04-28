// ============================================================
// nexus-core/src/index.js
// Unified Entry Point — Embedded Wallet Model (No SCW)
// ============================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const cache = require('./cache');
const rpc = require('./rpc');
const ClassicEngine = require('./classic');
const profiles = require('./profiles');
const { ethers } = require('ethers');

// --- Setup Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const provider = rpc.mainProvider;

// --- Session Wallet Derivation (EOA, server-side) ---
const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
function deriveSessionWallet(userAddr) {
  const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr.toLowerCase());
  const privateKey = ethers.keccak256(entropy);
  const wallet = new ethers.Wallet(privateKey, provider);
  return wallet;
}

// --- Initialize Engines ---
const classicEngine = new ClassicEngine(io);
classicEngine.start();

// --- INTERNAL PRICE FEED ---
const PYTH_IDS = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
};
const https = require('https');
const BINANCE_IDS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };
const MEXC_IDS   = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };

function fetchFromSource(url, parser) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          if (res.statusCode !== 200) throw new Error(`Status ${res.statusCode}`);
          const p = parser(JSON.parse(data));
          if (!p || isNaN(p)) throw new Error('Invalid price');
          resolve(p);
        } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(800, () => { req.destroy(); reject(new Error('Timeout')); });
  });
}

async function pollPrices() {
  for (const key of Object.keys(PYTH_IDS)) {
    try {
      const sources = [
        {
          url: `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_IDS[key]}`,
          parse: (d) => {
            const p = d.parsed?.[0]?.price;
            return p ? parseFloat(p.price) * Math.pow(10, p.expo) : null;
          }
        },
        {
          url: `https://api.binance.com/api/v3/ticker/price?symbol=${BINANCE_IDS[key]}`,
          parse: (d) => parseFloat(d.price)
        },
        {
          url: `https://api.mexc.com/api/v3/ticker/price?symbol=${MEXC_IDS[key]}`,
          parse: (d) => parseFloat(d.price)
        }
      ];
      const price = await Promise.any(sources.map(s => fetchFromSource(s.url, s.parse)));
      const now = Date.now();
      cache.prices[key] = price;
      cache.priceMeta[key] = { updatedAt: now };
      if (!cache.priceHistory[key]) cache.priceHistory[key] = [];
      cache.priceHistory[key].push({ price, time: now });
      if (cache.priceHistory[key].length > 1200) cache.priceHistory[key].shift();
      io.emit('price', { key, price, ts: now });
    } catch (_) {}
  }
}
setInterval(pollPrices, 300);

// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);
  Object.keys(cache.prices).forEach(key => {
    if (cache.prices[key] > 0) {
      socket.emit('price', { key, price: cache.prices[key], ts: cache.priceMeta[key]?.updatedAt || Date.now() });
    }
  });
  socket.on('join_user', (address) => {
    const room = String(address || '').toLowerCase();
    if (room) socket.join(room);
  });
});

// ============================================================
// API Routes
// ============================================================

app.get('/settings', (req, res) => {
  res.json({
    minBet: config.DEFAULT_MIN_BET || 1.0,
    maxBet: 1000000.0,
    maintenanceMode: false,
    tradingHalted: false,
    systemBanner: "",
    bannerLevel: "info",
    treasuryAddress: config.TREASURY_ADDRESS
  });
});

// Main wallet balance (on-chain)
app.get('/balance/:address', async (req, res) => {
  try {
    const bal = await rpc.getBalance(req.params.address);
    res.json({ success: true, balance: bal });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

// ─── SESSION WALLET ROUTES (Embedded EOA) ─────────────────────────────────────

/**
 * POST /session/init
 * Returns the deterministic embedded (session) wallet address for this user,
 * plus its real on-chain balance. No SCW, no factory, no lockStake.
 */
app.post('/session/init', async (req, res) => {
  try {
    const identity = classicEngine.resolveSessionIdentity(req.body || {});
    if (!identity.ok) return res.status(400).json({ error: identity.error });
    const userAddr = identity.identityKey;

    const sessionWallet = deriveSessionWallet(userAddr);
    const sessionAddress = sessionWallet.address;

    // Fetch real on-chain balance of the session EOA
    let balance = '0';
    try {
      const balWei = await provider.getBalance(sessionAddress);
      balance = ethers.formatEther(balWei);
    } catch (_) {}

    // Sync in-process session
    const session = cache.getOrCreateSession(userAddr, {
      identityKey: userAddr,
      walletAddress: identity.walletAddress,
      sessionAddress,
      balance: parseFloat(balance),
    });

    res.json({
      success: true,
      sessionAddress,
      walletAddress: session.walletAddress,
      balance,
    });
  } catch (err) {
    console.error('[session/init] error:', err.message);
    res.status(500).json({ error: "Session init failed" });
  }
});

/**
 * GET /session/balance/:address
 * Real on-chain balance of the embedded session wallet EOA.
 */
app.get('/session/balance/:address', async (req, res) => {
  try {
    const userAddr = req.params.address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);
    const balWei = await provider.getBalance(sessionWallet.address);
    const balance = ethers.formatEther(balWei);

    // Also sync in-process session balance
    const session = cache.sessions.get(userAddr);
    if (session) session.balance = parseFloat(balance);

    res.json({ success: true, balance, sessionAddress: sessionWallet.address, source: 'eoa-onchain' });
  } catch (err) {
    console.error('[session/balance] error:', err.message);
    // If RPC fails, return the cached in-memory balance as fallback
    const session = cache.sessions.get(req.params.address.toLowerCase());
    if (session) return res.json({ success: true, balance: String(session.balance), source: 'in-process-fallback' });
    res.status(500).json({ error: "Balance fetch failed" });
  }
});

/**
 * GET /session/address/:address
 * Returns the embedded session wallet address for the given user.
 */
app.get('/session/address/:address', (req, res) => {
  try {
    const userAddr = req.params.address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);
    res.json({ success: true, sessionAddress: sessionWallet.address });
  } catch (err) {
    res.status(500).json({ error: "Failed to derive session address" });
  }
});

/**
 * POST /session/execute
 * 
 * SIMPLIFIED TREASURY-FIRST TRADE MODEL:
 * 1. Frontend has ALREADY sent the stake from the main wallet to the treasury.
 * 2. We receive the txHash of that transfer.
 * 3. We validate the tx, register the trade, start the countdown.
 * 4. Settlement happens automatically when the timer expires.
 * 
 * If no txHash is provided (pure simulation mode / testnet with no funds),
 * we accept the trade as a balance-deduction trade using the in-process session.
 */
app.post('/session/execute', async (req, res) => {
  const { address, tradeParams, txHash: stakeTxHash } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });

  try {
    // Use the classic engine which handles in-process balance + settlement queue
    const result = await classicEngine.placeTrade(tradeParams, { address });
    
    if (!result.success) {
      return res.status(400).json(result);
    }

    // Attach the stake tx hash if provided (for audit trail)
    if (stakeTxHash && result.tradeId) {
      const trade = cache.trades.get(String(tradeParams.id || result.tradeId));
      if (trade) trade.stakeTxHash = stakeTxHash;
    }

    res.json({
      ...result,
      newBalance: String(cache.sessions.get(address.toLowerCase())?.balance || 0)
    });
  } catch (err) {
    console.error('[session/execute] error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /session/cashout
 * Sends accumulated winnings from the session EOA back to the user's main wallet.
 */
app.post('/session/cashout', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Missing address" });
  
  try {
    const userAddr = address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);

    const balWei = await rpc.mainProvider.getBalance(sessionWallet.address);
    if (balWei <= 0n) {
      return res.status(400).json({ error: "No funds in session wallet to withdraw" });
    }

    // Estimate gas for a simple transfer
    let gasLimit = 21000n;
    try {
      gasLimit = await sessionWallet.estimateGas({
        to: address,
        value: balWei
      });
    } catch (e) {
      // Fallback if estimate fails due to balance too low for even the estimation
      gasLimit = 21000n;
    }

    const feeData = await rpc.mainProvider.getFeeData();
    const gasPrice = feeData.gasPrice || ethers.parseUnits("1", "gwei");
    const gasCost = gasPrice * gasLimit;
    const sendAmount = balWei - gasCost;

    if (sendAmount <= 0n) {
      return res.status(400).json({ error: `Balance (${ethers.formatEther(balWei)}) too low to cover gas fees (${ethers.formatEther(gasCost)}).` });
    }

    console.log(`[Cashout] Initiating sweep: ${ethers.formatEther(sendAmount)} USDC from ${sessionWallet.address} to ${address}`);
    
    const tx = await sessionWallet.sendTransaction({
      to: address,
      value: sendAmount,
      gasLimit,
      gasPrice
    });

    // Instantly sync balance in cache
    const session = cache.sessions.get(userAddr);
    if (session) session.balance = 0;

    io.to(userAddr).emit('balance_update', {
      balance: '0',
      reason: 'CASHOUT',
      txHash: tx.hash
    });

    console.log(`[Cashout] Success! TX: ${tx.hash}`);
    res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(sendAmount) });
  } catch (err) {
    console.error('[session/cashout] critical error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── HISTORY ──────────────────────────────────────────────────────────────────

app.get('/history/:address', (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  res.json(cache.userHistory.get(addr) || []);
});

// ─── ROUNDS ACCESS (WAITLIST) ─────────────────────────────────────────────────

app.get('/rounds/access/check/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  res.json({ authorized: !!(profile && profile.accessCode) });
});

app.post('/rounds/access/apply', async (req, res) => {
  const { address, xHandle, discord, email } = req.body;
  if (!address || !xHandle || !email) return res.status(400).json({ error: 'Missing required fields' });
  profiles.upsert(address.toLowerCase(), { xHandle, discord, email, waitlistStatus: 'pending', appliedAt: Date.now() });
  console.log(`[Waitlist] New Application: ${address} (${xHandle})`);
  res.json({ success: true });
});

app.post('/rounds/access/redeem', async (req, res) => {
  const { address, code } = req.body;
  if (!address || !code) return res.status(400).json({ error: 'Missing params' });
  const VALID_CODES = ['ALPHA15', 'NEXUS2026', 'ARC_EARLY'];
  if (VALID_CODES.includes(code.toUpperCase())) {
    profiles.upsert(address.toLowerCase(), { accessCode: code.toUpperCase() });
    return res.json({ success: true });
  }
  res.status(400).json({ error: 'Invalid or expired access code' });
});

// ─── PROFILES ─────────────────────────────────────────────────────────────────

app.get('/profiles/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  const sessionWallet = deriveSessionWallet(addr);
  const stats = profile?.stats || {
    totalTrades: cache.userHistory.get(addr)?.length || 0,
    totalWins: cache.userHistory.get(addr)?.filter(h => h.won).length || 0
  };
  if (!profile) return res.json({ success: true, profile: null, walletAddress: sessionWallet.address });
  res.json({ success: true, profile, stats, walletAddress: sessionWallet.address });
});

app.post('/profiles', (req, res) => {
  const { address, username, xHandle, avatar } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });
  const sessionWallet = deriveSessionWallet(address.toLowerCase());
  const profile = profiles.upsert(address, { username, xHandle, avatar, walletAddress: sessionWallet.address });
  res.json({ success: true, profile, walletAddress: sessionWallet.address });
});

app.patch('/profiles/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.upsert(addr, req.body);
  res.json({ success: true, profile });
});

// ─── MISC ─────────────────────────────────────────────────────────────────────

app.get('/listings', (req, res) => {
  res.json([
    { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'sol', symbol: 'SOL', name: 'Solana' },
  ]);
});

app.get('/campaigns', (req, res) => res.json([]));
app.get('/winner-banner', (req, res) => res.json(null));
app.post('/active-market', (req, res) => res.json({ success: true }));
app.post('/record-fee', (req, res) => res.json({ success: true }));

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: 'nexus_unified_embedded_wallet',
    classicQueueDepth: cache.settlementQueue.length,
    activeSessions: cache.sessions.size,
    timestamp: Date.now(),
  });
});

// --- Start ---
server.listen(config.PORT, '0.0.0.0', () => {
  console.log(`\n🚀 Nexus Core (Embedded Wallet Mode) listening on port ${config.PORT}\n`);
});

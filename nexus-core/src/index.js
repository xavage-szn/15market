// ============================================================
// nexus-core/src/index.js
// Unified Entry Point
// ============================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const cache = require('./cache');
const ClassicEngine = require('./classic');

const { ethers } = require('ethers');
const { RedisMirrorService, SettlementService, setupBatchSweepJob } = require('./services/nexus-auto-signer');
const profiles = require('./profiles');

// --- Setup Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- Blockchain Setup ---
const providers = config.RPCS.map(url => {
  const fetchRequest = new ethers.FetchRequest(url);
  if (url.includes('thirdweb.com') && config.THIRDWEB_SECRET_KEY) {
    fetchRequest.setHeader("x-secret-key", config.THIRDWEB_SECRET_KEY);
  }
  return new ethers.JsonRpcProvider(fetchRequest, config.CHAIN_ID, { staticNetwork: true });
});

// Use FallbackProvider for high availability
const provider = new ethers.FallbackProvider(providers.map((p, i) => ({
  provider: p,
  priority: i,
  weight: 1,
  stallTimeout: 2000
})));

const operatorWallet = new ethers.Wallet(config.PRIVATE_KEY, provider);

// --- Initialize Engines ---
const classicEngine = new ClassicEngine(io);
const settlementService = new SettlementService(operatorWallet, io);
// Redis Mirror now logic handled via engine balance sync
// setupBatchSweepJob(operatorWallet);

settlementService.startSettlementPoller();
classicEngine.start();

// --- Backend Internal Price Sync (from Redis) ---
// This allows the settlement engine to have its own authoritative price source 
// independent of the frontend's streaming feed.
const Redis = require('ioredis');
const priceRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

async function syncBackendPrices() {
  try {
    const keys = ['btc', 'eth', 'sol'];
    for (const k of keys) {
      const val = await priceRedis.get(`price:${k}`);
      if (val) cache.prices[k] = parseFloat(val);
    }
  } catch (e) {
    console.error("[Backend Price Sync] Redis error:", e.message);
  }
}

setInterval(syncBackendPrices, 500);


// --- Socket.IO ---
io.on('connection', (socket) => {
  // Price streaming moved to standalone frontend price service (port 3012)
  socket.on('join_user', (address) => {
    const room = classicEngine.normalizeAddr(address);
    if (room) socket.join(room);
  });
});

// --- API Routes (Classic) ---

app.post('/session/init', async (req, res) => {
  try {
    const identity = classicEngine.resolveSessionIdentity(req.body || {});
    if (!identity.ok) return res.status(400).json({ error: identity.error });
    
    const userAddr = identity.identityKey;
    
    // 1. Deterministic Session Wallet Derivation (EOA Model)
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr);
    const privateKey = ethers.keccak256(entropy);
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;
    
    // 2. Fetch real balance
    const onChainBal = await provider.getBalance(walletAddress);
    
    const session = cache.getOrCreateSession(userAddr, {
      identityKey: userAddr,
      walletAddress: identity.walletAddress,
      sessionAddress: walletAddress || null,
      balance: Number(onChainBal),
    });

    res.json({
      success: true,
      walletAddress: session.walletAddress,
      sessionAddress: session.sessionAddress,
      balance: String(onChainBal),
    });
  } catch (err) {
    res.status(500).json({ error: "Session init failed" });
  }
});

app.get('/session/balance/:address', async (req, res) => {
  try {
    const raw = classicEngine.normalizeAddr(req.params.address);
    let session = cache.sessions.get(raw);
    
    // 1. Deterministic Session Wallet Derivation (EOA Model)
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + raw);
    const privateKey = ethers.keccak256(entropy);
    const wallet = new ethers.Wallet(privateKey);
    const walletAddress = wallet.address;

    // 2. Fetch on-chain balance (USDC/Native)
    const onChainBal = await provider.getBalance(walletAddress);

    // 4. Update session cache (if exists) or create a temporary one
    if (session) {
      session.balance = Number(onChainBal);
      session.sessionAddress = walletAddress;
    } else {
      session = {
        identityKey: raw,
        walletAddress: raw,
        sessionAddress: walletAddress,
        balance: Number(onChainBal)
      };
    }

    res.json({
      success: true,
      balance: String(onChainBal),
      walletAddress: raw,
      sessionAddress: walletAddress,
    });
  } catch (err) {
    console.error("Balance fetch error:", err);
    res.status(500).json({ error: "Failed to fetch on-chain balance" });
  }
});

app.post('/session/execute', async (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });
  
  // tradeParams: { symbol, direction, amount, duration }
  const result = await settlementService.submitTrade(
    address, 
    tradeParams.symbol || 'eth', 
    Number(tradeParams.direction), 
    tradeParams.amount, 
    Number(tradeParams.duration || 5)
  );
  
  if (!result.success) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.get('/history/:address', (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  res.json(cache.userHistory.get(addr) || []);
});

// --- API Routes (Profiles & Identity) ---

app.get('/profiles/:address', async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  
  // Also provide the deterministic smart wallet address
  const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
  const entropy = ethers.toUtf8Bytes(MASTER_SECRET + addr);
  const privateKey = ethers.keccak256(entropy);
  const wallet = new ethers.Wallet(privateKey);
  const walletAddress = wallet.address;

  if (!profile) {
    return res.json({ success: true, profile: null, walletAddress });
  }

  // Add some mock stats for the dashboard if missing
  const stats = profile.stats || {
    totalTrades: cache.userHistory.get(addr)?.length || 0,
    totalWins: cache.userHistory.get(addr)?.filter(h => h.won).length || 0
  };

  res.json({ success: true, profile, stats, walletAddress });
});

app.post('/profiles', async (req, res) => {
  const { address, username, xHandle, avatar } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });

  // 1. Resolve wallet address deterministically
  const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
  const entropy = ethers.toUtf8Bytes(MASTER_SECRET + address.toLowerCase());
  const privateKey = ethers.keccak256(entropy);
  const wallet = new ethers.Wallet(privateKey);
  const walletAddress = wallet.address;

  const profile = profiles.upsert(address, { username, xHandle, avatar, walletAddress });
  res.json({ success: true, profile, walletAddress });
});

app.patch('/profiles/:address', async (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.upsert(addr, req.body);
  res.json({ success: true, profile });
});

// --- API Routes (Global) ---



app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: 'nexus_unified',
    classicQueueDepth: cache.settlementQueue.length,
    timestamp: Date.now(),
  });
});

// --- Start Server ---
server.listen(config.PORT, '0.0.0.0', () => {
  const banner = `
  __  _____                     __        _   
 /_ || ____|                   |  \\      | |  
  | || |__   _ __ ___   __ _ _ |   |     | |_ 
  | ||___ \\ | '_ \` _ \\ / _\` | '__|  _  | __|
  | | ___) || | | | | | (_| | |     | | | |_ 
  |_||____/ |_| |_| |_|\\__,_|_|     | |  \\__|
                                     \\_/      

=======================================================
🚀 Nexus Core Unified Engine listening on port ${config.PORT}
=======================================================
`;
  console.log(banner);
});

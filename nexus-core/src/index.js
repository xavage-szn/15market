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
const rpc = require('./rpc');
const ClassicEngine = require('./classic');
const RoundsEngine = require('./rounds');

const { ethers } = require('ethers');
const { RedisMirrorService, SettlementService, setupBatchSweepJob } = require('./services/nexus-auto-signer');
const profiles = require('./profiles');

// --- Setup Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const provider = rpc.mainProvider;
const operatorWallet = rpc.wallet;

// --- Initialize Engines ---
const classicEngine = new ClassicEngine(io);
const roundsEngine = new RoundsEngine(io);
const settlementService = new SettlementService(operatorWallet, io, config.FACTORY_ADDRESS);

settlementService.startSettlementPoller();
classicEngine.start();
roundsEngine.start();

// --- INTERNAL PRICE FEED (Built-in Price Service) ---
const Redis = require('ioredis');
const priceRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const PYTH_IDS = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
};

const https = require('https');

async function pollPythPrices() {
  const query = Object.values(PYTH_IDS).map(id => `ids[]=${id}`).join('&');
  const url = `https://hermes.pyth.network/v2/updates/price/latest?${query}`;
  
  https.get(url, (res) => {
    let data = '';
    res.on('data', (chunk) => { data += chunk; });
    res.on('end', () => {
      try {
        if (res.statusCode !== 200) return;
        const json = JSON.parse(data);
        if (!json.parsed) return;

        json.parsed.forEach(p => {
          const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
          const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
          const publishTime = p.price.publish_time * 1000;

          for (const [key, pythId] of Object.entries(PYTH_IDS)) {
            if (id === pythId.toLowerCase()) {
              cache.prices[key] = price;
              cache.priceMeta[key] = { updatedAt: publishTime };
              priceRedis.set(`price:${key}`, price.toString());
              priceRedis.set(`price:${key}:ts`, publishTime.toString());
            }
          }
        });
      } catch (e) { }
    });
  }).on('error', (err) => {
    console.error('[Internal-Price-Feed] Error:', err.message);
  });
}

// Poll Pyth every 300ms
setInterval(pollPythPrices, 300);

// Also keep a fast internal sync from cache (redundant but safe for high-frequency settlement)
async function syncBackendPrices() {
  // Logic now handled by pollPythPrices directly updating cache
}


// --- Socket.IO ---
io.on('connection', (socket) => {
  socket.on('join_user', (address) => {
    const room = String(address || '').toLowerCase();
    if (room) socket.join(room);
  });
});

// --- API Routes (Global Settings) ---
app.get('/settings', (req, res) => {
  res.json({
    minBet: config.DEFAULT_MIN_BET || 1.0,
    maxBet: 1000000.0,
    maintenanceMode: false,
    tradingHalted: false,
    systemBanner: "",
    bannerLevel: "info"
  });
});

app.get('/balance/:address', async (req, res) => {
  try {
    const bal = await rpc.getBalance(req.params.address);
    res.json({ success: true, balance: bal });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch balance" });
  }
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
    
    const formattedBal = ethers.formatEther(onChainBal);
    
    const session = cache.getOrCreateSession(userAddr, {
      identityKey: userAddr,
      walletAddress: identity.walletAddress,
      sessionAddress: walletAddress || null,
      balance: parseFloat(formattedBal),
    });

    res.json({
      success: true,
      walletAddress: session.walletAddress,
      sessionAddress: session.sessionAddress,
      balance: formattedBal,
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
    const formattedBal = ethers.formatEther(onChainBal);
    if (session) {
      session.balance = parseFloat(formattedBal);
      session.sessionAddress = walletAddress;
    } else {
      session = {
        identityKey: raw,
        walletAddress: raw,
        sessionAddress: walletAddress,
        balance: parseFloat(formattedBal)
      };
    }

    res.json({
      success: true,
      balance: formattedBal,
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

  // Route all user trades through the low-latency classic engine path.
  const result = await classicEngine.placeTrade(tradeParams, { address });

  if (!result.success) return res.status(400).json({ error: result.error });
  res.json(result);
});

app.post('/session/cashout', async (req, res) => {
  try {
    const { address, amount } = req.body;
    if (!address || !amount) return res.status(400).json({ error: 'Missing params' });

    const addr = classicEngine.normalizeAddr(address);
    
    // Derive the same session wallet
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + addr);
    const privateKey = ethers.keccak256(entropy);
    const wallet = new ethers.Wallet(privateKey, provider);
    
    const amtWei = ethers.parseEther(amount.toString());
    const bal = await provider.getBalance(wallet.address);
    
    if (bal < amtWei) {
      return res.status(400).json({ error: `Insufficient balance. Available: ${ethers.formatEther(bal)}` });
    }

    // Send transaction
    const tx = await wallet.sendTransaction({
      to: address,
      value: amtWei,
    });
    
    // Update local cache balance if session exists
    const session = cache.sessions.get(addr);
    if (session) {
      session.balance = Math.max(0, session.balance - parseFloat(amount));
      io.to(addr).emit('balance_update', {
        balance: String(session.balance),
        reason: 'WITHDRAW',
      });
    }

    res.json({ success: true, txHash: tx.hash });
  } catch (err) {
    console.error("Cashout error:", err);
    res.status(500).json({ error: err.message || "Cashout failed" });
  }
});

app.get('/history/:address', (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  res.json(cache.userHistory.get(addr) || []);
});

// --- API Routes (Rounds) ---
app.get('/rounds/access/check/:address', (req, res) => {
  res.json({ authorized: true });
});

app.post('/rounds/session-enter', async (req, res) => {
  try {
    const { address, roundId, direction, amount } = req.body;
    if (!address || !amount) return res.status(400).json({ error: 'Missing params' });

    const addr = classicEngine.normalizeAddr(address);
    let session = cache.sessions.get(addr);
    
    // Initialize session if missing (same as classic)
    if (!session) {
      const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
      const entropy = ethers.toUtf8Bytes(MASTER_SECRET + addr);
      const privateKey = ethers.keccak256(entropy);
      const wallet = new ethers.Wallet(privateKey);
      const balStr = await rpc.getBalance(wallet.address);
      session = cache.getOrCreateSession(addr, {
        identityKey: addr,
        walletAddress: addr,
        sessionAddress: wallet.address,
        balance: parseFloat(balStr)
      });
    }

    const amtNum = parseFloat(amount);
    if (session.balance < amtNum) {
      return res.status(400).json({ error: 'Insufficient session balance' });
    }

    session.balance = Number((session.balance - amtNum).toFixed(4));
    
    // Simulate entry
    const txHash = `round_sim_${Date.now()}`;
    
    io.to(addr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'ROUND_ENTER',
      amount: amtNum
    });

    res.json({ success: true, txHash });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
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

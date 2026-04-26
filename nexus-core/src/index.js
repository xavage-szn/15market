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
  const ids = Object.values(PYTH_IDS).map(id => id.replace('0x', '')).join(',');
  const url = `https://hermes.pyth.network/v2/updates/price/latest?ids=${ids}`;
  
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
  const result = classicEngine.placeTrade(tradeParams, { address });

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

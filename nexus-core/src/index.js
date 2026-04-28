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
const { RedisMirrorService, SettlementService, setupBatchSweepJob, WALLET_ABI } = require('./services/nexus-auto-signer');
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
const settlementService = new SettlementService(operatorWallet, io, config.FACTORY_ADDRESS, cache);
const mirrorService = new RedisMirrorService(provider, io);

settlementService.startSettlementPoller();
classicEngine.start();
// roundsEngine.start(); // PAUSED: Not working on rounds now

// --- INTERNAL PRICE FEED (Built-in Price Service) ---
const Redis = require('ioredis');
const priceRedis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

const PYTH_IDS = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
};

const https = require('https');

const BINANCE_IDS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };
const MEXC_IDS = { btc: 'BTCUSDT', eth: 'ETHUSDT', sol: 'SOLUSDT' };

async function fetchFromSource(url, parser) {
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
    req.setTimeout(800, () => {
      req.destroy();
      reject(new Error('Timeout'));
    });
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

      // Promise.any: Use the fastest source that returns a valid price
      const price = await Promise.any(sources.map(s => fetchFromSource(s.url, s.parse)));
      const now = Date.now();

      // Update Cache
      cache.prices[key] = price;
      cache.priceMeta[key] = { updatedAt: now };

      // Update History for Stable Settlement (20 min buffer)
      if (!cache.priceHistory[key]) cache.priceHistory[key] = [];
      cache.priceHistory[key].push({ price, time: now });
      if (cache.priceHistory[key].length > 1200) cache.priceHistory[key].shift();

      // Redis & Socket
      const updateData = { key, price, ts: now };
      priceRedis.set(`price:${key}`, price.toString());
      priceRedis.set(`price:${key}:ts`, now.toString());
      priceRedis.publish('price_updates', JSON.stringify(updateData));
      io.emit('price', updateData);

    } catch (e) {
      // If all sources fail, it just skips this tick
    }
  }
}

// Poll every 300ms for high-frequency updates
setInterval(pollPrices, 300);


// --- Socket.IO ---
io.on('connection', (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);
  
  // Push latest price cache immediately
  Object.keys(cache.prices).forEach(key => {
    if (cache.prices[key] > 0) {
      socket.emit('price', { 
        key, 
        price: cache.prices[key], 
        ts: cache.priceMeta[key]?.updatedAt || Date.now() 
      });
    }
  });

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
    const addr = req.params.address.toLowerCase();

    // Always try to resolve the SCW first — this gives us the most accurate balance
    let scwAddress = await priceRedis.get(`scw:${addr}`);
    if (!scwAddress) {
      try {
        scwAddress = await settlementService.factoryContract.playerToWallet(req.params.address);
        if (scwAddress && scwAddress !== ethers.ZeroAddress) {
          await priceRedis.set(`scw:${addr}`, scwAddress);
        }
      } catch (_) {}
    }

    if (scwAddress && scwAddress !== ethers.ZeroAddress) {
      // Read REAL on-chain balance directly from the embedded wallet contract
      const walletContract = new ethers.Contract(scwAddress, WALLET_ABI, provider);
      const balWei = await walletContract.availableBalance();
      const formattedBal = ethers.formatUnits(balWei, 18);
      // Keep Redis in sync as write-through cache
      await priceRedis.set(`balance:${addr}:available`, formattedBal);
      return res.json({ success: true, balance: formattedBal, walletAddress: addr, source: 'scw-onchain' });
    }

    // No wallet deployed yet — return 0
    res.json({ success: true, balance: '0', walletAddress: addr, source: 'no-scw' });
  } catch (err) {
    console.error("Balance fetch error:", err.message);
    // Fallback to Redis cache if on-chain read fails
    const addr = req.params.address.toLowerCase();
    const redisBal = await priceRedis.get(`balance:${addr}:available`);
    if (redisBal !== null) {
      return res.json({ success: true, balance: redisBal, walletAddress: addr, source: 'redis-fallback' });
    }
    res.status(500).json({ error: "Failed to fetch balance" });
  }
});

app.post('/session/execute', async (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });

  // Use the SCW settlement service if available, otherwise fallback to classic simulation
  try {
    const result = await settlementService.submitTrade(
      address, 
      tradeParams.symbol || 'ETH',
      Number(tradeParams.direction),
      String(tradeParams.amount),
      Number(tradeParams.duration || 5)
    );
    
    if (!result.success) {
      // Fallback to classic if SCW doesn't exist or fails
      const classicResult = await classicEngine.placeTrade(tradeParams, { address });
      return res.json(classicResult);
    }
    
    res.json(result);
  } catch (err) {
    const classicResult = await classicEngine.placeTrade(tradeParams, { address });
    res.json(classicResult);
  }
});

app.post('/session/cashout', async (req, res) => {
  const { address } = req.body;
  console.log(`[Cashout] Request for ${address}`);
  if (!address) return res.status(400).json({ error: "Missing address" });

  try {
    const scwAddress = await settlementService.factoryContract.playerToWallet(address);
    console.log(`[Cashout] SCW Address: ${scwAddress}`);

    if (scwAddress && scwAddress !== ethers.ZeroAddress) {
        const walletContract = new ethers.Contract(scwAddress, WALLET_ABI, settlementService.operatorWallet);
        const balWei = await walletContract.availableBalance();
        console.log(`[Cashout] SCW Balance: ${balWei.toString()}`);

        if (balWei === 0n) {
          return res.status(400).json({ error: "No funds in SCW" });
        }

        // --- INSTANT UI REFLECTION ---
        const formatted = ethers.formatUnits(balWei, 18);
        const addr = address.toLowerCase();
        
        await priceRedis.set(`balance:${addr}:available`, "0");
        await priceRedis.set(`balance:${addr}:last_action_ts`, Date.now().toString());
        
        io.to(addr).emit('balance_update', { 
          balance: "0", 
          available: "0", 
          reason: 'WITHDRAW_INITIATED',
          amount: formatted
        });

        const tx = await walletContract.withdraw(balWei, { 
          gasLimit: 250000,
          maxPriorityFeePerGas: ethers.parseUnits("2", "gwei"),
          maxFeePerGas: ethers.parseUnits("10", "gwei")
        });
        
        console.log(`[Cashout] SCW Withdrawal TX: ${tx.hash}`);
        return res.json({ success: true, txHash: tx.hash, type: 'scw-withdraw', amount: formatted });
    }

    // Fallback for EOA (Session Wallet)
    const sessionWallet = rpc.getDerivedWallet(address);
    const balWei = await provider.getBalance(sessionWallet.address);
    console.log(`[Cashout] EOA Balance: ${balWei.toString()}`);
    
    if (balWei === 0n) {
      return res.status(400).json({ error: "No funds in session wallet" });
    }

    const tx = await rpc.transferFunds(sessionWallet, address, balWei);
    console.log(`[Cashout] EOA Cashout TX: ${tx.hash}`);
    res.json({ success: true, txHash: tx.hash, type: 'eoa-cashout' });
  } catch (err) {
    console.error("❌ Cashout Failed:", err);
    res.status(500).json({ 
      success: false,
      error: err.message || "Internal server error during cashout",
      details: err.code || "UNKNOWN_ERROR"
    });
  }
});

// Get the SCW address for a player (used by frontend for direct deposit)
app.get('/session/scw-address/:address', async (req, res) => {
  try {
    const addr = req.params.address.toLowerCase();
    // Cache-first lookup
    let scwAddress = await priceRedis.get(`scw:${addr}`);
    if (!scwAddress) {
      scwAddress = await settlementService.factoryContract.playerToWallet(req.params.address);
      if (scwAddress && scwAddress !== ethers.ZeroAddress) {
        await priceRedis.set(`scw:${addr}`, scwAddress);
      }
    }
    if (!scwAddress || scwAddress === ethers.ZeroAddress) {
      return res.status(404).json({ error: 'No SCW found for this address. Please deposit first.' });
    }
    res.json({ success: true, scwAddress });
  } catch (err) {
    console.error('[SCW Lookup] Failed:', err.message);
    res.status(500).json({ error: 'Failed to resolve SCW address' });
  }
});

// Notify backend of on-chain deposit so Redis balance is updated
app.post('/session/deposit', async (req, res) => {
  const { address, amount, txHash } = req.body;
  if (!address || !amount) return res.status(400).json({ error: 'Missing address or amount' });
  try {
    const addr = address.toLowerCase();
    const amtNum = parseFloat(amount);
    // Credit the balance in Redis (optimistic, tx already broadcasted by frontend)
    const currentBal = await priceRedis.get(`balance:${addr}:available`) || '0';
    const newBal = (parseFloat(currentBal) + amtNum).toFixed(6);
    await priceRedis.set(`balance:${addr}:available`, newBal);
    await priceRedis.set(`balance:${addr}:last_action_ts`, Date.now().toString());
    io.to(addr).emit('balance_update', {
      balance: newBal,
      available: newBal,
      reason: 'DEPOSIT_CREDITED',
      amount: amount
    });
    console.log(`[Deposit] Credited ${amtNum} to ${addr} -> new balance: ${newBal}`);
    res.json({ success: true, newBalance: newBal });
  } catch (err) {
    console.error('[Deposit] Failed:', err.message);
    res.status(500).json({ error: 'Failed to credit deposit' });
  }
});

app.get('/history/:address', (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  res.json(cache.userHistory.get(addr) || []);
});

// --- API Routes (Rounds - WAITLIST ONLY) ---

// Check if user has access (Waitlist state)
app.get('/rounds/access/check/:address', (req, res) => {
  const addr = req.params.address.toLowerCase();
  const profile = profiles.get(addr);
  // For now, if they have an 'accessCode' in their profile, they are authorized
  res.json({ authorized: !!(profile && profile.accessCode) });
});

// Apply for Beta Access (Waitlist Submission)
app.post('/rounds/access/apply', async (req, res) => {
  const { address, xHandle, discord, email } = req.body;
  if (!address || !xHandle || !email) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  // Update profile with waitlist info
  profiles.upsert(address.toLowerCase(), { 
    xHandle, 
    discord, 
    email,
    waitlistStatus: 'pending',
    appliedAt: Date.now()
  });

  console.log(`[Waitlist] New Application: ${address} (${xHandle})`);
  res.json({ success: true });
});

// Redeem Access Code
app.post('/rounds/access/redeem', async (req, res) => {
  const { address, code } = req.body;
  if (!address || !code) return res.status(400).json({ error: 'Missing params' });

  // Simple hardcoded codes for now or check against a list
  const VALID_CODES = ['ALPHA15', 'NEXUS2026', 'ARC_EARLY'];
  
  if (VALID_CODES.includes(code.toUpperCase())) {
    profiles.upsert(address.toLowerCase(), { accessCode: code.toUpperCase() });
    return res.json({ success: true });
  }

  res.status(400).json({ error: 'Invalid or expired access code' });
});

/* PAUSED: Rounds Session logic is disabled
app.post('/rounds/session-enter', async (req, res) => {
  ...
});
*/

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

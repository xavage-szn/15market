const express = require('express');
const axios = require('axios');

const proxy = require('express-http-proxy');
require('dotenv').config();

const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const blockchain = require('./blockchain');
const redis = require('./redis');
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// --- Socket & Metrics Helpers ---

// Price Oracle State
let prices = {
  btc: 0,
  eth: 0,
  sol: 0,
  mon: 0
};
let activeMarketId = 'btc';
let oracleReady = false;

const fetchConcurrentPrices = async () => {
  const assets = [
    { id: 'btc', pair: 'BTCUSDT' },
    { id: 'eth', pair: 'ETHUSDT' },
    { id: 'sol', pair: 'SOLUSDT' }
  ];

  // Strategy: BULK FETCH (One request for all prices)
  const tryBulkBinance = async () => {
    const res = await axios.get('https://api.binance.com/api/v3/ticker/price', { timeout: 8000 });
    const dict = {};
    res.data.forEach(t => dict[t.symbol] = t.price);
    return dict;
  };

  const tryBulkMexc = async () => {
    const res = await axios.get('https://api.mexc.com/api/v3/ticker/price', { timeout: 8000 });
    const dict = {};
    res.data.forEach(t => dict[t.symbol] = t.price);
    return dict;
  };

  try {
    // Try Binance Bulk First
    let bulkData;
    try {
        bulkData = await tryBulkBinance();
    } catch (e) {
        console.warn("[Oracle] Binance Bulk failed, trying MEXC Bulk...");
        bulkData = await tryBulkMexc();
    }

    assets.forEach(asset => {
        if (bulkData[asset.pair]) {
            prices[asset.id] = parseFloat(bulkData[asset.pair]);
        }
    });

    oracleReady = (prices.btc > 0 && prices.eth > 0 && prices.sol > 0);
    if (oracleReady) {
        io.emit('price_update', prices);
    }
  } catch (e) {
    if (e.response && e.response.status === 429) {
        console.warn("[Oracle] ⚠️ Rate limited by Upstream (429). Switching to stealth mode.");
    } else {
        console.error("[Oracle] ❌ Global Oracle Failure:", e.message);
    }
  }
};

// --- ORACLE LIFECYCLE ---
// 1. Initial Sync on Startup
fetchConcurrentPrices();

// 2. Continuous Pulse (Restored to 2s as requested)
let tickerCounter = 0;
setInterval(() => {
    fetchConcurrentPrices();
    // Low-frequency ticker log (every 10 pulses / 20s) to keep logs clean but useful
    tickerCounter++;
    if (tickerCounter >= 10 && oracleReady) {
        console.log(`[Oracle] ✅ TICKER: BTC:$${prices.btc} | ETH:$${prices.eth} | SOL:$${prices.sol}`);
        tickerCounter = 0;
    }
}, 2000);

// 3. Instant Sync on Connection (Meeting the "when its needed" requirement)
io.on('connection', (socket) => {
    console.log('[Socket] Client Connected, triggering priority sync');
    fetchConcurrentPrices(); 
    
    socket.on('join', (room) => {
        socket.join(room.toLowerCase());
        console.log(`[Socket] User joined room: ${room}`);
    });
});

const emitAdminStats = async () => {
  try {
    const totalVolume = await redis.get('stats:total_volume') || '0';
    const totalTrades = await redis.get('stats:total_trades') || '0';
    const treasuryBalance = await blockchain.getBalance(blockchain.arcWallet.address);
    const activeUsersCount = await redis.scard('stats:active_users_set') || 0;

    io.emit('admin_metrics_update', {
      totalVolume,
      totalTrades,
      treasuryBalance,
      activeUsers: activeUsersCount,
      timestamp: Date.now()
    });
  } catch (e) {
    console.error("[Metrics] Pulse failed:", e.message);
  }
};

// --- Real-time Event Hub ---
io.on('connection', (socket) => {
  console.log(`[Socket] New connection: ${socket.id}`);

  // Admin Auth
  socket.on('auth_admin', (token) => {
    if (token === process.env.ADMIN_TOKEN) {
      socket.join('admin_room');
      console.log(`[Socket] Socket ${socket.id} authorized as ADMIN`);
      socket.emit('auth_success');
    }
  });

  // User Room Joining (for personal balance/trade updates)
  socket.on('join_user', (address) => {
    if (address) {
      const room = address.toLowerCase();
      socket.join(room);
      console.log(`[Socket] User ${address} joined their private room: ${room}`);
    }
  });

  socket.on('disconnect', () => {
    console.log(`[Socket] Connection closed: ${socket.id}`);
  });
});

// Periodic Metrics Pulse (5s)
setInterval(emitAdminStats, 5000);

const trackActivity = async (addr) => {
  if (!addr) return;
  const key = 'stats:active_users_set';
  await redis.sadd(key, addr.toLowerCase());
  // Expire the entire set occasionally or use individual TTLs? 
  // For simplicity, we just keep them for the current session.
};

// --- User Profile / Onboarding ---

app.get('/profiles/:address', async (req, res) => {
  const { address } = req.params;
  const addr = address.toLowerCase();

  try {
    if (!redis) return res.status(503).json({ error: "Database offline" });

    const userData = await redis.get(`user:${addr}`);
    if (userData) {
      res.json({ ...JSON.parse(userData), onboarded: true });
    } else {
      res.status(404).json({ error: "User not found" });
    }
  } catch (err) {
    console.error("Profile fetch error:", err);
    res.status(500).json({ error: "Server error fetching profile" });
  }
});

app.post('/profiles', async (req, res) => {
  const { address, username, xHandle, avatar } = req.body;
  if (!address || !username) {
    return res.status(400).json({ error: "Address and username are required" });
  }

  const addr = address.toLowerCase();
  const profile = { address: addr, username, xUsername: xHandle || '', onboarded: 1 };

  try {
    if (!redis) throw new Error("Redis connection required");

    const existing = await redis.get(`user:${addr}`);
    if (existing) {
        return res.json({ success: true, profile: JSON.parse(existing), message: "User already exists" });
    }

    // Save Profile to Redis
    await redis.set(`user:${addr}`, JSON.stringify(profile));
    
    // Initialize session balance from on-chain if not exists or if it's the legacy mock '100.0'
    const balanceKey = `balance:${addr}`;
    let balance = await redis.get(balanceKey);
    const bNum = parseFloat(balance || '0');
    if (!balance || bNum === 100.0) {
      const onChainBalance = await blockchain.getBalance(addr);
      balance = onChainBalance || '0.0';
      await redis.set(balanceKey, balance);
      console.log(`[Onboarding] Flushed legacy mock/null balance for ${addr}. Synced with REAL on-chain: ${balance}`);
    }

    // Log activity
    await redis.lpush(`activity:${addr}`, JSON.stringify({
      type: 'ONBOARDING',
      timestamp: Date.now()
    }));

    const profileData = { ...profile, theme: avatar || 'default' };
    io.emit('user_onboarded', profileData);
    trackActivity(addr);

    res.json({ success: true, profile });
  } catch (error) {
    console.error("Onboarding error:", error);
    res.status(500).json({ error: "Failed to onboard user" });
  }
});

// --- Balances ---

app.get('/balance/:address', async (req, res) => {
  const { address } = req.params;
  const balance = await blockchain.getBalance(address);
  res.json({ balance });
});

app.get('/session/balance/:address', async (req, res) => {
  const { address } = req.params;
  const addr = address.toLowerCase();

  try {
    if (!redis) return res.json({ balance: '0.0' });
    const balanceKey = `balance:${addr}`;
    let balance = await redis.get(balanceKey);
    
    // Auto-flush mock legacy balances or missing balances for returning users
    const bNum = parseFloat(balance || '0');
    if (!balance || bNum === 100.0) {
      const onChainBalance = await blockchain.getBalance(addr);
      balance = onChainBalance || '0.0';
      await redis.set(balanceKey, balance);
      console.log(`[Balance] Synced missing/mock balance for ${addr} via GET request.`);
    }

    res.json({ balance: balance || '0.0' });
  } catch (e) {
    res.json({ balance: '0.0' });
  }
});

// --- Rounds & Access Proxy (Forward to Rounds-Backend on port 3011) ---

app.use('/rounds', (req, res) => {
  res.status(503).json({ 
    success: false, 
    error: "Rounds service is currently paused. Please use the waitlist to request access." 
  });
});

// --- Session Management ---

app.post('/session/init', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Address required" });
  
  const addr = address.toLowerCase();
  try {
    const balanceKey = `balance:${addr}`;
    let balance = await redis.get(balanceKey);
    
    // If no balance exists, or it's the legacy mock '100.0', sync from on-chain IMMEDIATELY
    const bNum = parseFloat(balance || '0');
    if (!balance || bNum === 100.0) {
      const onChainBalance = await blockchain.getBalance(addr);
      balance = onChainBalance || '0.0';
      await redis.set(balanceKey, balance);
      console.log(`[Session] Flushed legacy mock/null balance for ${addr}. Synced with REAL on-chain (Numeric Match): ${balance}`);
    }
    
    res.json({ 
      success: true, 
      sessionAddress: blockchain.arcWallet.address, 
      balance 
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Trades ---

app.post('/session/trade', async (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: "Missing params" });

  const userAddr = address.toLowerCase();
  const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;

  try {
    // 1. Check & Deduct Balance
    const currentBalStr = await redis.get(`balance:${userAddr}`);
    const currentBal = parseFloat(currentBalStr || '0.0');
    const stake = parseFloat(amount);
    
    if (currentBal < stake) {
      return res.status(400).json({ error: "Insufficient session balance" });
    }

    // 2. Map Bet to User & Store Details in Redis (CRITICAL for authoritative locking)
    const tradeData = {
      id,
      userAddr,
      direction,
      amount,
      entryPrice,
      duration,
      marketId,
      timestamp: Date.now(),
      status: 'PENDING'
    };
    await redis.set(`bet_owner:${id}`, userAddr, 'EX', 86400); 
    await redis.set(`trade:${id}`, JSON.stringify(tradeData), 'EX', 86400);

    // 3. Execute On-Chain Bet
    const receipt = await blockchain.placeBet(id, direction, duration, entryPrice, marketId, amount);
    
    // 4. Update Balance in Redis
    const newBal = currentBal - stake;
    await redis.set(`balance:${userAddr}`, newBal.toFixed(4));

    // 5. Update Global Stats
    await redis.incrbyfloat('stats:total_volume', stake);
    await redis.incr('stats:total_trades');

    // 6. Log Activity & Emit Socket
    const activityRecord = {
      type: 'TRADE_PLACED',
      id,
      amount,
      direction,
      symbol: marketId === 1 ? 'BTC' : (marketId === 0 ? 'ETH' : 'USDC'),
      timestamp: Date.now(),
      txHash: receipt.hash,
      userAddr
    };

    await redis.lpush(`activity:${userAddr}`, JSON.stringify(activityRecord));
    
    // Admin Instant Indexing
    io.emit('new_trade', activityRecord);
    trackActivity(userAddr);

    console.log(`[API] Trade placement SUCCESS for ${id}. TX: ${receipt.hash}`);
    
    // Notify client if they are in the room
    const betOwner = await redis.get(`bet_owner:${id}`);
    if (betOwner) {
      io.to(betOwner.toLowerCase()).emit('trade_placed', { id, txHash: receipt.hash });
    }

    res.json({ success: true, txHash: receipt.hash });
  } catch (error) {
    console.error(`[API] Trade execution failed for ${id}:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

app.get('/history/:address', async (req, res) => {
  const { address } = req.params;
  const addr = address.toLowerCase();
  
  try {
    const activities = await redis.lrange(`activity:${addr}`, 0, 50);
    const history = activities.map(a => JSON.parse(a));
    res.json(history);
  } catch (e) {
    res.json([]);
  }
});

app.post('/settle', async (req, res) => {
  const { id, exitPrice, won, status } = req.body;
  try {
    // 1. LOCK THE RESULT (Source of Truth)
    const tradeStr = await redis.get(`trade:${id}`);
    if (!tradeStr) return res.status(404).json({ error: "Trade not found for settlement" });
    const trade = JSON.parse(tradeStr);

    // Calculate outcome authoritatively if not provided or to verify
    const entryPriceNum = parseFloat(trade.entryPrice);
    const exitPriceNum = parseFloat(exitPrice);
    const direction = Number(trade.direction); // 1 = UP, 0 = DOWN
    
    let isWon = won;
    if (isWon === undefined) {
      if (direction === 1) isWon = exitPriceNum > entryPriceNum;
      else isWon = exitPriceNum < entryPriceNum;
    }

    const lockedResult = {
      exitPrice,
      won: isWon,
      status: isWon ? "WON" : "LOST",
      lockedAt: Date.now()
    };
    await redis.set(`locked_result:${id}`, JSON.stringify(lockedResult), 'EX', 86400);

    // 2. Execute on-chain settlement
    const receipt = await blockchain.settleBet(id, exitPrice);
    
    // 3. Update Session Balance based on the LOCKED result (Authoritative)
    const betOwner = await redis.get(`bet_owner:${id}`);
    if (betOwner) {
      const userAddr = betOwner.toLowerCase();
      
      let payout = 0;
      const durationSec = Number(trade.duration);
      const multiplier = durationSec <= 5 ? 2.90 : (durationSec <= 10 ? 2.40 : 1.90);
      if (lockedResult.won) payout = parseFloat(trade.amount) * multiplier;

      const activityData = {
        type: 'TRADE_SETTLED',
        betId: id,
        won: lockedResult.won,
        payout: payout.toFixed(4),
        exitPrice,
        timestamp: Date.now(),
        userAddr
      };

      if (payout > 0) {
        const currentBalanceStr = await redis.get(`balance:${userAddr}`);
        const currentBalance = parseFloat(currentBalanceStr || '0.0');
        const newBalance = currentBalance + payout;
        await redis.set(`balance:${userAddr}`, newBalance.toFixed(4));
        console.log(`[API] Locked Win: Credited ${payout.toFixed(4)} to ${userAddr}.`);
        
        // INSTANT PUSH: Meeting the <5s requirement
        io.to(userAddr).emit('balance_update', { balance: newBalance.toFixed(4), reason: 'WIN', betId: id, payout: payout.toFixed(4) });
      } else {
        io.to(userAddr).emit('balance_update', { reason: 'LOSS', betId: id });
      }

      await redis.lpush(`activity:${userAddr}`, JSON.stringify(activityData));
      
      // Admin Instant Settlement Update
      io.emit('trade_settled', activityData);
      trackActivity(userAddr);
    }
    
    res.json({ 
      success: true, 
      won: lockedResult.won, 
      txHash: receipt.hash 
    });
  } catch (error) {
    console.error(`[API] Settlement failed for bet ${id}:`, error.message);
    res.status(500).json({ 
      error: "Settlement processing failed", 
      message: error.message 
    });
  }
});

// --- Platform Stats & Admin ---

app.get('/settings', (req, res) => {
  res.json({
    minBet: 0.1,
    maxBet: 10000,
    maintenanceMode: false,
    tradingHalted: false,
    systemBanner: "",
    bannerLevel: "info"
  });
});

app.post('/settings', async (req, res) => {
  const settings = req.body;
  // In a real app, verify ADMIN_TOKEN here
  io.emit('settings_updated', settings);
  res.json({ success: true, settings });
});

app.post('/broadcast', async (req, res) => {
  const { text, duration, level } = req.body;
  io.emit('broadcast_received', { text, duration, level });
  res.json({ success: true });
});

app.post('/push-tx', async (req, res) => {
  const { address, transaction } = req.body;
  if (!address || !transaction) return res.status(400).json({ error: "Missing data" });

  const addr = address.toLowerCase();
  try {
    if (transaction.type === 'DEPOSIT') {
      const amount = parseFloat(transaction.amount);
      const currentBal = parseFloat(await redis.get(`balance:${addr}`) || '0.0');
      const newBal = currentBal + amount;
      await redis.set(`balance:${addr}`, newBal.toFixed(4));
      
      await redis.lpush(`activity:${addr}`, JSON.stringify({
        ...transaction,
        timestamp: Date.now()
      }));
      
      console.log(`[Deposit] Credited ${amount} to ${addr}. New Balance: ${newBal}`);
      res.json({ success: true, balance: newBal.toFixed(4) });
    } else {
      res.json({ success: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/session/withdraw', async (req, res) => {
  const { address, amount } = req.body;
  if (!address || !amount) return res.status(400).json({ error: "Missing data" });

  const addr = address.toLowerCase();
  try {
    const currentBal = parseFloat(await redis.get(`balance:${addr}`) || '0.0');
    const withdrawAmt = parseFloat(amount);

    if (currentBal < withdrawAmt) {
      return res.status(400).json({ error: "Insufficient session balance" });
    }

    // 1. Deduct from Redis
    const newBal = currentBal - withdrawAmt;
    await redis.set(`balance:${addr}`, newBal.toFixed(4));

    // 2. Perform on-chain transfer
    const receipt = await blockchain.transfer(addr, withdrawAmt);

    // 3. Log Activity
    const activity = {
      type: 'WITHDRAW',
      amount: withdrawAmt.toFixed(4),
      timestamp: Date.now(),
      txHash: receipt.hash,
      userAddr: addr
    };
    await redis.lpush(`activity:${addr}`, JSON.stringify(activity));

    console.log(`[Withdraw] User ${addr} withdrew ${withdrawAmt}. TX: ${receipt.hash}`);
    res.json({ success: true, txHash: receipt.hash, balance: newBal.toFixed(4) });
  } catch (e) {
    console.error("[Withdraw] Error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

app.patch('/profiles/:address', async (req, res) => {
  const { address } = req.params;
  const updates = req.body;
  const addr = address.toLowerCase();

  try {
    const userData = await redis.get(`user:${addr}`);
    if (!userData) return res.status(404).json({ error: "User not found" });

    const currentProfile = JSON.parse(userData);
    const updatedProfile = { ...currentProfile, ...updates };
    
    await redis.set(`user:${addr}`, JSON.stringify(updatedProfile));
    res.json({ success: true, profile: updatedProfile });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/protocol-stats', async (req, res) => {
  const totalVolume = await redis.get('stats:total_volume') || '0';
  const totalTrades = await redis.get('stats:total_trades') || '0';
  const activeUsers = await redis.scard('stats:active_users_set') || 0;
  
  res.json({
    totalVolume,
    totalTrades,
    activeUsers,
    treasuryBalance: await blockchain.getBalance(blockchain.arcWallet.address)
  });
});

app.get('/listings', (req, res) => {
  res.json([
    { id: 'btc', symbol: 'BTC', binance: 'BTCUSDT' },
    { id: 'eth', symbol: 'ETH', binance: 'ETHUSDT' },
    { id: 'sol', symbol: 'SOL', binance: 'SOLUSDT' },
    { id: 'mon', symbol: 'MON', binance: 'MONUSDT' }
  ]);
});

app.get('/prices', (req, res) => {
  if (!oracleReady) return res.status(503).json({ error: "Price oracle is not ready", status: 'WAITING' });
  res.json(prices);
});

app.get('/active-market', (req, res) => res.json({ activeId: activeMarketId }));

app.post('/active-market', (req, res) => {
  const { activeId } = req.body;
  if (activeId) {
    activeMarketId = activeId;
    console.log(`[Market] Switched active market to: ${activeId}`);
    io.emit('market_changed', { activeId });
    res.json({ success: true, activeId });
  } else {
    res.status(400).json({ error: "activeId required" });
  }
});
app.get('/campaigns', (req, res) => res.json([]));
app.get('/winner-banner', (req, res) => res.json(null));
app.get('/time', (req, res) => res.json({ time: Date.now() }));
app.get('/health', (req, res) => res.json({ 
  status: 'OK', 
  oracle: oracleReady ? 'READY' : 'NOT_READY',
  timestamp: Date.now(), 
  version: '1.2.6' 
}));

// --- Global Error Boundary ---
app.use((err, req, res, next) => {
  console.error(`[GlobalError] ${req.method} ${req.url}:`, err);
  res.status(500).json({ 
    error: "Internal Server Error", 
    message: process.env.NODE_ENV === 'development' ? err.message : "Something went wrong" 
  });
});

const PORT = process.env.PORT || 3010; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simplified 15market Backend running on port ${PORT}`);
});

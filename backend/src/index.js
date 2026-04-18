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
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// --- Socket & Metrics Helpers ---

// Price Oracle State — used internally for settlement, not broadcast to clients
let prices = {
  btc: 0,
  eth: 0,
  sol: 0
};
let activeMarketId = 'btc';
let oracleReady = false;

// Feed settlement prices from Binance WebSocket (backend-only, no socket emission)
pricing.onPriceUpdate = (newPrices) => {
    prices = { ...newPrices };
    oracleReady = true;
};


// Instant Sync on Connection
io.on('connection', (socket) => {
  console.log('[Socket] Client Connected, triggering priority sync');
  socket.emit('price_update', prices);

  socket.on('join', (room) => {
    if (room) {
        socket.join(room.toLowerCase());
        console.log(`[Socket] User joined room: ${room}`);
    }
  });

  // Admin Auth
  socket.on('auth_admin', (token) => {
    if (token === process.env.ADMIN_TOKEN) {
      socket.join('admin_room');
      console.log(`[Socket] Socket ${socket.id} authorized as ADMIN`);
      socket.emit('auth_success');
    }
  });

  // User Room Joining
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

// Periodic Metrics Pulse (5s)
setInterval(emitAdminStats, 5000);

const trackActivity = async (addr) => {
  if (!addr) return;
  const key = 'stats:active_users_set';
  await redis.sadd(key, addr.toLowerCase());
};

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
    const sessionAddr = await redis.get(`addr:${addr}`);
    if (!sessionAddr) {
      return res.json({ balance: '0.0' });
    }

    const balance = await blockchain.getBalance(sessionAddr);

    res.json({
      success: true,
      balance: balance || '0.0',
      sessionAddress: sessionAddr
    });
  } catch (e) {
    res.json({ balance: '0.0' });
  }
});

// --- Rounds Proxy ---

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
    let pk = await redis.get(`pk:${addr}`);
    let sessionAddr = await redis.get(`addr:${addr}`);

    if (!pk) {
      const w = ethers.Wallet.createRandom();
      pk = w.privateKey;
      sessionAddr = w.address;
      await redis.set(`pk:${addr}`, pk);
      await redis.set(`addr:${addr}`, sessionAddr);
      console.log(`[Session] Created True Embedded Account for ${addr}: ${sessionAddr}`);
    }

    const balance = await blockchain.getBalance(sessionAddr);
    res.json({
      success: true,
      sessionAddress: sessionAddr,
      balance: balance || '0.0'
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// --- Trades ---

app.post('/session/execute', async (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: "Missing params" });

  const addr = address.toLowerCase();
  const pk = await redis.get(`pk:${addr}`);
  if (!pk) return res.status(400).json({ error: "Session wallet not found" });

  const { id, direction, duration, entryPrice, marketId, amount } = tradeParams;

  try {
    const walletAddress = await redis.get(`addr:${addr}`);
    const currentOnChainBal = await blockchain.getBalance(walletAddress);
    const currentBal = parseFloat(currentOnChainBal || '0.0');
    const stake = parseFloat(amount);

    if (currentBal < stake + 0.0005) {
      return res.status(400).json({ error: "Insufficient session balance" });
    }

    const tradeData = {
      id,
      userAddr: addr,
      direction,
      amount,
      entryPrice,
      duration,
      marketId,
      timestamp: Date.now(),
      status: 'PENDING'
    };
    await redis.set(`bet_owner:${id}`, addr, 'EX', 86400);
    await redis.set(`trade:${id}`, JSON.stringify(tradeData), 'EX', 86400);

    const receipt = await blockchain.placeBetForUser(pk, id, direction, duration, entryPrice, marketId, amount);

    await redis.incrbyfloat('stats:total_volume', stake);
    await redis.incr('stats:total_trades');

    const activityRecord = {
      type: 'TRADE_PLACED',
      id,
      amount,
      direction,
      symbol: marketId === 1 ? 'BTC' : (marketId === 0 ? 'ETH' : (marketId === 2 ? 'SOL' : 'USDC')),
      timestamp: Date.now(),
      txHash: receipt.hash,
      userAddr: addr
    };

    await redis.lpush(`activity:${addr}`, JSON.stringify(activityRecord));
    io.emit('new_trade', activityRecord);
    trackActivity(addr);

    console.log(`[API] Trade placement SUCCESS for ${id}. TX: ${receipt.hash}`);

    io.to(addr).emit('trade_placed', { id, txHash: receipt.hash });

    // --- AUTOMATED SETTLEMENT TIMER ---
    const durationMs = parseInt(duration) * 1000;
    setTimeout(async () => {
        try {
            console.log(`[Settlement] Timer expired for trade #${id}. Settling...`);
            const assetMap = ['eth', 'btc', 'sol'];
            const symbol = assetMap[marketId] || 'eth';
            const exitPrice = pricing.getPrice(symbol);

            if (!exitPrice || exitPrice <= 0) {
                console.error(`[Settlement] Price missing for ${symbol} at expiry of #${id}`);
                return;
            }

            // Calculate win/loss
            let entryPriceNum = parseFloat(entryPrice);
            if (marketId === 2) entryPriceNum = entryPriceNum / 1000000; // SOL scaling if applicable
            else entryPriceNum = entryPriceNum / 100;

            const isUp = parseInt(direction) === 1;
            const won = isUp ? exitPrice > entryPriceNum : exitPrice < entryPriceNum;

            // Execute on-chain
            let scaledExitPrice = exitPrice;
            if (marketId === 2) scaledExitPrice = Math.floor(exitPrice * 1000000);
            else scaledExitPrice = Math.floor(exitPrice * 100);

            await blockchain.settleBet(id, scaledExitPrice);

            const multiplier = parseInt(duration) <= 5 ? 2.90 : (parseInt(duration) <= 10 ? 2.40 : 1.90);
            const payout = won ? (stake * multiplier).toFixed(4) : "0.00";

            const activityData = {
                type: 'TRADE_SETTLED',
                betId: id,
                won,
                payout,
                exitPrice,
                timestamp: Date.now(),
                userAddr: addr
            };

            await redis.lpush(`activity:${addr}`, JSON.stringify(activityData));
            io.emit('trade_settled', activityData);

            io.to(addr).emit('balance_update', {
                balance: await blockchain.getBalance(addr), // approximate main if needed, but session is better
                reason: won ? 'WIN' : 'LOSS',
                betId: id,
                payout
            });

            console.log(`[Settlement] Auto-settled trade #${id}: ${won ? 'WON' : 'LOST'} @ $${exitPrice}`);
        } catch (e) {
            console.error(`[Settlement] Auto-settlement failed for trade #${id}:`, e.message);
        }
    }, durationMs + 1000); // 1s buffer for chain propagation

    res.json({ success: true, txHash: receipt.hash });
  } catch (error) {
    console.error(`[API] Trade execution failed:`, error.message);
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

// /settle is now redundant but kept for back-compat or manual trigger if needed
app.post('/settle', async (req, res) => {
    res.json({ success: true, message: "Settlement handled by backend automation" });
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
  io.emit('settings_updated', settings);
  res.json({ success: true, settings });
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
      await redis.lpush(`activity:${addr}`, JSON.stringify({
        ...transaction,
        timestamp: Date.now()
      }));
      res.json({ success: true });
    } else {
      res.json({ success: true });
    }
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/session/cashout', async (req, res) => {
  const { address, amount } = req.body;
  if (!address || amount === undefined) return res.status(400).json({ error: "Missing data" });

  const addr = address.toLowerCase();
  try {
    const pk = await redis.get(`pk:${addr}`);
    const sessionAddr = await redis.get(`addr:${addr}`);
    if (!pk || !sessionAddr) {
      return res.status(404).json({ error: "Session wallet not found" });
    }

    const currentOnChainBal = await blockchain.getBalance(sessionAddr);
    const currentBal = parseFloat(currentOnChainBal || '0.0');
    const withdrawAmt = parseFloat(amount);

    if (isNaN(withdrawAmt) || withdrawAmt <= 0) {
      return res.status(400).json({ error: "Invalid withdrawal amount" });
    }

    if (currentBal < withdrawAmt) {
      return res.status(400).json({ error: "Insufficient session balance" });
    }

    const receipt = await blockchain.withdrawBurner(pk, addr, withdrawAmt);

    const activity = {
      type: 'WITHDRAW',
      amount: withdrawAmt.toFixed(4),
      timestamp: Date.now(),
      txHash: receipt.hash,
      userAddr: addr
    };
    await redis.lpush(`activity:${addr}`, JSON.stringify(activity));

    res.json({ success: true, txHash: receipt.hash });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/profiles/:address', async (req, res) => {
  const { address } = req.params;
  const addr = address.toLowerCase();
  try {
    const data = await redis.get(`user:${addr}`);
    if (!data) return res.status(404).json({ error: "Profile not found" });
    res.json(JSON.parse(data));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/profiles', async (req, res) => {
  const { address, username, xHandle, avatar } = req.body;
  const addr = address.toLowerCase();
  try {
    const profile = { address: addr, username, xHandle, avatar, createdAt: Date.now() };
    await redis.set(`user:${addr}`, JSON.stringify(profile));
    res.json(profile);
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
    { id: 'btc', symbol: 'BTC', name: 'Bitcoin' },
    { id: 'eth', symbol: 'ETH', name: 'Ethereum' },
    { id: 'sol', symbol: 'SOL', name: 'Solana' }
  ]);
});

app.get('/prices', (req, res) => {
  if (!oracleReady) return res.status(503).json({ error: "Price oracle is not ready" });
  res.json(prices);
});

app.get('/active-market', (req, res) => res.json({ activeId: activeMarketId }));

app.post('/active-market', (req, res) => {
  const { activeId } = req.body;
  if (activeId) {
    activeMarketId = activeId;
    io.emit('market_changed', { activeId });
    res.json({ success: true, activeId });
  } else {
    res.status(400).json({ error: "activeId required" });
  }
});

app.get('/time', (req, res) => res.json({ time: Date.now() }));
app.get('/health', (req, res) => res.json({
  status: 'OK',
  oracle: oracleReady ? 'READY' : 'NOT_READY',
  timestamp: Date.now()
}));

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3010;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Backend running on port ${PORT}`);
});

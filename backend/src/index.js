const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const blockchain = require('./blockchain');
const redis = require('./redis');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

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

    // Save Profile to Redis
    await redis.set(`user:${addr}`, JSON.stringify(profile));
    
    // Initialize session balance if not exists
    const existingBalance = await redis.get(`balance:${addr}`);
    if (!existingBalance) {
      await redis.set(`balance:${addr}`, '100.0');
    }

    // Log activity
    await redis.lpush(`activity:${addr}`, JSON.stringify({
      type: 'ONBOARDING',
      timestamp: Date.now()
    }));

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
    if (!redis) return res.json({ balance: '100.0' });
    const balance = await redis.get(`balance:${addr}`);
    res.json({ balance: balance || '100.0' });
  } catch (e) {
    res.json({ balance: '100.0' });
  }
});

// --- Rounds & Access Checks ---

app.get('/rounds/access/check/:address', (req, res) => {
  res.json({ authorized: true });
});

app.get('/rounds/status', (req, res) => {
  res.json({
    live: null,
    next: { id: Date.now(), pools: { long: 0, short: 0, participants: 0 } }
  });
});

app.post('/rounds/session-enter', async (req, res) => {
  // Rounds P2P Entry
  const { address, roundId, direction, amount } = req.body;
  console.log(`[Rounds] User ${address} entering round ${roundId}`);
  res.json({ success: true, txHash: "0x" + "0".repeat(64) }); 
});

// --- Session Management ---

app.post('/session/init', async (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: "Address required" });
  
  const addr = address.toLowerCase();
  try {
    const balance = await redis.get(`balance:${addr}`) || '100.0';
    if (!(await redis.get(`balance:${addr}`))) {
      await redis.set(`balance:${addr}`, '100.0');
    }
    
    res.json({ 
      success: true, 
      sessionAddress: addr, // In simplified mode, session = main or deterministic
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
    const currentBal = parseFloat(await redis.get(`balance:${userAddr}`) || '100.0');
    const stake = parseFloat(amount);
    
    if (currentBal < stake) {
      return res.status(400).json({ error: "Insufficient session balance" });
    }

    // 2. Map Bet to User in Redis (CRITICAL for settlement)
    await redis.set(`bet_owner:${id}`, userAddr, 'EX', 86400); // 24h expiry

    // 3. Execute On-Chain Bet
    const receipt = await blockchain.placeBet(id, direction, duration, entryPrice, marketId, amount);
    
    // 4. Update Balance in Redis
    const newBal = currentBal - stake;
    await redis.set(`balance:${userAddr}`, newBal.toFixed(4));

    // 5. Log Activity
    await redis.lpush(`activity:${userAddr}`, JSON.stringify({
      type: 'TRADE_PLACED',
      id,
      amount,
      direction,
      timestamp: Date.now(),
      txHash: receipt.hash
    }));

    res.json({ success: true, txHash: receipt.hash });
  } catch (error) {
    console.error("[API] Trade execution failed:", error);
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
  const { id, exitPrice } = req.body;
  console.log(`[API] Settling trade ${id} at ${exitPrice}...`);
  
  try {
    // 1. Execute on-chain settlement (Parallel Arc/Thirdweb)
    const receipt = await blockchain.settleBet(id, exitPrice);
    
    // 2. Parse the result from the transaction receipt
    const event = blockchain.parseSettlementEvent(receipt);
    
    if (event) {
      console.log(`[API] Bet ${id} settled. Won: ${event.won}, Payout: ${event.payout} ARC`);
      
      // 3. If won, update the user's session balance
      if (event.won && parseFloat(event.payout) > 0) {
        // Find who owns this bet ID
        const betOwner = await redis.get(`bet_owner:${id}`) || event.user.toLowerCase();
        const userAddr = betOwner;
        
        // Use Redis for balance calculation
        const currentBalanceStr = await redis.get(`balance:${userAddr}`);
        const currentBalance = parseFloat(currentBalanceStr || '100.0');
        const newBalance = currentBalance + parseFloat(event.payout);
        
        // Persist to Redis
        await redis.set(`balance:${userAddr}`, newBalance.toFixed(4));

        // Log Activity to Redis
        await redis.lpush(`activity:${userAddr}`, JSON.stringify({
          type: 'TRADE_SETTLED',
          betId: id,
          won: event.won,
          payout: event.payout,
          timestamp: Date.now()
        }));
          
        console.log(`[API] Credited ${event.payout} to session wallet (Redis) for ${userAddr}. New Balance: ${newBalance.toFixed(4)}`);
      }
      
      res.json({ 
        success: true, 
        won: event.won, 
        payout: event.payout,
        txHash: receipt.hash 
      });
    } else {
      console.warn(`[API] Settlement transaction succeeded but BetSettled event not found in receipt for ${id}`);
      res.json({ success: true, txHash: receipt.hash });
    }
  } catch (error) {
    console.error(`[API] Settlement failed for bet ${id}:`, error.message);
    res.status(500).json({ 
      error: "Settlement processing failed", 
      details: error.message 
    });
  }
});

// --- Platform Stats & Misc ---

app.get('/settings', (req, res) => {
  res.json({
    minBet: 0.1,
    maxBet: 10000,
    maintenanceMode: false,
    tradingHalted: false
  });
});

app.get('/listings', (req, res) => {
  res.json([
    { id: 'btc', symbol: 'BTC', binance: 'BTCUSDT' },
    { id: 'eth', symbol: 'ETH', binance: 'ETHUSDT' },
    { id: 'sol', symbol: 'SOL', binance: 'SOLUSDT' }
  ]);
});

app.get('/active-market', (req, res) => res.json({ activeId: 'btc' }));
app.get('/campaigns', (req, res) => res.json([]));
app.get('/winner-banner', (req, res) => res.json(null));
app.get('/time', (req, res) => res.json({ time: Date.now() }));
app.get('/health', (req, res) => res.send('OK'));

const PORT = process.env.PORT || 3010; 
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simplified 15market Backend running on port ${PORT}`);
});

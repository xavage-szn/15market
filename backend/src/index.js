const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');
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
    // 1. Try Redis first (Primary/Fast Cache)
    if (redis) {
      const cachedUser = await redis.get(`user:${addr}`);
      if (cachedUser) {
        console.log(`[Profile] Cache hit for ${addr}`);
        return res.json({ ...JSON.parse(cachedUser), onboarded: true });
      }
    }

    // 2. Fallback to SQLite
    const user = db.prepare('SELECT * FROM users WHERE address = ?').get(addr);
    if (user) {
      console.log(`[Profile] Disk hit for ${addr}, caching...`);
      if (redis) {
        await redis.set(`user:${addr}`, JSON.stringify(user));
      }
      res.json({ ...user, onboarded: true });
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
    // 1. Save to SQLite
    db.prepare(`
      INSERT INTO users (address, username, xUsername, onboarded)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(address) DO UPDATE SET
        username = excluded.username,
        xUsername = excluded.xUsername,
        onboarded = 1
    `).run(addr, username, xHandle || '');
    
    // 2. Save to Redis
    if (redis) {
      await redis.set(`user:${addr}`, JSON.stringify(profile));
      // Also log activity
      await redis.lpush(`activity:${addr}`, JSON.stringify({
        type: 'ONBOARDING',
        timestamp: Date.now()
      }));
    }

    // Initialize session balance if not exists (SQLite)
    db.prepare('INSERT OR IGNORE INTO session_balances (address, balance) VALUES (?, ?)').run(addr, '100.0');
    
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

  // Try Redis first
  if (redis) {
    const cachedBalance = await redis.get(`balance:${addr}`);
    if (cachedBalance) return res.json({ balance: cachedBalance });
  }

  const row = db.prepare('SELECT balance FROM session_balances WHERE address = ?').get(addr);
  const balance = row ? row.balance : '100.0';

  if (redis) await redis.set(`balance:${addr}`, balance, 'EX', 60); // Cache for 60s
  res.json({ balance });
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

// --- Trades ---

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
      
      // 3. If won, update the user's session balance in SQLite
      if (event.won && parseFloat(event.payout) > 0) {
        const userAddr = event.user.toLowerCase();
        
        // Fetch current session balance
        const row = db.prepare('SELECT balance FROM session_balances WHERE address = ?').get(userAddr);
        const currentBalance = parseFloat(row ? row.balance : '100.0');
        const newBalance = currentBalance + parseFloat(event.payout);
        
        // Update session balance (UPSERT)
        db.prepare(`
          INSERT INTO session_balances (address, balance) 
          VALUES (?, ?)
          ON CONFLICT(address) DO UPDATE SET 
            balance = excluded.balance,
            last_updated = CURRENT_TIMESTAMP
        `).run(userAddr, newBalance.toFixed(4));
        
        // 4. Update Redis Balance & Activity
        if (redis) {
          await redis.set(`balance:${userAddr}`, newBalance.toFixed(4), 'EX', 3600);
          await redis.lpush(`activity:${userAddr}`, JSON.stringify({
            type: 'TRADE_SETTLED',
            betId: id,
            won: event.won,
            payout: event.payout,
            timestamp: Date.now()
          }));
        }
          
        console.log(`[API] Credited ${event.payout} to session wallet for ${userAddr}. New Balance: ${newBalance.toFixed(4)}`);
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

const PORT = 3010; // Forced to 3010 as per user's .env
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Simplified 15market Backend running on port ${PORT}`);
});

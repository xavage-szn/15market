const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const db = require('./database');
const blockchain = require('./blockchain');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(cors());
app.use(express.json());

// --- User Profile / Onboarding ---

app.get('/profiles/:address', (req, res) => {
  const { address } = req.params;
  const user = db.prepare('SELECT * FROM users WHERE address = ?').get(address.toLowerCase());
  if (user) {
    res.json({ ...user, onboarded: true });
  } else {
    res.status(404).json({ error: "User not found" });
  }
});

app.post('/profiles', (req, res) => {
  const { address, username, xHandle, avatar } = req.body;
  if (!address || !username) {
    return res.status(400).json({ error: "Address and username are required" });
  }

  const addr = address.toLowerCase();
  try {
    db.prepare(`
      INSERT INTO users (address, username, xUsername, onboarded)
      VALUES (?, ?, ?, 1)
      ON CONFLICT(address) DO UPDATE SET
        username = excluded.username,
        xUsername = excluded.xUsername,
        onboarded = 1
    `).run(addr, username, xHandle || '');
    
    // Initialize session balance if not exists
    db.prepare('INSERT OR IGNORE INTO session_balances (address, balance) VALUES (?, ?)').run(addr, '100.0');
    
    res.json({ success: true, profile: { address: addr, username, xHandle, avatar } });
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

app.get('/session/balance/:address', (req, res) => {
  const { address } = req.params;
  const row = db.prepare('SELECT balance FROM session_balances WHERE address = ?').get(address.toLowerCase());
  res.json({ balance: row ? row.balance : '100.0' }); // Default 100 for dev
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

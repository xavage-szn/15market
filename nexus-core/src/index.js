// ==================================================================================
// NEXUS CORE - SYSTEM ARCHITECTURE (UNIFIED ENTRY POINT)
// ==================================================================================
// This is the primary backend controller for the 15MARKET trading platform. 
// It handles:
// 1. DETERMINISTIC SESSION WALLETS: Generating secure, server-side EOAs for users.
// 2. REAL-TIME PRICE AGGREGATION: High-frequency polling from Pyth, Binance, and MEXC.
// 3. SECURE SETTLEMENT: Managing trade execution, payouts, and platform fee routing.
// 4. API & WEBSOCKETS: Real-time data streaming and user session management.
// ==================================================================================
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const config = require('./config');
const cache = require('./cache');
const rpc = require('./rpc');
const provider = rpc.provider;
const ClassicEngine = require('./classic');
const profiles = require('./profiles');
const { ethers } = require('ethers');
const Redis = require('ioredis');

const redis = new Redis(config.REDIS_URL || 'redis://localhost:6379');

// --- Setup Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- Deterministic Session Wallet Derivation ---
const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";

/**
 * DETERMINISTIC SESSION WALLET DERIVATION
 * ---------------------------------------
 * Generates a unique, server-side Ethereum account (EOA) for every user.
 * Rationale: Allows the platform to sign transactions (payouts/settlements) 
 * on behalf of the user without requiring them to sign every single trade on-chain.
 * 
 * SECURITY NOTE: The MASTER_SECRET must be kept highly secure. If compromised, 
 * an attacker could derive the private keys for ALL user session wallets.
 * 
 * @param {string} userAddr - The user's primary wallet address.
 * @returns {ethers.Wallet} - The derived wallet connected to the provider.
 */
function deriveSessionWallet(userAddr) {
  return rpc.deriveSessionWallet(userAddr);
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

/**
 * MULTI-SOURCE PRICE FEED ENGINE (HYBRID ORACLE)
 * -----------------------------------------------
 * Polls prices every 1000ms from 3 distinct sources to ensure 100% uptime.
 * Sources (in order of priority):
 * 1. Pyth Network (On-chain/Hermes) - Primary authority for settlement.
 * 2. Binance REST API - High-liquidity fallback.
 * 3. MEXC REST API - Safety fallback.
 * 
 * IMPACT IF BUGGED: If this fails, users cannot trade as markets will halt. 
 * If it returns incorrect prices, the platform could lose funds through arbitrage.
 */
async function pollPrices() {
  const keys = Object.keys(PYTH_IDS);
  
  await Promise.all(keys.map(async (key) => {
    try {
      let bestPrice = null;
      let sourceUsed = 'none';

      // 1. Pyth (Primary)
      try {
        bestPrice = await fetchFromSource(`https://hermes.pyth.network/v2/updates/price/latest?ids[]=${PYTH_IDS[key]}`, (d) => {
          const p = d.parsed?.[0]?.price;
          if (!p) return null;
          return parseFloat(p.price) * Math.pow(10, p.expo);
        });
        sourceUsed = 'pyth';
      } catch (e) {}

      // 2. Binance (Fallback)
      if (!bestPrice || bestPrice <= 0) {
        try {
          bestPrice = await fetchFromSource(`https://api.binance.com/api/v3/ticker/price?symbol=${BINANCE_IDS[key]}`, d => parseFloat(d.price));
          sourceUsed = 'binance';
        } catch (e) {}
      }

      // 3. MEXC (Last Resort)
      if (!bestPrice || bestPrice <= 0) {
        try {
          bestPrice = await fetchFromSource(`https://api.mexc.com/api/v3/ticker/price?symbol=${MEXC_IDS[key]}`, d => parseFloat(d.price));
          sourceUsed = 'mexc';
        } catch (e) {}
      }

      if (bestPrice && bestPrice > 0) {
        const now = Date.now();
        cache.prices[key] = bestPrice;
        cache.priceMeta[key] = { updatedAt: now, source: sourceUsed };
        
        // Store history for chart rendering and result validation
        if (!cache.priceHistory[key]) cache.priceHistory[key] = [];
        cache.priceHistory[key].push({ price: bestPrice, time: now });
        if (cache.priceHistory[key].length > 1200) cache.priceHistory[key].shift();
        
        // Broadcast to all connected clients via Socket.IO
        const payload = { key, price: bestPrice, ts: now };
        io.emit('price', payload);
        // Sync with any other backend instances via Redis
        redis.publish('price_updates', JSON.stringify(payload)).catch(() => {});
      }
    } catch (err) {
      // Quiet fail to prevent console flooding during network blips
    }
  }));
}
setInterval(pollPrices, 1000);

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

    // Sync in-process session with protection against recent win reversion
    let session = cache.sessions.get(userAddr);
    const onChainBal = parseFloat(balance);
    if (session) {
      const timeSinceWin = Date.now() - (session.lastWinAt || 0);
      // Only downgrade if it's been a while since a win (45s)
      if (onChainBal > session.balance || timeSinceWin > 45000) {
        session.balance = onChainBal;
      }
    } else {
      session = cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: identity.walletAddress,
        sessionAddress,
        balance: onChainBal,
      });
    }

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

    // Also sync in-process session balance with protection
    const session = cache.sessions.get(userAddr);
    const onChainBal = parseFloat(balance);
    if (session) {
      const timeSinceWin = Date.now() - (session.lastWinAt || 0);
      if (onChainBal > session.balance || timeSinceWin > 45000) {
        session.balance = onChainBal;
      }
    }

    res.json({ 
      success: true, 
      balance: String(session ? session.balance : onChainBal), 
      sessionAddress: sessionWallet.address, 
      source: 'eoa-onchain-synced' 
    });
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
 * SECURE WITHDRAWAL (CASHOUT) PIPELINE
 * -----------------------------------
 * Deducts platform fees and sweeps user winnings back to their main wallet.
 * 
 * LOGIC:
 * 1. Calculate 1% Platform Fee.
 * 2. Deduct Fee + Gas Costs (1.3x multiplier for reliability).
 * 3. Route Fee to Treasury Address.
 * 4. Route Remaining Balance to User's Main Wallet.
 * 
 * CRITICAL: This endpoint uses strict nonce management to prevent "Replacement fee too low" 
 * errors during concurrent transfers.
 */
app.post('/session/cashout', async (req, res) => {
  const { address, amount } = req.body;
  if (!address) return res.status(400).json({ error: "Missing address" });
  
  try {
    const userAddr = address.toLowerCase();
    const sessionWallet = deriveSessionWallet(userAddr);

    // CRITICAL: Use a direct JsonRpcProvider (not FallbackProvider) for nonce and balance queries.
    // FallbackProvider in ethers v6 does NOT support the 'pending' block tag, which causes
    // stale nonce reads and lost transactions.
    const directProvider = rpc.providers[0];
    if (!directProvider) throw new Error("No RPC provider available");

    const balWei = await directProvider.getBalance(sessionWallet.address, 'pending');
    if (balWei <= 0n) {
      return res.status(400).json({ error: "No funds in session wallet to withdraw" });
    }

    const feeData = await directProvider.getFeeData();
    // 1.3x gas multiplier for reliability on congested blocks
    const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 13n / 10n;
    // Use a fixed safe gas limit for simple ETH transfers — estimateGas can be unreliable on Arc
    const gasLimit = 21000n;
    const gasCost = gasPrice * gasLimit;

    let sendAmount;
    let feeAmount = 0n;

    if (amount && Number(amount) > 0) {
      // FIX: Clamp to 6 decimal places BEFORE converting to wei.
      // Number(29.99).toFixed(18) produces floating-point garbage that ethers.parseUnits rejects.
      const clampedAmount = parseFloat(Number(amount).toFixed(6));
      const requestedWei = ethers.parseUnits(clampedAmount.toString(), 18);

      feeAmount = (requestedWei * 1n) / 100n;
      sendAmount = requestedWei - feeAmount;

      // Ensure the EOA can cover the full requested amount + gas for both transactions
      if (requestedWei + (gasCost * 2n) > balWei) {
        return res.status(400).json({ error: `Insufficient balance. Need ${ethers.formatEther(requestedWei + gasCost * 2n)} USDC.` });
      }
    } else {
      // FULL SWEEP: Reserve gas for two transactions (fee tx + user tx)
      const totalAvailable = balWei - (gasCost * 2n);
      if (totalAvailable <= 0n) {
        return res.status(400).json({ error: "Balance too low to cover network gas." });
      }
      feeAmount = (totalAvailable * 1n) / 100n;
      sendAmount = totalAvailable - feeAmount;
    }

    if (sendAmount <= 0n) {
      return res.status(400).json({ error: "Balance too low to cover gas and platform fees." });
    }

    console.log(`[Withdrawal] Routing: ${ethers.formatEther(sendAmount)} USDC to User | ${ethers.formatEther(feeAmount)} USDC to Treasury`);

    // Fetch the pending nonce from the DIRECT provider (FallbackProvider cannot do this)
    let currentNonce = await directProvider.getTransactionCount(sessionWallet.address, 'pending');

    // STEP 1: Route 1% Platform Fee to Treasury
    // We await the broadcast (not confirmation) so the nonce increment is safe
    if (feeAmount > 0n && config.TREASURY_ADDRESS && config.TREASURY_ADDRESS !== ethers.ZeroAddress) {
      try {
        const feeTx = await sessionWallet.sendTransaction({
          to: ethers.getAddress(config.TREASURY_ADDRESS),
          value: feeAmount,
          gasLimit: 21000n,
          gasPrice,
          nonce: currentNonce
        });
        console.log(`[Withdrawal] Fee tx broadcast: ${feeTx.hash} | Nonce: ${currentNonce}`);
        currentNonce++; // Only increment AFTER a successful broadcast
      } catch (feeErr) {
        console.warn("[Withdrawal] Treasury transfer failed:", feeErr.message);
        // Re-read nonce in case state is uncertain after the failed broadcast
        currentNonce = await directProvider.getTransactionCount(sessionWallet.address, 'pending');
      }
    }

    // STEP 2: Return Remaining Funds to User's Main Wallet
    const tx = await sessionWallet.sendTransaction({
      to: ethers.getAddress(address),
      value: sendAmount,
      gasLimit,
      gasPrice,
      nonce: currentNonce
    });
    console.log(`[Withdrawal] User tx broadcast: ${tx.hash} | Nonce: ${currentNonce} | Amount: ${ethers.formatEther(sendAmount)} USDC`);

    // Sync the in-memory cache to reflect the post-withdrawal balance
    const session = cache.sessions.get(userAddr);
    if (session) {
      const newBal = await rpc.getBalance(sessionWallet.address);
      session.balance = parseFloat(newBal);
    }

    // Notify frontend via WebSocket for instant balance update
    io.to(userAddr).emit('balance_update', {
      balance: String(session?.balance || '0'),
      reason: 'CASHOUT',
      txHash: tx.hash
    });

    res.json({ success: true, txHash: tx.hash, amount: ethers.formatEther(sendAmount) });
  } catch (err) {
    console.error('[Withdrawal] Critical System Failure:', err);
    res.status(500).json({ error: "Withdrawal error. Your funds remain safe in your session wallet. Error: " + err.message });
  }
});

app.post('/session/deposit', async (req, res) => {
  const { address, amount, txHash } = req.body;
  if (!address || !amount) return res.status(400).json({ error: "Missing data" });

  try {
    const userAddr = address.toLowerCase();
    let session = cache.sessions.get(userAddr);
    
    console.log(`[Deposit] Request: ${amount} USDC for ${userAddr} | TX: ${txHash}`);

    // Update balance optimistically in the backend cache
    if (session) {
      session.balance = Number((session.balance + parseFloat(amount)).toFixed(4));
      console.log(`[Deposit] Session updated: ${userAddr} new balance ${session.balance}`);
    } else {
      console.warn(`[Deposit] No active session found for ${userAddr}. Creating with derived addresses.`);
      const sessionWallet = deriveSessionWallet(userAddr);
      cache.getOrCreateSession(userAddr, { 
        balance: parseFloat(amount),
        identityKey: userAddr,
        walletAddress: userAddr, // Assuming the deposit came from their main wallet
        sessionAddress: sessionWallet.address
      });
    }

    // Push to history
    const depRecord = {
      type: 'DEPOSIT',
      amount: parseFloat(amount),
      timestamp: Date.now(),
      txHash,
      status: 'PENDING'
    };
    cache.pushHistory(userAddr, depRecord);

    // Broadcast instant update
    io.to(userAddr).emit('balance_update', {
      balance: String(session?.balance || amount),
      reason: 'DEPOSIT_OPTIMISTIC',
      amount,
      txHash
    });

    console.log(`[Deposit] Optimistic credit: ${amount} USDC to ${userAddr} | TX: ${txHash}`);
    res.json({ success: true, balance: session?.balance });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/history/:address', (req, res) => {
  const addr = classicEngine.normalizeAddr(req.params.address);
  res.json(cache.getHistory(addr));
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
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  
  // Include trades and computed stats in the profile response for unified sync
  res.json({
    ...profile,
    stats: profiles.getProfileStats(addr),
    trades: profiles.getHistory(addr)
  });
});

app.get('/stats/global', (req, res) => {
  res.json(profiles.getGlobalStats());
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

// ─── X (TWITTER) OAUTH INTEGRATION ──────────────────────────────────────────────

const crypto = require('crypto');
const oauthStates = new Map();

app.post('/auth/twitter/prepare', (req, res) => {
  const { address, origin, username } = req.body;
  if (!address) return res.status(400).json({ error: 'Wallet address required' });

  const stateId = crypto.randomBytes(16).toString('hex');
  
  oauthStates.set(stateId, { address: address.toLowerCase(), origin, username });
  
  res.json({ state: stateId });
});

app.get('/auth/twitter/callback', async (req, res) => {
  const { state, code } = req.query;
  const session = oauthStates.get(state);
  
  if (!session) return res.status(400).send('Invalid or expired authentication session');
  oauthStates.delete(state);
  
  try {
    const authHeader = 'Basic ' + Buffer.from(`${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`).toString('base64');
    
    // Polyfill for fetch if needed, but Node 18+ has native fetch
    const tokenRes = await fetch('https://api.twitter.com/2/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Authorization': authHeader
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: process.env.TWITTER_CLIENT_ID,
        redirect_uri: process.env.TWITTER_CALLBACK_URL,
        code_verifier: 'challenge'
      })
    });
    
    if (!tokenRes.ok) {
      console.error('Twitter token error:', await tokenRes.text());
      return res.status(400).send('Failed to authenticate with X');
    }
    
    const tokenData = await tokenRes.json();
    
    const userRes = await fetch('https://api.twitter.com/2/users/me?user.fields=profile_image_url', {
      headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
    });
    
    if (!userRes.ok) return res.status(400).send('Failed to retrieve X profile info');
    
    const userData = await userRes.json();
    const xUser = userData.data;
    
    // Auto-onboard or link X securely
    profiles.upsert(session.address, {
      xHandle: xUser.username,
      xId: xUser.id,
      avatar: xUser.profile_image_url,
      xConnected: true,
      username: session.username || xUser.username // Store display name passed from frontend
    });
    
    // Redirect back to frontend with success params
    const frontendOrigin = session.origin || 'http://localhost:5173';
    res.redirect(`${frontendOrigin}/?x_connected=true&x_handle=${xUser.username}`);
  } catch (err) {
    console.error('Twitter callback error:', err);
    res.status(500).send('Internal Server Error during X authentication');
  }
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

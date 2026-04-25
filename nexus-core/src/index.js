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
const { RedisMirrorService, SettlementService, setupBatchSweepJob, FACTORY_ABI } = require('./services/nexus-auto-signer');

// --- Setup Server ---
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

// --- Blockchain Setup ---
const provider = new ethers.JsonRpcProvider(config.RPCS[0]);
const operatorWallet = new ethers.Wallet(config.PRIVATE_KEY, provider);
const factoryContract = new ethers.Contract(config.FACTORY_ADDRESS, FACTORY_ABI, operatorWallet);

// --- Initialize Engines ---
const classicEngine = new ClassicEngine(io);
const settlementService = new SettlementService(operatorWallet, factoryContract, io);
const redisMirror = new RedisMirrorService(factoryContract, operatorWallet);
setupBatchSweepJob(operatorWallet, factoryContract);

settlementService.startSettlementPoller();
classicEngine.start();


// --- Socket.IO ---
io.on('connection', (socket) => {
  socket.emit('price_update', cache.prices);
  socket.on('join_user', (address) => {
    const room = classicEngine.normalizeAddr(address);
    if (room) socket.join(room);
  });
});

// --- API Routes (Classic) ---

app.post('/session/init', (req, res) => {
  const identity = classicEngine.resolveSessionIdentity(req.body || {});
  if (!identity.ok) return res.status(400).json({ error: identity.error });
  
  const userAddr = identity.identityKey;
  const suffix = (identity.walletAddress || 'anon').slice(2, 10);
  const session = cache.getOrCreateSession(userAddr, {
    identityKey: userAddr,
    walletAddress: identity.walletAddress,
    privyUserId: identity.privyUserId,
    sessionAddress: `session_${suffix}`,
    balance: config.DEFAULT_SESSION_BALANCE,
  });

  res.json({
    success: true,
    walletAddress: session.walletAddress,
    privyUserId: session.privyUserId,
    sessionAddress: session.sessionAddress,
    balance: String(session.balance),
  });
});

app.get('/session/balance/:address', (req, res) => {
  const raw = classicEngine.normalizeAddr(req.params.address);
  const session = cache.sessions.get(raw);
  if (!session) return res.json({ success: true, balance: "0" });
  res.json({
    success: true,
    balance: String(session.balance),
    walletAddress: session.walletAddress,
    sessionAddress: session.sessionAddress,
  });
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

// --- API Routes (Global) ---

app.get('/prices', (req, res) => {
  res.json({ ...cache.prices, oracleReady: true, hasAnyPrice: true });
});

app.post('/prices', (req, res) => {
  const next = req.body || {};
  ['btc', 'eth', 'sol'].forEach((k) => {
    if (Number.isFinite(Number(next[k]))) cache.prices[k] = Number(next[k]);
  });
  io.emit('price_update', cache.prices);
  res.json({ success: true, prices: cache.prices });
});

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

const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(cors());
app.use(express.json());

const BATCH_WINDOW_MS = Number(process.env.SETTLEMENT_BATCH_WINDOW_MS || 25);
const SETTLEMENT_CONCURRENCY = Number(process.env.SETTLEMENT_CONCURRENCY || 16);
const DEFAULT_MULTIPLIER = Number(process.env.DEFAULT_MULTIPLIER || 1.95);
const PAYOUT_INLINE_FALLBACK = String(process.env.PAYOUT_INLINE_FALLBACK || 'true') === 'true';
const USE_PRIVY_SMART_WALLETS = String(process.env.USE_PRIVY_SMART_WALLETS || 'false') === 'true';
const PRIVY_APP_ID = process.env.PRIVY_APP_ID || '';
const PRIVY_APP_SECRET = process.env.PRIVY_APP_SECRET || '';

const sessions = new Map(); // userAddress -> { balance, sessionAddress }
const trades = new Map(); // tradeId -> trade object
const userHistory = new Map(); // userAddress -> array
const settlementQueue = [];
const payoutQueue = [];
const prices = { btc: 65000, eth: 3200, sol: 145 };

let queueProcessing = false;
let payoutQueueProcessing = false;
let payoutJobCounter = 0;

const now = () => Date.now();
const normalizeAddr = (addr) => String(addr || '').toLowerCase();
const isLikelyWallet = (value) => /^0x[a-fA-F0-9]{40}$/.test(String(value || ''));

function resolveSessionIdentity(payload = {}) {
  const address = normalizeAddr(payload.address);
  const privyUserId = String(payload.privyUserId || '').trim();
  const privyWalletAddress = normalizeAddr(payload.privyWalletAddress);
  const fallbackWallet = isLikelyWallet(address) ? address : '';
  const walletAddress = isLikelyWallet(privyWalletAddress) ? privyWalletAddress : fallbackWallet;

  if (USE_PRIVY_SMART_WALLETS && !walletAddress) {
    return { ok: false, error: 'Privy wallet address required when Privy mode is enabled.' };
  }
  if (!walletAddress) {
    return { ok: false, error: 'Valid wallet address required.' };
  }

  const identityKey = privyUserId ? `privy:${privyUserId}:${walletAddress}` : walletAddress;
  return { ok: true, identityKey, walletAddress, privyUserId: privyUserId || null };
}

function pushHistory(address, record) {
  const addr = normalizeAddr(address);
  const list = userHistory.get(addr) || [];
  list.unshift(record);
  userHistory.set(addr, list.slice(0, 100));
}

function getOrCreateSession(identity) {
  const key = String(identity.identityKey || '').toLowerCase();
  if (!sessions.has(key)) {
    const suffix = (identity.walletAddress || 'anon').slice(2, 10) || 'anon';
    sessions.set(key, {
      identityKey: key,
      walletAddress: identity.walletAddress,
      privyUserId: identity.privyUserId || null,
      sessionAddress: `session_${suffix}`,
      balance: Number(process.env.DEFAULT_SESSION_BALANCE || 1000),
    });
  }
  return sessions.get(key);
}

function queueForSettlement(trade) {
  settlementQueue.push(trade);
  settlementQueue.sort((a, b) => a.settleAt - b.settleAt);
}

function queuePayoutJob(trade) {
  payoutJobCounter += 1;
  payoutQueue.push({
    jobId: `payout_${trade.id}_${payoutJobCounter}`,
    tradeId: trade.id,
    userAddr: trade.userAddr,
    walletAddress: trade.walletAddress || trade.userAddr,
    privyUserId: trade.privyUserId || null,
    amount: trade.payout,
    queuedAt: now(),
    status: 'QUEUED',
  });
}

function claimPayoutJobs(limit) {
  const jobs = [];
  const max = Math.max(1, Number(limit) || 1);
  for (let i = 0; i < payoutQueue.length && jobs.length < max; i += 1) {
    const job = payoutQueue[i];
    if (job.status !== 'QUEUED') continue;
    job.status = 'CLAIMED';
    job.claimedAt = now();
    jobs.push(job);
  }
  return jobs;
}

function completePayoutJob(jobId) {
  const idx = payoutQueue.findIndex((j) => j.jobId === jobId);
  if (idx === -1) return null;
  const job = payoutQueue[idx];
  payoutQueue.splice(idx, 1);
  return job;
}

async function settleTrade(trade) {
  if (trade.status !== 'PENDING') return;

  const latest = prices[trade.symbol] ?? trade.entryPrice;
  const won = trade.direction === 1 ? latest > trade.entryPrice : latest < trade.entryPrice;
  const payout = won ? Number((trade.amount * DEFAULT_MULTIPLIER).toFixed(4)) : 0;

  trade.status = 'SETTLED';
  trade.exitPrice = latest;
  trade.won = won;
  trade.payout = payout;
  trade.settledAt = now();

  const event = {
    type: 'TRADE_SETTLED',
    betId: trade.id,
    won,
    payout: String(payout),
    entryPrice: trade.entryPrice,
    exitPrice: latest,
    direction: trade.direction,
    duration: trade.duration,
    amount: trade.amount,
    symbol: trade.symbol.toUpperCase(),
    timestamp: trade.settledAt,
    userAddr: trade.userAddr,
  };

  pushHistory(trade.userAddr, event);
  io.to(trade.userAddr).emit('trade_settled', event);
  io.emit('trade_settled', event);

  if (!won) {
    const session = getOrCreateSession({
      identityKey: trade.userAddr,
      walletAddress: trade.walletAddress || trade.userAddr,
      privyUserId: trade.privyUserId || null,
    });
    io.to(trade.userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'LOSS',
      betId: trade.id,
      payout: '0',
    });
    return;
  }

  queuePayoutJob(trade);
}

function dispatchPayout(job, source) {
  const trade = trades.get(job.tradeId);
  if (!trade || !trade.won || trade.status !== 'SETTLED') {
    return { ok: false, error: 'Trade not eligible for payout' };
  }

  const session = getOrCreateSession({
    identityKey: job.userAddr,
    walletAddress: job.walletAddress || job.userAddr,
    privyUserId: job.privyUserId || null,
  });
  session.balance = Number((session.balance + Number(job.amount)).toFixed(4));

  trade.status = 'PAID';
  trade.paidAt = now();
  trade.payoutTx = `payout_${job.jobId}`;

  const payoutEvent = {
    type: 'PAYOUT_COMPLETED',
    betId: trade.id,
    payout: String(job.amount),
    source,
    timestamp: trade.paidAt,
    userAddr: trade.userAddr,
    txHash: trade.payoutTx,
  };

  pushHistory(trade.userAddr, payoutEvent);
  io.to(trade.userAddr).emit('balance_update', {
    balance: String(session.balance),
    reason: 'WIN_PAYOUT',
    betId: trade.id,
    payout: String(job.amount),
    txHash: trade.payoutTx,
  });
  io.to(trade.userAddr).emit('payout_completed', payoutEvent);
  io.emit('payout_completed', payoutEvent);
  return { ok: true, payoutEvent };
}

async function processInlinePayoutBatch() {
  if (!PAYOUT_INLINE_FALLBACK || payoutQueueProcessing) return;
  payoutQueueProcessing = true;
  try {
    const claimed = claimPayoutJobs(SETTLEMENT_CONCURRENCY);
    for (const job of claimed) {
      dispatchPayout(job, 'inline_fallback');
      completePayoutJob(job.jobId);
    }
  } finally {
    payoutQueueProcessing = false;
  }
}

async function processSettlementBatch() {
  if (queueProcessing) return;
  queueProcessing = true;
  try {
    const ts = now();
    const due = [];
    while (settlementQueue.length > 0 && settlementQueue[0].settleAt <= ts) {
      due.push(settlementQueue.shift());
    }

    if (due.length === 0) return;

    for (let i = 0; i < due.length; i += SETTLEMENT_CONCURRENCY) {
      const chunk = due.slice(i, i + SETTLEMENT_CONCURRENCY);
      await Promise.allSettled(chunk.map((trade) => settleTrade(trade)));
    }
  } finally {
    queueProcessing = false;
  }
}

setInterval(processSettlementBatch, BATCH_WINDOW_MS);
setInterval(processInlinePayoutBatch, Math.max(10, BATCH_WINDOW_MS));

io.on('connection', (socket) => {
  socket.emit('price_update', prices);
  socket.on('join_user', (address) => {
    const room = normalizeAddr(address);
    if (room) socket.join(room);
  });
});

app.post('/session/init', (req, res) => {
  const identity = resolveSessionIdentity(req.body || {});
  if (!identity.ok) return res.status(400).json({ error: identity.error });
  const session = getOrCreateSession(identity);
  res.json({
    success: true,
    walletAddress: session.walletAddress,
    privyUserId: session.privyUserId,
    sessionAddress: session.sessionAddress,
    balance: String(session.balance),
  });
});

app.get('/session/balance/:address', (req, res) => {
  const raw = normalizeAddr(req.params.address);
  const session = getOrCreateSession({ identityKey: raw, walletAddress: raw, privyUserId: null });
  res.json({
    success: true,
    balance: String(session.balance),
    walletAddress: session.walletAddress,
    sessionAddress: session.sessionAddress,
  });
});

app.get('/balance/:address', (req, res) => {
  const raw = normalizeAddr(req.params.address);
  const session = getOrCreateSession({ identityKey: raw, walletAddress: raw, privyUserId: null });
  res.json({ balance: String(session.balance) });
});

app.post('/session/execute', (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });

  const identity = resolveSessionIdentity(req.body || {});
  if (!identity.ok) return res.status(400).json({ error: identity.error });
  const userAddr = identity.identityKey;
  const session = getOrCreateSession(identity);

  const id = String(tradeParams.id ?? `${now()}_${Math.floor(Math.random() * 10000)}`);
  const direction = Number(tradeParams.direction);
  const duration = Math.max(1, Number(tradeParams.duration || 5));
  const marketId = Number(tradeParams.marketId ?? 0);
  const amount = Number(tradeParams.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json({ error: 'Invalid amount' });
  }
  if (session.balance < amount) {
    return res.status(400).json({ error: 'Insufficient session balance' });
  }

  const symbol = ['eth', 'btc', 'sol'][marketId] || 'eth';
  const entryPrice = Number(prices[symbol] || tradeParams.entryPrice || 0);
  session.balance = Number((session.balance - amount).toFixed(4));

  const trade = {
    id,
    userAddr,
    walletAddress: session.walletAddress,
    privyUserId: session.privyUserId,
    direction,
    duration,
    marketId,
    amount,
    symbol,
    entryPrice,
    status: 'PENDING',
    createdAt: now(),
    settleAt: now() + (duration * 1000),
  };

  trades.set(id, trade);
  queueForSettlement(trade);

  const placed = {
    type: 'TRADE_PLACED',
    id,
    amount,
    direction,
    symbol: symbol.toUpperCase(),
    timestamp: trade.createdAt,
    userAddr,
  };
  pushHistory(userAddr, placed);
  io.to(userAddr).emit('trade_placed', placed);
  io.to(userAddr).emit('balance_update', {
    balance: String(session.balance),
    reason: 'STAKE_LOCKED',
    betId: id,
    payout: '0',
  });
  io.emit('new_trade', placed);

  res.json({
    success: true,
    txHash: `sim_${id}`,
    settlementEtaMs: duration * 1000,
  });
});

app.get('/history/:address', (req, res) => {
  const addr = normalizeAddr(req.params.address);
  res.json(userHistory.get(addr) || []);
});

app.get('/internal/payout-jobs/claim', (req, res) => {
  const limit = Number(req.query.limit || SETTLEMENT_CONCURRENCY);
  const jobs = claimPayoutJobs(limit);
  res.json({ success: true, jobs, queueDepth: payoutQueue.length });
});

app.post('/internal/payout-jobs/complete', (req, res) => {
  const { jobId } = req.body || {};
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  const job = payoutQueue.find((j) => j.jobId === jobId);
  if (!job || job.status !== 'CLAIMED') {
    return res.status(404).json({ error: 'Claimed job not found' });
  }

  const result = dispatchPayout(job, 'worker');
  if (!result.ok) {
    job.status = 'FAILED';
    return res.status(400).json(result);
  }

  completePayoutJob(jobId);
  res.json({ success: true, ...result });
});

app.get('/prices', (req, res) => {
  res.json({ ...prices, oracleReady: true, hasAnyPrice: true });
});

app.post('/prices', (req, res) => {
  const next = req.body || {};
  ['btc', 'eth', 'sol'].forEach((k) => {
    if (Number.isFinite(Number(next[k]))) prices[k] = Number(next[k]);
  });
  io.emit('price_update', prices);
  res.json({ success: true, prices });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    mode: 'direct_execution_batch_settlement',
    queueDepth: settlementQueue.length,
    payoutQueueDepth: payoutQueue.filter((j) => j.status === 'QUEUED').length,
    claimedPayoutJobs: payoutQueue.filter((j) => j.status === 'CLAIMED').length,
    batchWindowMs: BATCH_WINDOW_MS,
    settlementConcurrency: SETTLEMENT_CONCURRENCY,
    payoutInlineFallback: PAYOUT_INLINE_FALLBACK,
    privyModeEnabled: USE_PRIVY_SMART_WALLETS,
    privyConfigured: Boolean(PRIVY_APP_ID && PRIVY_APP_SECRET),
    timestamp: now(),
  });
});

const PORT = Number(process.env.PORT || 3010);
server.listen(PORT, '0.0.0.0', () => {
  if (USE_PRIVY_SMART_WALLETS && !(PRIVY_APP_ID && PRIVY_APP_SECRET)) {
    console.warn('Privy mode enabled but PRIVY_APP_ID/PRIVY_APP_SECRET are missing.');
  }
  console.log(`Low-latency backend listening on ${PORT}`);
});

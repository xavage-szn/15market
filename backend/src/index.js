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

const sessions = new Map(); // userAddress -> { balance, sessionAddress }
const trades = new Map(); // tradeId -> trade object
const userHistory = new Map(); // userAddress -> array
const settlementQueue = [];
const prices = { btc: 65000, eth: 3200, sol: 145 };

let queueProcessing = false;

const now = () => Date.now();
const normalizeAddr = (addr) => String(addr || '').toLowerCase();

function pushHistory(address, record) {
  const addr = normalizeAddr(address);
  const list = userHistory.get(addr) || [];
  list.unshift(record);
  userHistory.set(addr, list.slice(0, 100));
}

function getOrCreateSession(address) {
  const addr = normalizeAddr(address);
  if (!sessions.has(addr)) {
    sessions.set(addr, {
      sessionAddress: `session_${addr.slice(2, 10) || 'anon'}`,
      balance: Number(process.env.DEFAULT_SESSION_BALANCE || 1000),
    });
  }
  return sessions.get(addr);
}

function queueForSettlement(trade) {
  settlementQueue.push(trade);
  settlementQueue.sort((a, b) => a.settleAt - b.settleAt);
}

async function settleTrade(trade) {
  if (trade.status !== 'PENDING') return;

  const session = getOrCreateSession(trade.userAddr);
  const latest = prices[trade.symbol] ?? trade.entryPrice;
  const won = trade.direction === 1 ? latest > trade.entryPrice : latest < trade.entryPrice;
  const payout = won ? Number((trade.amount * DEFAULT_MULTIPLIER).toFixed(4)) : 0;

  if (won) {
    session.balance = Number((session.balance + payout).toFixed(4));
  }

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
  io.to(trade.userAddr).emit('balance_update', {
    balance: String(session.balance),
    reason: won ? 'WIN' : 'LOSS',
    betId: trade.id,
    payout: String(payout),
  });
  io.emit('trade_settled', event);
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

io.on('connection', (socket) => {
  socket.emit('price_update', prices);
  socket.on('join_user', (address) => {
    const room = normalizeAddr(address);
    if (room) socket.join(room);
  });
});

app.post('/session/init', (req, res) => {
  const { address } = req.body;
  if (!address) return res.status(400).json({ error: 'Address required' });
  const session = getOrCreateSession(address);
  res.json({
    success: true,
    sessionAddress: session.sessionAddress,
    balance: String(session.balance),
  });
});

app.get('/session/balance/:address', (req, res) => {
  const session = getOrCreateSession(req.params.address);
  res.json({
    success: true,
    balance: String(session.balance),
    sessionAddress: session.sessionAddress,
  });
});

app.get('/balance/:address', (req, res) => {
  const session = getOrCreateSession(req.params.address);
  res.json({ balance: String(session.balance) });
});

app.post('/session/execute', (req, res) => {
  const { address, tradeParams } = req.body;
  if (!address || !tradeParams) return res.status(400).json({ error: 'Missing params' });

  const userAddr = normalizeAddr(address);
  const session = getOrCreateSession(userAddr);

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
    batchWindowMs: BATCH_WINDOW_MS,
    settlementConcurrency: SETTLEMENT_CONCURRENCY,
    timestamp: now(),
  });
});

const PORT = Number(process.env.PORT || 3010);
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Low-latency backend listening on ${PORT}`);
});

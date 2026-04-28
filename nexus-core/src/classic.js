// ============================================================
// nexus-core/src/classic.js
// Classic Trading Engine — Treasury-First, Instant Settlement
// ============================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this.queueProcessing = false;
    this.payoutQueueProcessing = false;
    this.payoutJobCounter = 0;
  }

  start() {
    // Run settlement check every 25ms for near-instant settlement
    setInterval(() => this.processSettlementBatch(), config.BATCH_WINDOW_MS);
    if (config.PAYOUT_INLINE_FALLBACK) {
      setInterval(() => this.processInlinePayoutBatch(), Math.max(10, config.BATCH_WINDOW_MS));
    }
  }

  normalizeAddr(addr) {
    return String(addr || '').toLowerCase();
  }

  resolveSessionIdentity(payload = {}) {
    const walletAddress = this.normalizeAddr(payload.address);
    if (!/^0x[a-fA-F0-9]{40}$/.test(walletAddress)) {
      return { ok: false, error: 'Valid EVM wallet address required.' };
    }
    return { ok: true, identityKey: walletAddress, walletAddress };
  }

  /**
   * placeTrade — Treasury-First Model
   *
   * The stake is assumed to have ALREADY been sent to the treasury by the
   * frontend using walletClient.sendTransaction. This function registers the
   * trade and starts the countdown. If the stake tx is provided, it is stored
   * for audit. Balance is managed in-process and synced from chain on demand.
   */
  async placeTrade(tradeParams, identityPayload) {
    const identity = this.resolveSessionIdentity(identityPayload);
    if (!identity.ok) return { success: false, error: identity.error };

    const userAddr = identity.identityKey;

    // Get or create in-process session
    let session = cache.sessions.get(userAddr);
    if (!session) {
      // First trade: fetch on-chain balance to initialize
      let onChainBal = 0;
      try {
        const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
        const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr);
        const privateKey = ethers.keccak256(entropy);
        const wallet = new ethers.Wallet(privateKey);
        const balStr = await rpc.getBalance(wallet.address);
        onChainBal = parseFloat(balStr) || 0;
      } catch (_) {}

      session = cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: identity.walletAddress,
        balance: onChainBal,
      });
    }

    const amount = Number(tradeParams.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };

    // Balance check — stake must have been pre-sent to treasury so balance reflects it
    if (session.balance < amount) {
      return { success: false, error: `Insufficient balance. Have ${session.balance.toFixed(4)}, need ${amount}` };
    }

    const id = String(tradeParams.id || `${Date.now()}_${Math.floor(Math.random() * 10000)}`);
    const direction = Number(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);

    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    const entryPrice = Number(cache.prices[symbol] || tradeParams.entryPrice || 0);

    if (!entryPrice || entryPrice <= 0) return { success: false, error: 'Price feed unavailable' };

    // Deduct stake from in-process session balance immediately
    session.balance = Number((session.balance - amount).toFixed(4));

    const trade = {
      id,
      userAddr,
      walletAddress: session.walletAddress,
      direction,
      duration,
      marketId,
      amount,
      symbol,
      entryPrice,
      status: 'PENDING',
      createdAt: Date.now(),
      settleAt: Date.now() + (duration * 1000),
    };

    cache.trades.set(id, trade);
    cache.queueTradeForSettlement(trade);

    // Emit trade placed event + updated balance to frontend
    this.io.to(userAddr).emit('trade_placed', {
      type: 'TRADE_PLACED',
      betId: id,
      id,
      amount,
      direction,
      symbol: symbol.toUpperCase(),
      entryPrice,
      duration,
      timestamp: trade.createdAt,
      settleAt: trade.settleAt,
      userAddr,
    });

    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'STAKE_SENT',
      betId: id,
    });

    // Also emit to global scroller
    this.io.emit('new_trade', { betId: id, direction, symbol: symbol.toUpperCase(), amount, userAddr });

    console.log(`[Trade] Placed #${id} | ${direction === 1 ? 'UP' : 'DOWN'} ${symbol.toUpperCase()} | $${amount} | ${duration}s | by ${userAddr}`);

    return {
      success: true,
      txHash: `embedded_${id}`,
      tradeId: id,
      settlementEtaMs: duration * 1000,
      newBalance: String(session.balance),
    };
  }

  // --- Settlement ---

  async processSettlementBatch() {
    if (this.queueProcessing) return;
    this.queueProcessing = true;
    try {
      const ts = Date.now();
      const due = [];
      while (cache.settlementQueue.length > 0 && cache.settlementQueue[0].settleAt <= ts) {
        due.push(cache.settlementQueue.shift());
      }
      if (due.length === 0) return;

      for (let i = 0; i < due.length; i += config.SETTLEMENT_CONCURRENCY) {
        const chunk = due.slice(i, i + config.SETTLEMENT_CONCURRENCY);
        await Promise.allSettled(chunk.map((trade) => this.settleTrade(trade)));
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  async settleTrade(trade) {
    if (trade.status !== 'PENDING') return;

    // Use historical price at close time for stable, non-gameable settlement
    const exitPrice = cache.getHistoricalPrice(trade.symbol, trade.settleAt) || cache.prices[trade.symbol] || trade.entryPrice;
    const won = trade.direction === 1 ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;
    const multiplier = Number(config.DEFAULT_MULTIPLIER) || 1.95;
    const payout = won ? Number((trade.amount * multiplier).toFixed(4)) : 0;

    trade.status = 'SETTLED';
    trade.exitPrice = exitPrice;
    trade.won = won;
    trade.payout = payout;
    trade.settledAt = Date.now();

    // Build the final settled event — matches what the frontend's trade_settled handler expects
    const settledEvent = {
      type: 'TRADE_SETTLED',
      betId: trade.id,
      id: trade.id,
      won,
      payout: String(payout),
      entryPrice: trade.entryPrice,
      exitPrice,
      direction: trade.direction,
      duration: trade.duration,
      amount: trade.amount,
      symbol: trade.symbol.toUpperCase(),
      timestamp: trade.settledAt,
      userAddr: trade.userAddr,
      // Final status fields the frontend trade history expects
      status: won ? 'WON' : 'LOST',
    };

    cache.pushHistory(trade.userAddr, settledEvent);

    // Emit instantly to the user's room — no delay
    this.io.to(trade.userAddr).emit('trade_settled', settledEvent);
    this.io.emit('trade_settled', settledEvent); // Global scroller

    console.log(`[Settlement] #${trade.id} ${won ? 'WON' : 'LOST'} @ $${exitPrice} (entry: $${trade.entryPrice})`);

    if (!won) {
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
        this.io.to(trade.userAddr).emit('balance_update', {
          balance: String(session.balance),
          reason: 'LOSS',
          betId: trade.id,
          payout: '0',
        });
      }
      return;
    }

    // WIN: queue payout
    this.queuePayoutJob(trade);
  }

  // --- Payouts ---

  queuePayoutJob(trade) {
    this.payoutJobCounter += 1;
    cache.payoutQueue.push({
      jobId: `payout_${trade.id}_${this.payoutJobCounter}`,
      tradeId: trade.id,
      userAddr: trade.userAddr,
      walletAddress: trade.walletAddress || trade.userAddr,
      amount: trade.payout,
      queuedAt: Date.now(),
      status: 'QUEUED',
    });
  }

  claimPayoutJobs(limit) {
    const jobs = [];
    const max = Math.max(1, Number(limit) || 1);
    for (let i = 0; i < cache.payoutQueue.length && jobs.length < max; i++) {
      const job = cache.payoutQueue[i];
      if (job.status !== 'QUEUED') continue;
      job.status = 'CLAIMED';
      job.claimedAt = Date.now();
      jobs.push(job);
    }
    return jobs;
  }

  dispatchPayout(job, source) {
    const trade = cache.trades.get(job.tradeId);
    if (!trade || !trade.won || trade.status !== 'SETTLED') {
      return { ok: false, error: 'Trade not eligible for payout' };
    }

    const session = cache.sessions.get(job.userAddr);
    if (session) {
      session.balance = Number((session.balance + Number(job.amount)).toFixed(4));
    }

    trade.status = 'PAID';
    trade.paidAt = Date.now();
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

    cache.pushHistory(trade.userAddr, payoutEvent);

    if (session) {
      this.io.to(trade.userAddr).emit('balance_update', {
        balance: String(session.balance),
        reason: 'WIN_PAYOUT',
        betId: trade.id,
        payout: String(job.amount),
        txHash: trade.payoutTx,
      });
    }
    this.io.to(trade.userAddr).emit('payout_completed', payoutEvent);
    this.io.emit('payout_completed', payoutEvent);
    return { ok: true, payoutEvent };
  }

  async processInlinePayoutBatch() {
    if (this.payoutQueueProcessing) return;
    this.payoutQueueProcessing = true;
    try {
      const claimed = this.claimPayoutJobs(config.SETTLEMENT_CONCURRENCY);
      for (const job of claimed) {
        this.dispatchPayout(job, 'inline_fallback');
        const idx = cache.payoutQueue.findIndex(j => j.jobId === job.jobId);
        if (idx !== -1) cache.payoutQueue.splice(idx, 1);
      }
    } finally {
      this.payoutQueueProcessing = false;
    }
  }
}

module.exports = ClassicEngine;

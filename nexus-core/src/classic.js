// ============================================================
// nexus-core/src/classic.js
// Classic Trading Execution & Settlement Engine
// ============================================================
const cache = require('./cache');
const config = require('./config');

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this.queueProcessing = false;
    this.payoutQueueProcessing = false;
    this.payoutJobCounter = 0;
  }

  start() {
    setInterval(() => this.processSettlementBatch(), config.BATCH_WINDOW_MS);
    if (config.PAYOUT_INLINE_FALLBACK) {
      setInterval(() => this.processInlinePayoutBatch(), Math.max(10, config.BATCH_WINDOW_MS));
    }
  }

  // --- Core Execution ---

  normalizeAddr(addr) {
    return String(addr || '').toLowerCase();
  }

  resolveSessionIdentity(payload = {}) {
    const address = this.normalizeAddr(payload.address);
    const privyUserId = String(payload.privyUserId || '').trim();
    const privyWalletAddress = this.normalizeAddr(payload.privyWalletAddress);
    const fallbackWallet = /^0x[a-fA-F0-9]{40}$/.test(address) ? address : '';
    const walletAddress = /^0x[a-fA-F0-9]{40}$/.test(privyWalletAddress) ? privyWalletAddress : fallbackWallet;

    if (config.USE_PRIVY_SMART_WALLETS && !walletAddress) {
      return { ok: false, error: 'Privy wallet address required when Privy mode is enabled.' };
    }
    if (!walletAddress) {
      return { ok: false, error: 'Valid wallet address required.' };
    }

    const identityKey = privyUserId ? `privy:${privyUserId}:${walletAddress}` : walletAddress;
    return { ok: true, identityKey, walletAddress, privyUserId: privyUserId || null };
  }

  placeTrade(tradeParams, identityPayload) {
    const identity = this.resolveSessionIdentity(identityPayload);
    if (!identity.ok) return { success: false, error: identity.error };

    const userAddr = identity.identityKey;
    const suffix = (identity.walletAddress || 'anon').slice(2, 10);
    const session = cache.getOrCreateSession(userAddr, {
      identityKey: userAddr,
      walletAddress: identity.walletAddress,
      privyUserId: identity.privyUserId,
      sessionAddress: `session_${suffix}`,
      balance: config.DEFAULT_SESSION_BALANCE,
    });

    const amount = Number(tradeParams.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };
    if (session.balance < amount) return { success: false, error: 'Insufficient session balance' };

    const id = String(tradeParams.id || `${Date.now()}_${Math.floor(Math.random() * 10000)}`);
    const direction = Number(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);
    
    const symbol = ['eth', 'btc', 'sol'][marketId] || 'eth';
    const entryPrice = Number(cache.prices[symbol] || tradeParams.entryPrice || 0);

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
      createdAt: Date.now(),
      settleAt: Date.now() + (duration * 1000),
    };

    cache.trades.set(id, trade);
    cache.queueTradeForSettlement(trade);

    const placedEvent = {
      type: 'TRADE_PLACED',
      id,
      amount,
      direction,
      symbol: symbol.toUpperCase(),
      timestamp: trade.createdAt,
      userAddr,
    };
    cache.pushHistory(userAddr, placedEvent);

    this.io.to(userAddr).emit('trade_placed', placedEvent);
    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'STAKE_LOCKED',
      betId: id,
      payout: '0',
    });
    this.io.emit('new_trade', placedEvent);

    return {
      success: true,
      txHash: `sim_${id}`,
      settlementEtaMs: duration * 1000,
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

    const latest = cache.prices[trade.symbol] ?? trade.entryPrice;
    const won = trade.direction === 1 ? latest > trade.entryPrice : latest < trade.entryPrice;
    const payout = won ? Number((trade.amount * config.DEFAULT_MULTIPLIER).toFixed(4)) : 0;

    trade.status = 'SETTLED';
    trade.exitPrice = latest;
    trade.won = won;
    trade.payout = payout;
    trade.settledAt = Date.now();

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

    cache.pushHistory(trade.userAddr, event);
    this.io.to(trade.userAddr).emit('trade_settled', event);
    this.io.emit('trade_settled', event);

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
      privyUserId: trade.privyUserId || null,
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
        // complete job
        const idx = cache.payoutQueue.findIndex(j => j.jobId === job.jobId);
        if (idx !== -1) cache.payoutQueue.splice(idx, 1);
      }
    } finally {
      this.payoutQueueProcessing = false;
    }
  }
}

module.exports = ClassicEngine;

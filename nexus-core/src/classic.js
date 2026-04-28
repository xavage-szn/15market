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
    
    // Trade Monitor: High-frequency authoritative pulse to drive the UI
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status === 'PENDING') {
          const msLeft = (trade.settleAt || 0) - now;
          const timeLeft = Math.max(0, msLeft / 1000);
          const currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          const direction = this.resolveDirection(trade.direction);
          const isUp = direction === 1;
          const isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;

          // Push authoritative state to frontend
          this.io.to(trade.userAddr).emit('trade_tick', {
            betId: trade.id,
            timeLeft,
            currentPrice,
            isWinning,
            direction: direction // Ensure frontend knows resolved direction
          });

          // LOCK RESULT: At the exact moment of backend expiration, freeze and notify
          if (timeLeft <= 0 && !trade.expiryEmitted) {
            trade.expiryEmitted = true;
            this.io.to(trade.userAddr).emit('trade_expired', {
              betId: trade.id,
              exitPrice: currentPrice,
              won: isWinning,
              direction: direction
            });
            console.log(`[Trade-Monitor] Authority Locked #${trade.id} | ${isUp ? 'UP' : 'DOWN'} | Entry: ${trade.entryPrice} | Exit: ${currentPrice} | Won: ${isWinning}`);
          }
        }
      }
    }, 200);

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

  resolveDirection(dir) {
    if (dir === 1 || dir === '1' || String(dir).toUpperCase() === 'UP' || String(dir).toLowerCase() === 'buy') return 1;
    if (dir === 0 || dir === '0' || String(dir).toUpperCase() === 'DOWN' || String(dir).toLowerCase() === 'sell') return 0;
    return null;
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
    const treasury = config.TREASURY_ADDRESS;
    if (!treasury || treasury === ethers.ZeroAddress) {
      return { success: false, error: "Treasury address not configured on backend." };
    }

    // Derive Session Wallet (EOA)
    const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_super_secure_master_secret_key_v1";
    const entropy = ethers.toUtf8Bytes(MASTER_SECRET + userAddr);
    const privateKey = ethers.keccak256(entropy);
    const sessionWallet = new ethers.Wallet(privateKey, rpc.mainProvider);

    // Get or create in-process session
    let session = cache.sessions.get(userAddr);
    if (!session) {
      const balStr = await rpc.getBalance(sessionWallet.address);
      session = cache.getOrCreateSession(userAddr, {
        identityKey: userAddr,
        walletAddress: identity.walletAddress,
        sessionAddress: sessionWallet.address,
        balance: parseFloat(balStr) || 0,
      });
    }

    const amount = Number(tradeParams.amount);
    if (!Number.isFinite(amount) || amount <= 0) return { success: false, error: 'Invalid amount' };

    // Define trade parameters early so they are available for the contract call
    const id = tradeParams.id || `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const direction = this.resolveDirection(tradeParams.direction);
    if (direction === null) {
       console.error(`[Trade] Invalid direction received:`, tradeParams.direction);
       return { success: false, error: "Invalid trade direction." };
    }
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);

    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    
    // Authoritative Price Selection
    let entryPrice = Number(cache.prices[symbol] || 0);
    if (!entryPrice || entryPrice <= 0) {
      // Fallback to frontend price but unscale it based on asset type
      let fePrice = Number(tradeParams.entryPrice || 0);
      const isSol = Number(tradeParams.marketId) === 2;
      
      if (isSol) {
        // SOL scaling is 1,000,000 on frontend
        entryPrice = fePrice / 1000000;
      } else {
        // Others (ETH, BTC) are 100x scaled
        entryPrice = fePrice / 100;
      }
      console.log(`[Trade] Using fallback entryPrice: ${entryPrice} (Raw: ${fePrice}, isSol: ${isSol})`);
    }

    if (!entryPrice || entryPrice <= 0) {
      console.error(`[Trade] Price unavailable for ${symbol}. Rejected.`);
      return { success: false, error: 'Price feed unavailable' };
    }

    // 1. Perform REAL On-Chain Stake Transfer
    let stakeTxHash;
    try {
      const checksummedUserAddr = ethers.getAddress(userAddr);
      const checksummedTreasury = ethers.getAddress(treasury);

      // Check balance + gas margin (approx 0.002 USDC)
      const gasMargin = 0.002;
      if (session.balance < (amount + gasMargin)) {
        return { success: false, error: `Insufficient Balance. You need at least ${amount + gasMargin} USDC.` };
      }

      const numericId = BigInt(Date.now());
      
      try {
        console.log(`[Trade] Attempting contract stake via placeBet() for ${userAddr}`);
        const contract = new ethers.Contract(checksummedTreasury, [
          "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
        ], sessionWallet);

        // Standard scaling: direction (0=UP, 1=DOWN), price (8 decimals)
        const contractDir = direction === 1 ? 0 : 1; 
        const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);

        const tx = await contract.placeBet(
          numericId,
          contractDir,
          duration,
          contractPrice,
          marketId,
          checksummedUserAddr,
          { value: ethers.parseUnits(amount.toFixed(18), 18) }
        );
        stakeTxHash = tx.hash;
      } catch (contractErr) {
        console.warn(`[Trade] placeBet() failed, falling back to raw transfer:`, contractErr.message);
        // FALLBACK: If the contract reverts (e.g. ABI mismatch or internal error), 
        // perform a direct USDC transfer so the trade can still proceed.
        const tx = await sessionWallet.sendTransaction({
          to: checksummedTreasury,
          value: ethers.parseUnits(amount.toFixed(18), 18),
        });
        stakeTxHash = tx.hash;
      }
      
      tradeParams.id = numericId.toString(); 
      session.balance = Number((session.balance - amount).toFixed(4));
    } catch (err) {
      console.error(`[Trade] Stake transfer CRITICAL FAILURE for ${userAddr}:`, err.message);
      return { success: false, error: "Network Congested or RPC Error. (Check Session Balance)" };
    }

    // 2. Register Trade in Engine

    const trade = {
      id: String(id),
      userAddr: userAddr.toLowerCase(),
      walletAddress: session.walletAddress.toLowerCase(),
      sessionAddress: sessionWallet.address.toLowerCase(),
      direction,
      duration,
      marketId,
      amount,
      symbol,
      entryPrice,
      status: 'PENDING',
      stakeTxHash,
      treasury,
      createdAt: Date.now(),
      settleAt: Date.now() + (duration * 1000),
    };

    cache.trades.set(trade.id, trade);
    cache.queueTradeForSettlement(trade);

    // Emit trade placed event + updated balance to frontend
    this.io.to(userAddr).emit('trade_placed', {
      type: 'TRADE_PLACED',
      betId: trade.id,
      id: trade.id,
      amount,
      direction,
      symbol: symbol.toUpperCase(),
      entryPrice,
      duration,
      timestamp: trade.createdAt,
      settleAt: trade.settleAt,
      userAddr,
      txHash: stakeTxHash
    });

    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'STAKE_SENT',
      betId: trade.id,
      txHash: stakeTxHash
    });

    this.io.emit('new_trade', { betId: trade.id, direction, symbol: symbol.toUpperCase(), amount, userAddr });

    console.log(`[Trade] Active #${trade.id} | ${direction === 1 ? 'UP' : 'DOWN'} | $${amount} | TX: ${stakeTxHash}`);

    return {
      success: true,
      txHash: stakeTxHash,
      tradeId: trade.id,
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

      // PRIORITY SETTLEMENT: Identify winners vs losers to prioritize payout tasks
      const prioritizedDue = due.map(trade => {
        const exitPrice = cache.getHistoricalPrice(trade.symbol, trade.settleAt) || cache.prices[trade.symbol] || trade.entryPrice;
        const direction = this.resolveDirection(trade.direction);
        const won = (direction === 1) ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);
        return { trade, won };
      }).sort((a, b) => (b.won ? 1 : 0) - (a.won ? 1 : 0));

      for (let i = 0; i < prioritizedDue.length; i += config.SETTLEMENT_CONCURRENCY) {
        const chunk = prioritizedDue.slice(i, i + config.SETTLEMENT_CONCURRENCY);
        await Promise.allSettled(chunk.map((item) => this.settleTrade(item.trade)));
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  async settleTrade(trade) {
    if (trade.status !== 'PENDING') return;

    const userAddr = trade.userAddr.toLowerCase();

    // Use historical price at close time for stable settlement
    const exitPrice = cache.getHistoricalPrice(trade.symbol, trade.settleAt) || cache.prices[trade.symbol] || trade.entryPrice;
    
    const direction = this.resolveDirection(trade.direction);
    const isUp = direction === 1;
    
    // Won if price moved in direction. Tie is currently a loss as per platform rules.
    const won = isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);
    
    if (exitPrice === trade.entryPrice) {
      console.log(`[Settle] Trade ${trade.id} is a TIE at ${exitPrice}. Resulting in LOSS.`);
    }

    // MATCH FRONTEND MULTIPLIERS: 5s=2.90, 10s=2.40, others=1.90
    const multiplier = trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90);
    const payout = won ? Number((trade.amount * multiplier).toFixed(6)) : 0;

    console.log(`[Settle] Trade ${trade.id} (${trade.symbol} ${isUp ? 'UP' : 'DOWN'}): Entry=${trade.entryPrice}, Exit=${exitPrice} -> ${won ? 'WON' : 'LOST'} (Payout: ${payout})`);

    trade.status = won ? 'WON' : 'LOST';
    trade.exitPrice = exitPrice;
    trade.won = won;
    trade.payout = payout;
    trade.settledAt = Date.now();

    // INSTANT BALANCE SYNC: Deduct/Credit immediately for instant feel
    const session = cache.sessions.get(userAddr);
    if (session) {
      if (won) {
        // We'll sync from chain after payout, but let's update optimistically now
        session.balance = Number((session.balance + payout).toFixed(4));
      }
      this.io.to(userAddr).emit('balance_update', {
        balance: String(session.balance),
        reason: won ? 'WIN' : 'LOSS',
        betId: trade.id,
        payout: String(payout),
      });
    }

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
      userAddr,
      status: won ? 'WON' : 'LOST',
    };

    cache.pushHistory(userAddr, settledEvent);

    this.io.to(userAddr).emit('trade_settled', settledEvent);
    this.io.emit('trade_settled', settledEvent);

    // Sync session balance from on-chain after settlement
    setTimeout(async () => {
      try {
        const balStr = await rpc.getBalance(trade.sessionAddress || trade.userAddr);
        const session = cache.sessions.get(userAddr);
        if (session) {
          session.balance = parseFloat(balStr);
          this.io.to(userAddr).emit('balance_update', {
            balance: String(session.balance),
            reason: won ? 'WIN' : 'LOSS',
            betId: trade.id,
            payout: String(payout),
          });
        }
      } catch (e) {}
    }, 1500);

    if (won && payout > 0) {
      this.queuePayoutJob(trade);
    }
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

  async dispatchPayout(job, source) {
    const trade = cache.trades.get(job.tradeId);
    if (!trade || !trade.won || !['WON', 'SETTLED'].includes(trade.status)) {
      return { ok: false, error: 'Trade not eligible for payout' };
    }

    let payoutTxHash = null;
    try {
      const destination = ethers.getAddress(trade.sessionAddress || trade.userAddr);
      console.log(`[Payout] Sending ${job.amount} USDC winning to ${destination}`);
      
      const feeData = await rpc.mainProvider.getFeeData();
      const gasPrice = (feeData.gasPrice * 130n) / 100n; // 1.3x for payouts

      // Manual nonce to prevent collisions in fast batch
      if (!this.payoutNonce) {
        this.payoutNonce = await rpc.wallet.getNonce();
      }

      const tx = await rpc.wallet.sendTransaction({
        to: destination,
        value: ethers.parseUnits(Number(job.amount).toFixed(18), 18),
        gasPrice,
        nonce: this.payoutNonce
      });
      
      this.payoutNonce++; // Increment for next job
      payoutTxHash = tx.hash;
      console.log(`[Payout] TX Broadcasted: ${payoutTxHash}`);
    } catch (err) {
      console.error(`[Payout] Failed to send winnings for trade ${trade.id}:`, err.message);
      // Reset nonce on error to sync with chain on next attempt
      this.payoutNonce = null;
      job.status = 'QUEUED'; 
      return { ok: false, error: err.message };
    }

    trade.status = 'PAID';
    trade.paidAt = Date.now();
    trade.payoutTx = payoutTxHash;

    const payoutEvent = {
      type: 'PAYOUT_COMPLETED',
      betId: trade.id,
      payout: String(job.amount),
      source,
      timestamp: trade.paidAt,
      userAddr: trade.userAddr,
      txHash: payoutTxHash,
    };

    cache.pushHistory(trade.userAddr, payoutEvent);

    const session = cache.sessions.get(trade.userAddr);
    if (session) {
      // Refresh balance from chain to be sure
      const balStr = await rpc.getBalance(trade.sessionAddress || trade.userAddr);
      session.balance = parseFloat(balStr);

      this.io.to(trade.userAddr).emit('balance_update', {
        balance: String(session.balance),
        reason: 'WIN_PAYOUT',
        betId: trade.id,
        payout: String(job.amount),
        txHash: payoutTxHash,
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
      // Process payout transactions sequentially to avoid nonce issues
      for (const job of claimed) {
        await this.dispatchPayout(job, 'inline_fallback');
        const idx = cache.payoutQueue.findIndex(j => j.jobId === job.jobId);
        if (idx !== -1) cache.payoutQueue.splice(idx, 1);
      }
    } finally {
      this.payoutQueueProcessing = false;
    }
  }
}

module.exports = ClassicEngine;

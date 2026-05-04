// ==================================================================================
// CLASSIC TRADING ENGINE (CORE SETTLEMENT LAYER)
// ==================================================================================
// This engine is responsible for the entire lifecycle of a "Classic" trade:
// 1. MONITORING: Ultra-high frequency polling to track trade progress and lock results.
// 2. EXECUTION: Direct interaction with the Treasury contract for stake placement.
// 3. SETTLEMENT: Calculating wins/losses and managing the payout queue.
// 4. BATCH PAYOUTS: Optimizing gas by batching winning payouts into unified transactions.
// ==================================================================================
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
    this.payoutNonce = null;
    this.lastNonceSync = 0;
  }

  start() {
    /**
     * SETTLEMENT BATCH PROCESSOR (50ms Pulse)
     * ----------------------------------------
     * Periodically checks the settlement queue and executes winning payouts.
     * High frequency ensures users receive their funds as soon as the trade expires.
     */
    setInterval(() => this.processSettlementBatch(), 50);
    
    /**
     * OPERATOR LIQUIDITY MONITOR
     * --------------------------
     * Ensures the backend "Operator" wallet always has enough gas to pay out winners.
     * Threshold: 10 USDC | Refill: 100 USDC (from Treasury)
     */
    setInterval(() => this.ensureOperatorFunded(), 15000);

    /**
     * ULTRA-HIGH FREQUENCY TRADE MONITOR (50ms Pulse)
     * ------------------------------------------------
     * This is the "Heartbeat" of the trading engine.
     * - Broadcasts 'trade_tick' to the specific user's socket (timeLeft, currentPrice, isWinning).
     * - LOCKS the result at the exact millisecond of expiry (timeLeft <= 0).
     * 
     * IMPACT IF BUGGED: If this stops, trades will never expire and users will never get paid.
     */
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status === 'PENDING') {
          const msLeft = (trade.settleAt || 0) - now;
          const timeLeft = Math.max(0, msLeft / 1000);
          const direction = this.resolveDirection(trade.direction);
          const isUp = direction === 1;
          
          if (trade.expiryEmitted) continue;

          let currentPrice, isWinning;
          // Authority: Internal cache price is used for the tick
          currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
          
          // Real-time UI updates
          this.io.to(trade.userAddr).emit('trade_tick', {
            betId: trade.id,
            timeLeft,
            currentPrice,
            isWinning,
            direction: direction
          });

          // PRECISE BOUNDARY CAPTURE
          // When time runs out, we handover the trade to the lockResult logic.
          if (timeLeft <= 0) {
            this.lockResult(trade);
          }
        }
      }
    }, 50);

    // Fallback payout mechanism if batching is disabled/fails
    if (config.PAYOUT_INLINE_FALLBACK) {
      setInterval(() => this.processInlinePayoutBatch(), 1000);
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
   * DETERMINISTIC RESULT LOCKING
   * ----------------------------
   * Freezes the trade outcome based on historical price data at the exact moment of expiry.
   * Rationale: Prevents UI flicker or result manipulation if the price moves immediately after expiry.
   */
  lockResult(trade) {
    if (trade.expiryEmitted) return;
    
    // Official Settlement Price: We lookup the price at the exact settleAt timestamp from our cache
    // We add a tiny buffer (100ms) to ensure we get the most accurate 'at-the-close' price.
    const targetTime = trade.settleAt;
    const exitPrice = cache.getHistoricalPrice(trade.symbol, targetTime) || cache.prices[trade.symbol] || trade.entryPrice;
    
    const direction = this.resolveDirection(trade.direction);
    const isUp = direction === 1;
    
    // Tie Case: In binary options, a tie (price remains exactly the same) is typically a loss for the player.
    const won = isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);

    trade.expiryEmitted = true;
    trade.lockedExitPrice = exitPrice;
    trade.lockedWon = won;

    // Immediate notification to the specific user's device
    this.io.to(trade.userAddr).emit('trade_expired', {
      betId: trade.id,
      exitPrice,
      won,
      direction: direction
    });
    console.log(`[Trade-Monitor] Authority Result Locked #${trade.id} | Won: ${won} | Price: ${exitPrice}`);
    
    // Instantly settle lost trades to bypass the settlement queue delay, 
    // since they don't require any on-chain payout processing.
    if (!won) {
      this.settleTrade(trade);
    }
  }

  async placeTrade(tradeParams, identityPayload) {
    const identity = this.resolveSessionIdentity(identityPayload);
    if (!identity.ok) return { success: false, error: identity.error };

    const userAddr = identity.identityKey;
    const existing = cache.trades.get(String(tradeParams.id));
    if (existing) {
      console.warn(`[Trade] Blocked duplicate trade request for ID: ${tradeParams.id}`);
      return { success: true, trade: existing, alreadyExists: true };
    }
    const treasury = config.TREASURY_ADDRESS;
    if (!treasury || treasury === ethers.ZeroAddress) {
      return { success: false, error: "Treasury address not configured on backend." };
    }

    const sessionWallet = rpc.deriveSessionWallet(userAddr);

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

    const id = tradeParams.id || `${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    const direction = this.resolveDirection(tradeParams.direction);
    if (direction === null) return { success: false, error: "Invalid trade direction." };
    
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);

    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    
    let entryPrice = Number(cache.prices[symbol] || 0);
    if (!entryPrice || entryPrice <= 0) {
      let fePrice = Number(tradeParams.entryPrice || 0);
      entryPrice = Number(tradeParams.marketId) === 2 ? fePrice / 1000000 : fePrice / 100;
    }

    if (!entryPrice || entryPrice <= 0) return { success: false, error: 'Price feed unavailable' };

    let stakeTxHash;
    try {
      const checksummedUserAddr = ethers.getAddress(userAddr);
      const checksummedTreasury = ethers.getAddress(treasury);
      const gasMargin = 0.002;

      if (session.balance < (amount + gasMargin)) {
        return { success: false, error: `Insufficient Balance. You need at least ${amount + gasMargin} USDC.` };
      }

      // AUTHORITY: Respect the trade ID from the frontend if it's a valid numeric string.
      // This ensures that the frontend's optimistic trade ID matches the backend's authoritative ID,
      // preventing duplication during the reconciliation phase.
      let numericId;
      if (tradeParams.id && /^\d+$/.test(tradeParams.id)) {
        numericId = BigInt(tradeParams.id);
      } else {
        numericId = BigInt(Date.now()) * 1000n + BigInt(Math.floor(Math.random() * 1000));
      }
      
      const tradeIdString = numericId.toString();
      tradeParams.id = tradeIdString; 
      session.balance = Number((session.balance - amount).toFixed(4));
      
      try {
        const checksummedUserAddr = ethers.getAddress(userAddr);
        const checksummedTreasury = ethers.getAddress(treasury);
        
        const contract = new ethers.Contract(checksummedTreasury, [
          "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
        ], sessionWallet);

        const contractDir = direction === 1 ? 0 : 1; 
        const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
        const feeData = await rpc.mainProvider.getFeeData();
        const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 11n / 10n;

        const tx = await contract.placeBet(numericId, contractDir, duration, contractPrice, marketId, checksummedUserAddr, { 
          value: ethers.parseUnits(amount.toFixed(18), 18),
          gasPrice,
          gasLimit: 300000 
        });
        stakeTxHash = tx.hash;
      } catch (contractErr) {
        console.warn(`[Trade] Falling back to raw transfer:`, contractErr.message);
        const feeData = await rpc.mainProvider.getFeeData();
        const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 11n / 10n;
        const tx = await sessionWallet.sendTransaction({
          to: ethers.getAddress(treasury),
          value: ethers.parseUnits(amount.toFixed(18), 18),
          gasPrice,
          gasLimit: 100000
        });
        stakeTxHash = tx.hash;
      }
    } catch (err) {
      console.error(`[Trade] Stake transfer CRITICAL FAILURE:`, err.message);
      return { success: false, error: "Network Congested or RPC Error. (Check Session Balance)" };
    }

    const trade = {
      id: tradeParams.id,
      userAddr: userAddr.toLowerCase(),
      walletAddress: session.walletAddress ? session.walletAddress.toLowerCase() : userAddr.toLowerCase(),
      sessionAddress: session.sessionAddress ? session.sessionAddress.toLowerCase() : sessionWallet.address.toLowerCase(),
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

    this.io.to(userAddr).emit('trade_placed', {
      type: 'TRADE_PLACED',
      betId: trade.id,
      amount,
      direction,
      symbol: symbol.toUpperCase(),
      entryPrice,
      duration,
      timestamp: trade.createdAt,
      settleAt: trade.settleAt,
      txHash: stakeTxHash
    });

    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'STAKE_SENT',
      betId: trade.id,
    });

    // Global emit for Admin Portal & Public Scrollers
    const publicTrade = {
      id: trade.id,
      betId: trade.id,
      userAddr: trade.userAddr,
      direction: trade.direction,
      symbol: symbol.toUpperCase(),
      amount: trade.amount,
      entryPrice: trade.entryPrice,
      status: trade.status,
      timestamp: trade.createdAt,
      settleAt: trade.settleAt
    };
    this.io.emit('trade_detected', publicTrade);
    this.io.emit('new_trade', { betId: trade.id, direction, symbol: symbol.toUpperCase(), amount, userAddr });
    
    return {
      success: true,
      txHash: stakeTxHash,
      tradeId: trade.id,
      newBalance: String(session.balance),
    };
  }

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

    // Safety: Force lock if not already done by monitor
    if (!trade.expiryEmitted) {
      this.lockResult(trade);
    }

    const userAddr = trade.userAddr.toLowerCase();
    const exitPrice = trade.lockedExitPrice;
    const won = trade.lockedWon;

    const multiplier = trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90);
    const payout = won ? Number((trade.amount * multiplier).toFixed(6)) : 0;

    trade.status = won ? 'WON' : 'LOST';
    trade.exitPrice = exitPrice;
    trade.won = won;
    trade.payout = payout;
    trade.settledAt = Date.now();

    const session = cache.sessions.get(userAddr);
    if (session) {
      if (won) {
        session.balance = Number((session.balance + payout).toFixed(4));
        session.lastWinAt = Date.now();
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
      won,
      payout: String(payout),
      amount: trade.amount, // Stake amount
      direction: trade.direction,
      duration: trade.duration,
      entryPrice: trade.entryPrice,
      exitPrice,
      settlementPrice: exitPrice, // Alias for receipt components
      symbol: trade.symbol.toUpperCase(),
      timestamp: trade.settledAt || Date.now(),
      status: trade.status,
      tx: trade.stakeTxHash, // Persist the stake transaction hash
    };

    cache.pushHistory(userAddr, settledEvent);
    this.io.to(userAddr).emit('trade_settled', settledEvent);
    
    // Global emit for Admin Portal (filtered to hide specific user payouts)
    this.io.emit('global_trade_settled', { 
      betId: trade.id, 
      symbol: trade.symbol.toUpperCase(), 
      won, 
      amount: trade.amount 
    });

    if (won && payout > 0) {
      this.queuePayoutJob(trade);
    }
  }

  queuePayoutJob(trade) {
    this.payoutJobCounter += 1;
    // CRITICAL: Winnings MUST go to the session wallet (EOA), not the main wallet.
    const derivedSession = rpc.deriveSessionWallet(trade.userAddr);
    const destination = derivedSession ? derivedSession.address : trade.sessionAddress;

    cache.payoutQueue.push({
      jobId: `payout_${trade.id}_${this.payoutJobCounter}`,
      tradeId: trade.id,
      userAddr: trade.userAddr,
      sessionAddress: destination, 
      amount: trade.payout,
      queuedAt: Date.now(),
      status: 'QUEUED',
    });
  }

  async processInlinePayoutBatch() {
    if (this.payoutQueueProcessing) return;
    this.payoutQueueProcessing = true;

    try {
      // 1. Group payouts by user to batch multiple wins into a single transaction
      const userBatches = {};
      const processedJobIds = new Set();

      for (const job of cache.payoutQueue) {
        if (job.status !== 'QUEUED') continue;
        const addr = job.userAddr.toLowerCase();
        
        // PRIORITY: Always send to the session address if available.
        let dest = job.sessionAddress;
        if (!dest) {
          const derived = rpc.deriveSessionWallet(addr);
          dest = derived ? derived.address : addr;
        }
        dest = dest.toLowerCase();
        
        if (!userBatches[dest]) userBatches[dest] = { total: 0, jobs: [], userAddr: addr };
        userBatches[dest].total += Number(job.amount);
        userBatches[dest].jobs.push(job);
        job.status = 'CLAIMED';
      }

      const users = Object.keys(userBatches);
      if (users.length === 0) return;

      // 2. Proactive Nonce Synchronization
      if (this.payoutNonce === null || (Date.now() - this.lastNonceSync > 30000)) {
        this.payoutNonce = await rpc.mainProvider.getTransactionCount(rpc.wallet.address, 'pending');
        this.lastNonceSync = Date.now();
      }

      // 3. Dispatch Batch Payouts
      for (const dest of users) {
        const batch = userBatches[dest];
        try {
          const txHash = await this.dispatchBatchPayout(dest, batch.total, batch.jobs, batch.userAddr);
          if (txHash) {
             // Successfully sent
             batch.jobs.forEach(j => processedJobIds.add(j.jobId));
          } else {
             batch.jobs.forEach(j => { j.status = 'QUEUED'; });
          }
        } catch (err) {
          console.error(`[Payout] Batch failed for ${dest}:`, err.message);
          batch.jobs.forEach(j => { j.status = 'QUEUED'; });
          this.payoutNonce = null; // Forces re-sync on next loop
        }
      }

      // Cleanup processed jobs from queue
      cache.payoutQueue = cache.payoutQueue.filter(j => !processedJobIds.has(j.jobId));

    } finally {
      this.payoutQueueProcessing = false;
    }
  }

  async dispatchBatchPayout(destinationAddr, totalAmount, jobs, userAddr) {
    const destination = ethers.getAddress(destinationAddr);
    console.log(`[Payout] Dispatching BATCH win (${totalAmount.toFixed(4)} USDC) to ${destination} (${jobs.length} trades)`);

    try {
      const feeData = await rpc.mainProvider.getFeeData();
      const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 11n / 10n;

      const tx = await rpc.wallet.sendTransaction({
        to: destination,
        value: ethers.parseUnits(totalAmount.toFixed(18), 18),
        gasPrice,
        nonce: this.payoutNonce,
        gasLimit: 120000
      });

      const txHash = tx.hash;
      this.payoutNonce++;
      
      // Update job states and broadcast
      jobs.forEach(job => {
        const trade = cache.trades.get(job.tradeId);
        if (trade) {
          trade.status = 'PAID';
          trade.payoutTx = txHash;
          trade.paidAt = Date.now();
        }
        
        // Update history persistence
        const profiles = require('./profiles');
        profiles.updateTrade(userAddr, job.tradeId, { payoutTx: txHash, status: 'PAID' });

        this.io.to(userAddr).emit('payout_completed', {
          type: 'PAYOUT_COMPLETED',
          betId: job.tradeId,
          payout: String(job.amount),
          txHash: txHash,
        });
      });

      // Chain confirmation sync: Ensure balance is updated both in memory and on UI after confirmation
      tx.wait().then(async () => {
        try {
          const balStr = await rpc.getBalance(destination);
          const session = cache.sessions.get(userAddr);
          if (session) {
            session.balance = parseFloat(balStr);
            const totalPayout = jobs.reduce((sum, j) => sum + parseFloat(j.amount), 0);
            
            this.io.to(userAddr).emit('balance_update', { 
              balance: String(session.balance), 
              reason: 'WIN_PAYOUT_SETTLED',
              txHash: txHash,
              payout: String(totalPayout),
              betId: jobs[0].tradeId // Reference at least one trade for the receipt link
            });
            console.log(`[Payout] Sync complete for ${userAddr}. New balance: ${session.balance}, Total Payout: ${totalPayout}`);
          }
        } catch (syncErr) {
          console.error(`[Payout] Sync error for ${userAddr}:`, syncErr.message);
        }
      }).catch((e) => {
        console.error(`[Payout] Tx confirmation failed for ${userAddr}:`, e.message);
      });

      return txHash;
    } catch (err) {
      console.error(`[Payout] Transaction failed:`, err.message);
      throw err;
    }
  }

  async ensureOperatorFunded() {
    try {
      const operatorAddr = rpc.wallet.address;
      const balWei = await rpc.mainProvider.getBalance(operatorAddr);
      const bal = parseFloat(ethers.formatEther(balWei));

      // Threshold: 10 USDC (as requested)
      if (bal < 10) {
        console.log(`⚠️ [Refill] Operator balance low (${bal} USDC). Refilling 100 USDC...`);
        const treasuryAddr = config.TREASURY_ADDRESS;
        const contract = new ethers.Contract(treasuryAddr, ["function withdraw(uint256 _amount) external"], rpc.wallet);

        const refillAmount = ethers.parseUnits("100", 18);
        const feeData = await rpc.mainProvider.getFeeData();
        const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 2n;

        const tx = await contract.withdraw(refillAmount, { gasPrice, gasLimit: 100000 });
        await tx.wait();
        console.log("✅ [Refill] Operator wallet refilled with 100 USDC.");
        this.payoutNonce = null; 
      }
    } catch (err) {
      console.error("[Refill] Failed:", err.message);
    }
  }
}

module.exports = ClassicEngine;

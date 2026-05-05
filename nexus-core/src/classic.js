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

    // AUTHORITATIVE TREASURY ABI (Arc Native)
    this.TREASURY_ABI = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice) external",
      "function withdraw(uint256 _amount) external",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    // Initialize operator instance of the contract for settlements
    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
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
          // Authority: Internal cache price is used for the tick.
          // We also snapshot it here to maximise history resolution
          // (especially critical in the final seconds before expiry).
          currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          if (currentPrice > 0) cache.snapshotPrice(trade.symbol);
          isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
          
          // PRECISE BOUNDARY CAPTURE
          // When time runs out, we handover the trade to the lockResult logic.
          if (timeLeft <= 0) {
            this.lockResult(trade);
          } else {
            // Real-time UI updates (Only while active)
            this.io.to(trade.userAddr).emit('trade_tick', {
              betId: trade.id,
              timeLeft,
              currentPrice,
              isWinning,
              direction: direction
            });
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
    
    // Official Settlement Price:
    // 1. Try to find the price in our dense history buffer closest to trade.settleAt.
    // 2. If the gap is too large (> 3s), getHistoricalPrice falls back to the latest
    //    snapshot — which is at most 250ms old and represents the last known price.
    // 3. Final fallback: cache.prices (1s resolution REST poll).
    const targetTime = trade.settleAt;
    const exitPrice =
      cache.getHistoricalPrice(trade.symbol, targetTime) ||
      cache.getLatestPrice(trade.symbol) ||
      cache.prices[trade.symbol] ||
      trade.entryPrice;
    
    const direction = this.resolveDirection(trade.direction);
    const isUp = direction === 1;
    
    // Tie Case: In binary options, a tie (price remains exactly the same) is typically a loss for the player.
    const won = isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);

    trade.status = 'RESOLVING'; // AUTHORITY: Take it out of the PENDING monitor loop instantly
    trade.expiryEmitted = true;
    trade.lockedExitPrice = exitPrice;
    trade.lockedWon = won;

    // Immediate notification to the specific user's device
    this.io.to(trade.userAddr).emit('trade_expired', {
      betId: trade.id,
      exitPrice,
      won,
      direction: direction,
      status: 'RESOLVING'
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
          
          const contract = new ethers.Contract(checksummedTreasury, this.TREASURY_ABI, sessionWallet);
  
          const contractDir = direction === 1 ? 0 : 1; 
          const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
          const feeData = await rpc.mainProvider.getFeeData();
          const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 11n / 10n;
  
          // AUTHORITY: Restore the original payout address logic.
          // The Treasury contract records the main wallet as the beneficiary,
          // but the backend forwards winnings to the session wallet for speed.
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

    // Real-time notification to the engine's observer (Admin Portal)
    if (this.onUpdate) this.onUpdate();

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
    if (trade.status !== 'PENDING' && trade.status !== 'RESOLVING') return;

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

    const fee = (parseFloat(trade.amount) * 0.01).toFixed(6); // 1% Platform Fee

    const settledEvent = {
      type: 'TRADE_SETTLED',
      betId: trade.id,
      won,
      payout: String(payout),
      amount: trade.amount, // Stake amount
      fee: fee,
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
    
    // Real-time notification to the engine's observer (Admin Portal)
    if (this.onUpdate) this.onUpdate();

    // Global emit for Admin Portal (filtered to hide specific user payouts)
    this.io.emit('global_trade_settled', { 
      betId: trade.id, 
      symbol: trade.symbol.toUpperCase(), 
      won, 
      amount: trade.amount,
      payout: String(payout),
      exitPrice: exitPrice,
      status: trade.status
    });

    // AUTHORITY: Restore the Payout Queue mechanism.
    // This uses the Root Wallet (Gas Tank) to send funds, refilling from the Treasury instantly.
    if (won && payout > 0) {
      this.queuePayoutJob(trade);
    }
  }

  queuePayoutJob(trade) {
    this.payoutJobCounter += 1;
    // CRITICAL: Winnings go to the session wallet (EOA) to allow seamless trading.
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
      const jobs = cache.payoutQueue.filter(j => j.status === 'QUEUED').slice(0, 50);
      if (jobs.length === 0) return;

      console.log(`[Payout] Processing ${jobs.length} inline payouts...`);
      for (const job of jobs) {
        job.status = 'PROCESSING';
        await this.dispatchBatchPayout(job.sessionAddress, job.amount, [job], job.userAddr);
        job.status = 'COMPLETED';
      }
    } catch (e) {
      console.error("[Payout] Inline processing error:", e);
    } finally {
      this.payoutQueueProcessing = false;
    }
  }

  async processSettlementBatch() {
    if (this.queueProcessing) return;
    this.queueProcessing = true;

    try {
      const pending = Array.from(cache.trades.values())
        .filter((trade) => trade.status === 'WON' && !trade.payoutTx)
        .slice(0, 50);

      if (pending.length === 0) return;

      // Group by user for batch payout
      const userBatches = {};
      for (const trade of pending) {
        const dest = trade.sessionAddress || trade.userAddr;
        if (!userBatches[dest]) userBatches[dest] = { trades: [], total: 0 };
        userBatches[dest].trades.push(trade);
        userBatches[dest].total += trade.payout;
      }

      for (const [dest, batch] of Object.entries(userBatches)) {
        await this.dispatchBatchPayout(dest, batch.total, batch.trades, batch.trades[0].userAddr);
      }

    } catch (e) {
      console.error('[Settlement] Batch error:', e);
    } finally {
      this.queueProcessing = false;
    }
  }

  async dispatchBatchPayout(destinationAddr, totalAmount, jobs, userAddr) {
    try {
      // 1. Sync Nonce
      if (!this.payoutNonce || (Date.now() - this.lastNonceSync > 30000)) {
        this.payoutNonce = await rpc.wallet.getNonce('pending');
        this.lastNonceSync = Date.now();
      }

      const destination = ethers.getAddress(destinationAddr);
      const withdrawAmount = ethers.parseUnits(totalAmount.toFixed(18), 18);
      
      console.log(`[Payout] Syncing Treasury: Withdrawing ${totalAmount.toFixed(4)} USDC for payout to ${destination}`);

      const feeData = await rpc.mainProvider.getFeeData();
      const gasPrice = (feeData.gasPrice || ethers.parseUnits("50", "gwei")) * 12n / 10n;

      // 2. INSTANT TREASURY SYNC: Withdraw the exact win amount from the Treasury Contract.
      // This ensures the Treasury balance decreases for EVERY win.
      try {
        const withdrawTx = await this.treasuryContract.withdraw(withdrawAmount, {
          gasPrice,
          nonce: this.payoutNonce++,
          gasLimit: 150000
        });
        await withdrawTx.wait();
        console.log(`✅ [Treasury] Successfully withdrawn ${totalAmount.toFixed(4)} USDC.`);
      } catch (withdrawErr) {
        console.error(`❌ [Treasury] Withdrawal failed:`, withdrawErr.message);
        this.payoutNonce = null;
        return;
      }

      // 3. FORWARD FUNDS: Send the withdrawn amount from the Root Wallet to the User's Session Wallet.
      const tx = await rpc.wallet.sendTransaction({
        to: destination,
        value: withdrawAmount,
        gasPrice,
        nonce: this.payoutNonce++,
        gasLimit: 120000
      });

      console.log(`[Payout] Confirmed: ${tx.hash}`);

      // Notify clients
      for (const job of jobs) {
        const trade = cache.trades.get(job.tradeId || job.id);
        if (trade) {
          trade.status = 'SETTLED';
          trade.payoutTx = tx.hash;
          trade.chainConfirmed = true;
        }

        this.io.to(userAddr).emit('payout_completed', {
          tradeId: job.tradeId || job.id,
          amount: job.amount,
          tx: tx.hash
        });

        const session = cache.sessions.get(userAddr);
        if (session) {
          this.io.to(userAddr).emit('balance_update', {
            balance: String(session.balance),
            reason: 'WIN_SETTLED',
            betId: job.tradeId || job.id,
            txHash: tx.hash
          });
        }
      }

    } catch (e) {
      console.error(`[Payout] Failed batch to ${destinationAddr}:`, e.message);
      this.payoutNonce = null;
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

// ==================================================================================
// CLASSIC TRADING ENGINE (DIRECT ON-CHAIN SETTLEMENT)
// ==================================================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');
const crypto = require('crypto');

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this.settlementProcessing = false;
    this.payoutNonce = null;
    this.lastNonceSync = 0;

    // AUTHORITATIVE ARC-NATIVE ABI
    this.TREASURY_ABI = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice, uint256 _payoutAmount) external",
      "function withdraw(uint256 _amount) external",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
  }

  start() {
    // 1. Authoritative Settlement Pulse — 25ms for faster payouts
    setInterval(() => this.processSettlementBatch(), 25);
    
    // 2. Gas Monitor (Ensures Root Wallet can pay for settleBet gas)
    setInterval(() => this.ensureOperatorFunded(), 15000);

    // 3. Trade Monitor & Result Locking
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status === 'PENDING') {
          const msLeft = (trade.settleAt || 0) - now;
          const timeLeft = Math.max(0, msLeft / 1000);
          
          if (trade.expiryEmitted) continue;

          // Snapshot the price right before expiry to ensure high-res history coverage
          const currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          if (msLeft < 500 && currentPrice > 0) cache.snapshotPrice(trade.symbol);
          
          if (msLeft <= 0) {
            // AUTHORITATIVE LOCK: Once msLeft hits 0, the result is calculated and frozen.
            this.lockResult(trade);
          } else {
            const isUp = this.resolveDirection(trade.direction) === 1;
            const isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
            this.io.to(trade.userAddr).emit('trade_tick', {
              betId: trade.id,
              timeLeft,
              currentPrice,
              isWinning,
              direction: trade.direction
            });
          }
        }
      }
    }, 50);
  }

  normalizeAddr(addr) { return String(addr || '').toLowerCase(); }

  /**
   * Resolves the canonical user identity from a session init request payload.
   * Accepts { address } or { walletAddress } as the primary identity key.
   * Returns { ok, identityKey, walletAddress } on success or { ok: false, error } on failure.
   */
  resolveSessionIdentity(body) {
    const raw = body.address || body.walletAddress || body.userAddress;
    if (!raw) return { ok: false, error: 'Missing address in request body' };
    const identityKey = this.normalizeAddr(raw);
    if (!identityKey || identityKey.length < 10) {
      return { ok: false, error: 'Invalid address format' };
    }
    return { ok: true, identityKey, walletAddress: identityKey };
  }

  resolveDirection(dir) {
    if (dir === 1 || dir === '1' || String(dir).toUpperCase() === 'UP') return 1;
    if (dir === 0 || dir === '0' || String(dir).toUpperCase() === 'DOWN') return 0;
    return null;
  }

  lockResult(trade) {
    if (trade.expiryEmitted || trade.isSettled) return;
    trade.isSettled = true; // Absolute idempotency lock
    
    // AUTHORITATIVE EXIT PRICE RESOLUTION:
    // Priority: 1) historical buffer near expiry, 2) live cache, 3) entryPrice (last resort).
    // If cache.prices is 0 (stale feed), falling back to entryPrice would ALWAYS
    // produce a loss (exit == entry → no direction change). We use the historical
    // buffer to find the best available price at expiry instead.
    let exitPrice = 0;
    const history = cache.priceHistory[trade.symbol];
    if (history && history.length > 0) {
      // Find the most recent snapshot within 2s of now
      const now = Date.now();
      for (let i = history.length - 1; i >= Math.max(0, history.length - 12); i--) {
        if (history[i].price > 0 && Math.abs(history[i].time - now) < 2000) {
          exitPrice = history[i].price;
          break;
        }
      }
    }
    // Fallback to live cache
    if (exitPrice <= 0) exitPrice = cache.prices[trade.symbol] || 0;
    // Final fallback: use entryPrice only if no other source is available
    if (exitPrice <= 0) exitPrice = trade.entryPrice;
    
    // SAFETY: If exitPrice is suspiciously far from entryPrice (>30%), clamp it
    // to prevent price feed corruption from producing false results
    if (trade.entryPrice > 0 && exitPrice > 0) {
      const deviation = Math.abs(exitPrice - trade.entryPrice) / trade.entryPrice;
      if (deviation > 0.30) {
        console.warn(`[Engine] Exit price deviates ${ (deviation * 100).toFixed(1) }% from entry for #${trade.id}. Using entryPrice.`);
        exitPrice = trade.entryPrice;
      }
    }
    
    const isUp = this.resolveDirection(trade.direction) === 1;
    const won = isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);

    // FREEZE STATE: Once status moves to RESOLVING, lockedExitPrice and lockedWon are final.
    trade.status = 'RESOLVING';
    trade.expiryEmitted = true;
    trade.lockedExitPrice = exitPrice;
    trade.lockedWon = won;

    this.io.to(trade.userAddr).emit('trade_expired', {
      betId: trade.id,
      exitPrice,
      won,
      status: 'RESOLVING'
    });
    
    console.log(`[Engine] Result Locked #${trade.id} | Won: ${won} | Entry: ${trade.entryPrice} | Exit: ${exitPrice} | Dir: ${trade.direction}`);
    
    // Lost trades are settled immediately locally
    if (!won) {
      this.settleTradeLocally(trade);
    }
  }

  async placeTrade(tradeParams, identityPayload) {
    const userAddr = this.normalizeAddr(identityPayload.address);
    const sessionWallet = rpc.deriveSessionWallet(userAddr);

    // ── STRICT INPUT VALIDATION ──────────────────────────────────────────
    const rawAmount = tradeParams.amount;
    const amount = Number(rawAmount);
    if (!rawAmount || isNaN(amount) || amount <= 0) {
      return { success: false, error: `Invalid trade amount: "${rawAmount}"` };
    }
    if (amount < 0.001) {
      return { success: false, error: 'Minimum trade amount is 0.001 USDC' };
    }
    
    // STRICT IDEMPOTENCY: Ensure ID is always unique, even if frontend fails or duplicates arrive concurrently.
    let generatedId = Date.now().toString() + crypto.randomInt(100000, 999999).toString();
    const rawId = tradeParams.id && /^\d+$/.test(String(tradeParams.id)) ? String(tradeParams.id) : generatedId;
    const numericId = BigInt(rawId);
    
    const direction = this.resolveDirection(tradeParams.direction);
    if (direction === null) {
      return { success: false, error: `Invalid direction: "${tradeParams.direction}"` };
    }
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Math.max(0, Number(tradeParams.marketId || 0));
    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';

    // Entry price: prefer live cache over frontend-provided value
    // Frontend scales SOL differently, so only use frontend price as fallback
    let entryPrice = Number(cache.prices[symbol]);
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      entryPrice = Number(tradeParams.entryPrice);
    }
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      return { success: false, error: 'Price feed not available. Please wait and retry.' };
    }

    // Dynamic Odds Share Price Lookup
    const currentOdds = cache.liveOdds?.[symbol]?.[duration];
    let sharePrice = 0.50; // fallback
    if (currentOdds) {
      sharePrice = direction === 1 ? currentOdds.LONG : currentOdds.SHORT;
    }
    // Ensure sharePrice is sane (never 0 or 1 which would cause division errors)
    sharePrice = Math.max(0.03, Math.min(0.97, sharePrice));

    // ── SANITIZE VALUES FOR CHAIN CALLS ──────────────────────────────────
    // These must never be NaN or scientific notation
    const safeEntryPrice = Math.max(0, entryPrice);
    const contractPrice = ethers.parseUnits(safeEntryPrice.toFixed(8), 8);
    
    // Sanitize amount to exactly 6 decimal places as a string to avoid scientific notation
    const safeAmountStr = amount.toFixed(6);
    // Verify parseEther will not throw
    let stakeWei;
    try {
      stakeWei = ethers.parseEther(safeAmountStr);
    } catch (e) {
      return { success: false, error: `Invalid amount format: ${e.message}` };
    }

    try {
      const contract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, sessionWallet);
      const contractDir = direction === 1 ? 0 : 1; 
      
      let tx;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          tx = await contract.placeBet(numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address, { 
            value: stakeWei,
            gasLimit: 400000 
          });
          break; // Success
        } catch (err) {
          const isRateLimit = err.message && (err.message.includes('coalesce') || err.message.includes('limit') || err.message.includes('429') || err.message.includes('fetch') || err.message.includes('timeout'));
          if (isRateLimit && attempt < 5) {
            console.log(`[Rate Limit] Retrying placeBet #${numericId}... (Attempt ${attempt})`);
            await new Promise(r => setTimeout(r, 1000 * attempt)); // Exponential-ish backoff
            continue;
          }
          throw err;
        }
      }

      // Store trade optimistically with PENDING status, but do NOT deduct balance yet.
      // Balance is deducted only after on-chain confirmation to prevent phantom deductions.
      const trade = {
        id: numericId.toString(),
        userAddr,
        sessionAddress: sessionWallet.address.toLowerCase(),
        direction,
        duration,
        marketId,
        amount,
        symbol,
        entryPrice,
        sharePrice,
        status: 'PENDING',
        stakeTxHash: tx.hash,
        createdAt: Date.now(),
        settleAt: Date.now() + (duration * 1000),
        settleRetries: 0,
      };

      cache.trades.set(trade.id, trade);

      // WAIT FOR ON-CHAIN CONFIRMATION before deducting balance.
      // This prevents the "stake deducted but trade invalid" bug where a reverted
      // placeBet tx leaves the user with reduced balance and no active trade.
      const receipt = await tx.wait();
      if (!receipt || receipt.status !== 1) {
        cache.trades.delete(trade.id);
        throw new Error("PlaceBet transaction reverted on-chain");
      }

      // ✅ CONFIRMED — Now safe to deduct from session balance
      const session = cache.sessions.get(userAddr);
      if (session) {
          session.balance = Number((session.balance - amount).toFixed(6));
          session.lastTradeAt = Date.now();
          this.io.to(userAddr).emit('balance_update', { 
              balance: String(session.balance), 
              reason: 'TRADE_PLACED', 
              betId: numericId.toString() 
          });
      }
      
      return { success: true, txHash: tx.hash, tradeId: trade.id };
    } catch (err) {
      console.error("[Engine] Placement Failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  async processSettlementBatch() {
    if (this.settlementProcessing) return;
    this.settlementProcessing = true;
    try {
      const pending = Array.from(cache.trades.values())
        .filter(t => t.status === 'RESOLVING' && t.lockedWon === true && !t.onChainSettleStarted)
        .slice(0, 100); // Process up to 100 winning trades per tick

      for (const trade of pending) {
        await this.settleTradeOnChain(trade);
      }
    } finally {
      this.settlementProcessing = false;
    }
  }

  async settleTradeOnChain(trade) {
    if (trade.onChainSettleStarted) return;
    trade.onChainSettleStarted = true; // Absolute idempotency lock
    try {
      const betId = BigInt(trade.id);

      // Exit price with NaN guard
      const exitPrice = Number(trade.lockedExitPrice);
      if (!exitPrice || isNaN(exitPrice) || exitPrice <= 0) {
        console.error(`[On-Chain] Invalid exitPrice for #${trade.id}: ${trade.lockedExitPrice}. Settling locally as loss.`);
        this.settleTradeLocally({ ...trade, lockedWon: false, lockedExitPrice: trade.entryPrice });
        return;
      }
      const exitPriceBigInt = ethers.parseUnits(exitPrice.toFixed(8), 8);
      
      const feeData = await rpc.mainProvider.getFeeData();
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits("50", "gwei");
      const gasPrice = (baseGasPrice * 120n) / 100n;

      // Payout calculation with NaN guards
      const sharePrice = Math.max(0.03, Math.min(0.97, Number(trade.sharePrice) || 0.50));
      const grossPayout = trade.amount / sharePrice;
      const netPayout = grossPayout * 0.99;
      // Minimum payout guard — must be > 0 and fit in uint256
      const payoutAmount = Math.max(0.000001, netPayout);
      const payoutStr = payoutAmount.toFixed(6);
      let payoutBigInt;
      try {
        payoutBigInt = ethers.parseEther(payoutStr);
      } catch (e) {
        console.error(`[On-Chain] Invalid payout value for #${trade.id}: ${payoutStr}`);
        this.settleTradeLocally({ ...trade, lockedWon: false, lockedExitPrice: trade.entryPrice });
        return;
      }

      // AUTHORITY: Call settleBet to trigger the Treasury's direct payout to the user
      let tx;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          if (!this.payoutNonce || (Date.now() - this.lastNonceSync > 30000)) {
            this.payoutNonce = await rpc.wallet.getNonce('pending');
            this.lastNonceSync = Date.now();
          }
          const currentNonce = this.payoutNonce++;
          
          tx = await this.treasuryContract.settleBet(betId, exitPriceBigInt, payoutBigInt, {
            gasPrice,
            nonce: currentNonce,
            gasLimit: 600000
          });
          break; // Success
        } catch (err) {
          this.payoutNonce = null; // Force nonce resync on failure
          const isRateLimit = err.message && (err.message.includes('coalesce') || err.message.includes('limit') || err.message.includes('429') || err.message.includes('fetch') || err.message.includes('timeout'));
          if (isRateLimit && attempt < 5) {
            console.log(`[Rate Limit] Retrying settleBet #${betId}... (Attempt ${attempt})`);
            await new Promise(r => setTimeout(r, 1000 * attempt));
            continue;
          }
          throw err;
        }
      }

      console.log(`[On-Chain] Broadcasted #${betId} | Tx: ${tx.hash}`);

      // NOW WAIT FOR CONFIRMATION before marking SETTLED and crediting balance.
      // This prevents the "balance bouncing back" problem where we optimistically
      // credit then the tx reverts.
      const receipt = await tx.wait();
      
      if (!receipt || receipt.status !== 1) {
        throw new Error("Transaction reverted on-chain");
      }

      // ✅ CONFIRMED — Now safe to mark settled and credit balance
      trade.payoutTx = tx.hash;
      trade.status = 'SETTLED';
      
      const payoutAmountNum = parseFloat(payoutStr);
      
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
          session.balance = Number((session.balance + payoutAmountNum).toFixed(6));
          session.lastWinAt = Date.now();
          session.lastTradeAt = Date.now();
      }

      // Emit both balance_update and payout_completed together for clean UI sync
      this.io.to(trade.userAddr).emit('balance_update', { 
          balance: String(session ? session.balance : payoutAmountNum), 
          reason: 'WIN_PAYOUT_SETTLED',
          betId: trade.id,
          txHash: tx.hash,
          payout: payoutAmountNum
      });

      this.io.to(trade.userAddr).emit('payout_completed', { 
        tradeId: trade.id, 
        betId: trade.id, 
        tx: tx.hash,
        payout: payoutAmountNum
      });

      // Notify ALL admins of the settled trade status
      this.io.emit('global_trade_settled', {
        betId: trade.id,
        won: true,
        status: 'WON',
        payout: payoutAmountNum,
        exitPrice: trade.lockedExitPrice,
        userAddr: trade.userAddr
      });

      // PERSISTENCE: Save to profile history — status MUST be PAID to clear the UI spinner
      cache.pushHistory(trade.userAddr, {
        ...trade,
        won: true,
        status: 'PAID',
        exitPrice: trade.lockedExitPrice,
        payout: payoutAmountNum,
        settledAt: Date.now()
      });

      // Notify the provider of their win
      try {
        const notifier = require('./services/notificationService');
        notifier.notifyUser(trade.userAddr, "Trade Won", `Your ${trade.symbol || 'BTC'} ${trade.direction === 'UP' ? 'LONG' : 'SHORT'} trade won! +${payoutAmountNum.toFixed(2)} USDC.`, "success");
      } catch (e) {}

      // Settle copy trades for this provider's won trade
      this.settleCopyTrades(trade, payoutAmountNum);

      // Remove from active cache so it stops showing as pending
      cache.trades.delete(trade.id);
      
      console.log(`✅ [On-Chain] Bet #${betId} Confirmed. Payout: ${payoutAmountNum}`);

      // Final balance sync from chain to ensure precision
      try {
        const balWei = await rpc.mainProvider.getBalance(trade.sessionAddress);
        const onChainBal = parseFloat(ethers.formatEther(balWei));
        if (session && onChainBal > 0) {
            session.balance = onChainBal;
        }
        this.io.to(trade.userAddr).emit('balance_update', { 
          balance: String(onChainBal), 
          reason: 'WIN_CONFIRMED',
          betId: trade.id,
          txHash: tx.hash
        });
      } catch (syncErr) {
        console.error(`[On-Chain] Balance sync error for #${trade.id}:`, syncErr.message);
      }

    } catch (err) {
      console.error(`❌ [On-Chain] Settlement failed for #${trade.id}:`, err.message);
      
      trade.settleRetries = (trade.settleRetries || 0) + 1;
      
      if (trade.settleRetries >= 10) {
        // MAX RETRIES EXCEEDED: Settle as loss locally to stop the infinite loop
        console.error(`[On-Chain] Max retries (10) exceeded for #${trade.id}. Settling locally as loss.`);
        this.io.to(trade.userAddr).emit('payout_failed', { 
          betId: trade.id, 
          message: "Payout settlement failed after maximum retries. Settled locally."
        });
        this.settleTradeLocally(trade);
        return;
      }
      
      this.io.to(trade.userAddr).emit('payout_failed', { 
        betId: trade.id, 
        message: "Payout settlement failed. Retrying..."
      });
      
      // EXPONENTIAL BACKOFF: Don't retry immediately. Wait 2s, 4s, 8s, 16s...
      // Use a delayed reset so processSettlementBatch doesn't pick it up for a while
      const backoffMs = Math.min(2000 * Math.pow(2, trade.settleRetries - 1), 60000);
      console.log(`[On-Chain] Retrying #${trade.id} in ${backoffMs}ms (attempt ${trade.settleRetries}/10)`);
      setTimeout(() => {
        trade.onChainSettleStarted = false;
        this.payoutNonce = null; // Force resync after backoff
      }, backoffMs);
    }
  }

  settleTradeLocally(trade) {
    trade.status = 'LOST';
    trade.settledAt = Date.now();

    // ENRICHED PAYLOAD: Ensure UI has all info for instant finalization without resolving delay
    this.io.to(trade.userAddr).emit('trade_settled', { 
      betId: trade.id, 
      won: false, 
      status: 'LOST',
      exitPrice: trade.lockedExitPrice,
      userAddr: trade.userAddr,
      entryPrice: trade.entryPrice,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration
    });

    // PERSISTENCE: Save to profile history immediately
    cache.pushHistory(trade.userAddr, {
      ...trade,
      won: false,
      exitPrice: trade.lockedExitPrice,
      settledAt: Date.now()
    });

    // Notify the provider of their loss
    try {
      const notifier = require('./services/notificationService');
      notifier.notifyUser(trade.userAddr, "Trade Lost", `Your ${trade.symbol || 'BTC'} ${trade.direction === 'UP' ? 'LONG' : 'SHORT'} trade lost. -${(trade.amount || 0).toFixed(2)} USDC.`, "error");
    } catch (e) {}

    // Settle copy trades for this provider's lost trade
    this.settleCopyTrades(trade, 0);

    // Notify ALL admins of the settled trade status
    this.io.emit('global_trade_settled', {
      betId: trade.id,
      won: false,
      status: 'LOST',
      payout: 0,
      exitPrice: trade.lockedExitPrice,
      userAddr: trade.userAddr
    });
  }

  settleCopyTrades(providerTrade, payout) {
    try {
      const profiles = require('./profiles');
      const providerAddr = providerTrade.userAddr?.toLowerCase();
      if (!providerAddr) return;
      const provider = profiles.get(providerAddr);
      if (!provider?.isProvider) return;
      const providerTradeId = String(providerTrade.id);
      const won = providerTrade.won || providerTrade.status === 'WON';
      for (const addr in profiles.profiles) {
        const investor = profiles.get(addr);
        if (!investor?.copyTrades || !investor.copyTradingWallet) continue;
        let updated = false;
        let settledTrade = null;
        investor.copyTrades = investor.copyTrades.map(ct => {
          if (ct.providerTradeId === providerTradeId && ct.result === 'PENDING') {
            updated = true;
            const ratio = providerTrade.amount > 0 ? (payout / providerTrade.amount) : 0;
            const payoutAmount = won ? (ct.amount * ratio) : 0;
            settledTrade = { ...ct, result: won ? 'WON' : 'LOST', payout: payoutAmount, settledAt: Date.now() };
            return settledTrade;
          }
          return ct;
        });
        if (updated && settledTrade) {
          if (won) {
            investor.copyTradingWallet.balance = (parseFloat(investor.copyTradingWallet.balance) || 0) + settledTrade.payout;
          }
          if (investor.activeCopies) {
            const rel = investor.activeCopies.find(c => c.providerAddress === providerAddr);
            if (rel) {
              const pnl = won ? (settledTrade.payout - settledTrade.amount) : -settledTrade.amount;
              rel.pnl = (rel.pnl || 0) + pnl;
            }
          }
          profiles.upsert(addr, investor);
          this.io.to(addr).emit('copy_trade_update', {
            trade: {
              providerAddress: providerAddr,
              result: settledTrade.result,
              amount: settledTrade.amount,
              payout: settledTrade.payout
            }
          });
          this.io.to(addr).emit('balance_update', {
            balance: String(investor.copyTradingWallet.balance),
            available: String(investor.copyTradingWallet.balance),
            reason: won ? 'COPY_WIN' : 'COPY_LOSS'
          });
          try {
            const notifier = require('./services/notificationService');
            const providerName = provider?.providerApplication?.contactInfo?.name || provider?.username || providerAddr.substring(0, 6);
            if (won) {
              notifier.notifyUser(addr, "Copy Trade Won", `${providerName}'s copy trade won! +${settledTrade.payout.toFixed(2)} USDC on ${settledTrade.asset || 'BTC'}.`, "success");
            } else {
              notifier.notifyUser(addr, "Copy Trade Lost", `${providerName}'s copy trade lost. -${settledTrade.amount.toFixed(2)} USDC on ${settledTrade.asset || 'BTC'}.`, "error");
            }
          } catch (e) {
            console.error('[CopyTrading] settleCopyTrades notification error:', e.message);
          }
        }
      }
    } catch (err) {
      console.error('[CopyTrading] settleCopyTrades error:', err.message);
    }
  }

  async ensureOperatorFunded() {
    try {
      const balStr = await rpc.getBalance(rpc.wallet.address);
      if (balStr === null || balStr === "0") return; // If 0 from timeout, skip

      const bal = parseFloat(balStr);
      if (bal < 5) { // Minimum gas threshold
        // Check treasury balance
        const tBalStr = await rpc.getBalance(config.TREASURY_ADDRESS);
        const treasuryBal = parseFloat(tBalStr || "0");
        if (treasuryBal < 20) {
           console.log(`⚠️ [GasTank] Treasury low (${treasuryBal} ARC). Cannot refill Operator.`);
           return;
        }

        console.log(`⚠️ [GasTank] Low (${bal} ARC). Refilling 20 ARC...`);
        const tx = await this.treasuryContract.withdraw(ethers.parseUnits("20", 18), { gasLimit: 150000 });
        await tx.wait();
      }
    } catch (e) {
      console.error("[GasTank] Refill failed:", e.message);
    }
  }
}

module.exports = ClassicEngine;

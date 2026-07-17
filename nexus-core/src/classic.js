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
    
    // SINGLE SOURCE OF TRUTH: Use the exact real-time price in memory right now.
    // This perfectly matches the final trade_tick sent to the UI, ensuring no desync.
    const exitPrice = cache.prices[trade.symbol] || trade.entryPrice;
    
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
    
    console.log(`[Engine] Result Locked #${trade.id} | Won: ${won} | Price: ${exitPrice}`);
    
    // Lost trades are settled immediately locally
    if (!won) {
      this.settleTradeLocally(trade);
    }
  }

  async placeTrade(tradeParams, identityPayload) {
    const userAddr = this.normalizeAddr(identityPayload.address);
    const sessionWallet = rpc.deriveSessionWallet(userAddr);
    const amount = Number(tradeParams.amount);
    
    // STRICT IDEMPOTENCY: Ensure ID is always unique, even if frontend fails or duplicates arrive concurrently.
    let generatedId = Date.now().toString() + crypto.randomInt(100000, 999999).toString();
    const numericId = BigInt(tradeParams.id && /^\d+$/.test(tradeParams.id) ? tradeParams.id : generatedId);
    
    const direction = this.resolveDirection(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);
    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    const entryPrice = Number(cache.prices[symbol] || tradeParams.entryPrice || 0);

    // Dynamic Odds Share Price Lookup
    const currentOdds = cache.liveOdds?.[symbol]?.[duration];
    let sharePrice = 0.50; // fallback
    if (currentOdds) {
      sharePrice = direction === 1 ? currentOdds.LONG : currentOdds.SHORT;
    }

    try {
      const contract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, sessionWallet);
      const contractDir = direction === 1 ? 0 : 1; 
      const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
      
      // Sanitize amount to exactly 6 decimal places as a string to avoid scientific notation
      const safeAmountStr = amount.toFixed(6);
      
      let tx;
      for (let attempt = 1; attempt <= 5; attempt++) {
        try {
          tx = await contract.placeBet(numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address, { 
            value: ethers.parseEther(safeAmountStr),
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
      };

      cache.trades.set(trade.id, trade);
      
      // Deduct from in-process session immediately for responsive balance tracking
      const session = cache.sessions.get(userAddr);
      if (session) {
          session.balance = Number((session.balance - amount).toFixed(6));
          this.io.to(userAddr).emit('balance_update', { 
              balance: String(session.balance), 
              reason: 'TRADE_PLACED', 
              betId: numericId.toString() 
          });
      }

      cache.queueTradeForSettlement(trade);
      
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
      const exitPriceBigInt = ethers.parseUnits(trade.lockedExitPrice.toFixed(8), 8);
      
      const feeData = await rpc.mainProvider.getFeeData();
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits("50", "gwei");
      const gasPrice = (baseGasPrice * 120n) / 100n;

      const sharePrice = trade.sharePrice || 0.50;
      const grossPayout = trade.amount / sharePrice;
      const payoutStr = (grossPayout * 0.99).toFixed(6);
      const payoutBigInt = ethers.parseEther(payoutStr);

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
            gasLimit: 600000 // Increased limit for safety
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

      trade.payoutTx = tx.hash;
      trade.status = 'SETTLED';
      
      const payoutAmount = parseFloat(payoutStr);
      
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
          session.balance = Number((session.balance + payoutAmount).toFixed(6));
          session.lastWinAt = Date.now();
          this.io.to(trade.userAddr).emit('balance_update', { 
              balance: String(session.balance), 
              reason: 'WIN_PAYOUT_SETTLED',
              betId: trade.id,
              txHash: tx.hash
          });
      }

      this.io.to(trade.userAddr).emit('payout_completed', { 
        tradeId: trade.id, 
        betId: trade.id, 
        tx: tx.hash,
        payout: payoutAmount
      });

      // Notify ALL admins of the settled trade status
      this.io.emit('global_trade_settled', {
        betId: trade.id,
        won: true,
        status: 'WON',
        payout: payoutAmount,
        exitPrice: trade.lockedExitPrice,
        userAddr: trade.userAddr
      });

      // PERSISTENCE: Save to profile history — status MUST be PAID to clear the UI spinner
      cache.pushHistory(trade.userAddr, {
        ...trade,
        won: true,
        status: 'PAID',
        exitPrice: trade.lockedExitPrice,
        payout: payoutAmount,
        settledAt: Date.now()
      });

      // Notify the provider of their win
      try {
        const notifier = require('./services/notificationService');
        notifier.notifyUser(trade.userAddr, "Trade Won", `Your ${trade.symbol || 'BTC'} ${trade.direction === 'UP' ? 'LONG' : 'SHORT'} trade won! +${payoutAmount.toFixed(2)} USDC.`, "success");
      } catch (e) {}

      // Settle copy trades for this provider's won trade
      this.settleCopyTrades(trade, payoutAmount);

      // Remove from active cache so it stops showing as pending
      cache.trades.delete(trade.id);
      
      tx.wait().then(async (receipt) => {
        if (receipt.status === 1) {
          console.log(`✅ [On-Chain] Bet #${betId} Confirmed. Winnings sent.`);
          // (payout_completed already emitted optimistically above)
          
          // Final balance sync
          // Optional: Sync with final on-chain balance after tx confirm to ensure precision
          const balWei = await rpc.mainProvider.getBalance(trade.sessionAddress);
          const onChainBal = parseFloat(ethers.formatEther(balWei));
          
          if (session) {
              session.balance = onChainBal;
              session.lastWinAt = Date.now();
          }

          this.io.to(trade.userAddr).emit('balance_update', { 
            balance: String(onChainBal), 
            reason: 'WIN_CONFIRMED',
            betId: trade.id,
            txHash: tx.hash
          });
          console.log(`✅ [On-Chain] #${betId} confirmed. On-chain balance synced to ${onChainBal}`);
        } else {
          throw new Error("Transaction reverted on-chain");
        }
      }).catch(err => {
        console.error(`❌ [On-Chain] Confirmation failed for #${trade.id}:`, err.message);
        this.io.to(trade.userAddr).emit('payout_failed', { 
          betId: trade.id, 
          message: "Payout transaction failed on-chain"
        });
        trade.onChainSettleStarted = false;
      });

    } catch (err) {
      console.error(`❌ [On-Chain] Broadcast failed for #${trade.id}:`, err.message);
      this.io.to(trade.userAddr).emit('payout_failed', { 
        betId: trade.id, 
        message: err.message 
      });
      trade.onChainSettleStarted = false;
      this.payoutNonce = null; // Force resync on failure
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

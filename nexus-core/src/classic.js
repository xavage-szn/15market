// ==================================================================================
// CLASSIC TRADING ENGINE (CORE SETTLEMENT LAYER)
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

    // Treasury ABI for Refills and Sync
    this.TREASURY_ABI = [
      "function withdraw(uint256 _amount) external",
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
    ];

    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
  }

  start() {
    // 1. Batch Settlement Pulse
    setInterval(() => this.processSettlementBatch(), 50);
    
    // 2. Gas Tank Monitor (Refills Root Wallet from Treasury)
    setInterval(() => this.ensureOperatorFunded(), 15000);

    // 3. Trade Heartbeat (Monitors and Locks Results)
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status === 'PENDING') {
          const msLeft = (trade.settleAt || 0) - now;
          const timeLeft = Math.max(0, msLeft / 1000);
          const direction = this.resolveDirection(trade.direction);
          const isUp = direction === 1;
          
          if (trade.expiryEmitted) continue;

          const currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          if (currentPrice > 0) cache.snapshotPrice(trade.symbol);
          const isWinning = isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice;
          
          if (timeLeft <= 0) {
            this.lockResult(trade);
          } else {
            this.io.to(trade.userAddr).emit('trade_tick', {
              betId: trade.id,
              timeLeft,
              currentPrice,
              isWinning,
              direction
            });
          }
        }
      }
    }, 50);

    if (config.PAYOUT_INLINE_FALLBACK) {
      setInterval(() => this.processInlinePayoutBatch(), 1000);
    }
  }

  normalizeAddr(addr) { return String(addr || '').toLowerCase(); }

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

  lockResult(trade) {
    if (trade.expiryEmitted) return;
    const targetTime = trade.settleAt;
    const exitPrice = cache.getHistoricalPrice(trade.symbol, targetTime) || cache.prices[trade.symbol] || trade.entryPrice;
    const direction = this.resolveDirection(trade.direction);
    const won = direction === 1 ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);

    trade.status = 'RESOLVING';
    trade.expiryEmitted = true;
    trade.lockedExitPrice = exitPrice;
    trade.lockedWon = won;

    this.io.to(trade.userAddr).emit('trade_expired', {
      betId: trade.id,
      exitPrice,
      won,
      direction,
      status: 'RESOLVING'
    });
    
    // Instantly transition to settlement
    if (!won) {
      this.settleTrade(trade);
    }
  }

  async placeTrade(tradeParams, identityPayload) {
    const identity = this.resolveSessionIdentity(identityPayload);
    if (!identity.ok) return { success: false, error: identity.error };

    const userAddr = identity.identityKey;
    const treasury = config.TREASURY_ADDRESS;
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
    const numericId = BigInt(tradeParams.id && /^\d+$/.test(tradeParams.id) ? tradeParams.id : Date.now());
    const direction = this.resolveDirection(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);

    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    const entryPrice = Number(cache.prices[symbol] || tradeParams.entryPrice || 0);

    try {
      const contract = new ethers.Contract(treasury, this.TREASURY_ABI, sessionWallet);
      const contractDir = direction === 1 ? 0 : 1; 
      const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
      
      const tx = await contract.placeBet(numericId, contractDir, duration, contractPrice, marketId, ethers.getAddress(userAddr), { 
        value: ethers.parseUnits(amount.toFixed(18), 18),
        gasLimit: 300000 
      });

      const trade = {
        id: numericId.toString(),
        userAddr: userAddr.toLowerCase(),
        sessionAddress: sessionWallet.address.toLowerCase(),
        direction,
        duration,
        marketId,
        amount,
        symbol,
        entryPrice,
        status: 'PENDING',
        stakeTxHash: tx.hash,
        createdAt: Date.now(),
        settleAt: Date.now() + (duration * 1000),
      };

      cache.trades.set(trade.id, trade);
      cache.queueTradeForSettlement(trade);
      
      session.balance = Number((session.balance - amount).toFixed(4));
      this.io.to(userAddr).emit('balance_update', { balance: String(session.balance), reason: 'STAKE_SENT', betId: trade.id });

      return { success: true, txHash: tx.hash, tradeId: trade.id, newBalance: String(session.balance) };
    } catch (err) {
      console.error("[Trade] Critical Failure:", err.message);
      return { success: false, error: "Contract Error or RPC Timeout" };
    }
  }

  async settleTrade(trade) {
    if (trade.status !== 'PENDING' && trade.status !== 'RESOLVING') return;

    if (!trade.expiryEmitted) this.lockResult(trade);

    const won = trade.lockedWon;
    const multiplier = trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90);
    const payout = won ? Number((trade.amount * multiplier).toFixed(6)) : 0;

    trade.status = won ? 'WON' : 'LOST';
    trade.exitPrice = trade.lockedExitPrice;
    trade.won = won;
    trade.payout = payout;
    trade.settledAt = Date.now();

    const session = cache.sessions.get(trade.userAddr);
    if (session && won) {
      session.balance = Number((session.balance + payout).toFixed(4));
      this.io.to(trade.userAddr).emit('balance_update', { balance: String(session.balance), reason: 'WIN', betId: trade.id, payout: String(payout) });
    }

    this.io.to(trade.userAddr).emit('trade_settled', { betId: trade.id, won, payout: String(payout), status: trade.status });

    if (won && payout > 0) {
      this.queuePayoutJob(trade);
    }
  }

  queuePayoutJob(trade) {
    const derivedSession = rpc.deriveSessionWallet(trade.userAddr);
    const destination = derivedSession ? derivedSession.address : trade.sessionAddress;

    cache.payoutQueue.push({
      tradeId: trade.id,
      userAddr: trade.userAddr,
      sessionAddress: destination, 
      amount: trade.payout,
      status: 'QUEUED',
    });
  }

  async processInlinePayoutBatch() {
    if (this.payoutQueueProcessing) return;
    this.payoutQueueProcessing = true;
    try {
      const jobs = cache.payoutQueue.filter(j => j.status === 'QUEUED').slice(0, 50);
      for (const job of jobs) {
        job.status = 'PROCESSING';
        await this.dispatchBatchPayout(job.sessionAddress, job.amount, [job], job.userAddr);
        job.status = 'COMPLETED';
      }
      cache.payoutQueue = cache.payoutQueue.filter(j => j.status !== 'COMPLETED');
    } finally {
      this.payoutQueueProcessing = false;
    }
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
      for (const trade of due) {
        await this.settleTrade(trade);
      }
    } finally {
      this.queueProcessing = false;
    }
  }

  async dispatchBatchPayout(destinationAddr, totalAmount, jobs, userAddr) {
    try {
      if (!this.payoutNonce || (Date.now() - this.lastNonceSync > 30000)) {
        this.payoutNonce = await rpc.wallet.getNonce('pending');
        this.lastNonceSync = Date.now();
      }

      const withdrawAmount = ethers.parseUnits(totalAmount.toFixed(18), 18);
      const gasPrice = (await rpc.mainProvider.getFeeData()).gasPrice || ethers.parseUnits("50", "gwei");

      // 1. NON-BLOCKING SYNC: Try to withdraw, but don't stop the payout if it fails
      try {
        const withdrawTx = await this.treasuryContract.withdraw(withdrawAmount, { gasPrice, nonce: this.payoutNonce++, gasLimit: 150000 });
        withdrawTx.wait().then(() => console.log(`✅ [Sync] Withdrawn ${totalAmount} from Treasury`));
      } catch (e) {
        console.warn("[Sync] Withdrawal failed (will retry via Gas Monitor):", e.message);
        this.payoutNonce = null; // Sync again
        if (!this.payoutNonce) this.payoutNonce = await rpc.wallet.getNonce('pending');
      }

      // 2. ACTUAL PAYOUT (From Gas Wallet / Root Wallet)
      const tx = await rpc.wallet.sendTransaction({
        to: ethers.getAddress(destinationAddr),
        value: withdrawAmount,
        gasPrice,
        nonce: this.payoutNonce++,
        gasLimit: 120000
      });

      console.log(`[Payout] Confirmed: ${tx.hash}`);
      this.io.to(userAddr).emit('payout_completed', { tradeId: jobs[0].tradeId, amount: totalAmount, tx: tx.hash });

    } catch (e) {
      console.error("[Payout] Critical Failure:", e.message);
      this.payoutNonce = null;
    }
  }

  async ensureOperatorFunded() {
    try {
      const bal = parseFloat(await rpc.getBalance(rpc.wallet.address));
      if (bal < 10) {
        console.log(`⚠️ [Refill] Operator low (${bal} USDC). Refilling 100...`);
        const tx = await this.treasuryContract.withdraw(ethers.parseUnits("100", 18), { gasLimit: 150000 });
        await tx.wait();
        console.log("✅ [Refill] Success.");
      }
    } catch (e) {
      console.error("[Refill] Failed:", e.message);
    }
  }
}

module.exports = ClassicEngine;

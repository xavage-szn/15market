// ==================================================================================
// CLASSIC TRADING ENGINE (DIRECT ON-CHAIN SETTLEMENT)
// ==================================================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this.settlementProcessing = false;
    this.payoutNonce = null;
    this.lastNonceSync = 0;

    // AUTHORITATIVE ARC-NATIVE ABI
    this.TREASURY_ABI = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice) external",
      "function withdraw(uint256 _amount) external",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
  }

  start() {
    // 1. Authoritative Settlement Pulse
    setInterval(() => this.processSettlementBatch(), 50);
    
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

  resolveDirection(dir) {
    if (dir === 1 || dir === '1' || String(dir).toUpperCase() === 'UP') return 1;
    if (dir === 0 || dir === '0' || String(dir).toUpperCase() === 'DOWN') return 0;
    return null;
  }

  lockResult(trade) {
    if (trade.expiryEmitted) return;
    
    const targetTime = trade.settleAt;
    // CRITICAL: Ensure we use the historical price captured exactly at expiry.
    // If we are late, getHistoricalPrice will now safely avoid the current 'retraced' price.
    const exitPrice = cache.getHistoricalPrice(trade.symbol, targetTime) || cache.prices[trade.symbol] || trade.entryPrice;
    
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
    const numericId = BigInt(tradeParams.id && /^\d+$/.test(tradeParams.id) ? tradeParams.id : Date.now());
    
    const direction = this.resolveDirection(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);
    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    const entryPrice = Number(cache.prices[symbol] || tradeParams.entryPrice || 0);

    try {
      const contract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, sessionWallet);
      const contractDir = direction === 1 ? 0 : 1; 
      const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
      
      // AUTHORITY: Set sessionWallet.address as the direct payout destination on-chain
      const tx = await contract.placeBet(numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address, { 
        value: ethers.parseUnits(amount.toFixed(18), 18),
        gasLimit: 400000 
      });

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
        .slice(0, 50);

      for (const trade of pending) {
        await this.settleTradeOnChain(trade);
      }
    } finally {
      this.settlementProcessing = false;
    }
  }

  async settleTradeOnChain(trade) {
    trade.onChainSettleStarted = true;
    try {
      if (!this.payoutNonce || (Date.now() - this.lastNonceSync > 30000)) {
        this.payoutNonce = await rpc.wallet.getNonce('pending');
        this.lastNonceSync = Date.now();
      }

      const betId = BigInt(trade.id);
      const exitPriceBigInt = ethers.parseUnits(trade.lockedExitPrice.toFixed(8), 8);
      
      // Aggressive Settlement: 20% gas bump for instant confirmation
      const feeData = await rpc.mainProvider.getFeeData();
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits("50", "gwei");
      const gasPrice = (baseGasPrice * 120n) / 100n;

      console.log(`[On-Chain] Payout #${betId} | Nonce: ${this.payoutNonce} | Gas: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

      // AUTHORITY: Call settleBet to trigger the Treasury's direct payout to the user
      const tx = await this.treasuryContract.settleBet(betId, exitPriceBigInt, {
        gasPrice,
        nonce: this.payoutNonce++,
        gasLimit: 600000 // Increased limit for safety
      });

      console.log(`[On-Chain] Broadcasted #${betId} | Tx: ${tx.hash}`);

      trade.payoutTx = tx.hash;
      trade.status = 'SETTLED';

      // AUTHORITATIVE PAYOUT CALCULATION: Stake * Multiplier * 0.99 (1% platform fee)
      const durationTiers = config.MULTIPLIERS || { 5: 2.90, 10: 2.40, 15: 1.90 };
      const baseMultiplier = durationTiers[trade.duration] || (trade.duration <= 5 ? 2.90 : (trade.duration <= 10 ? 2.40 : 1.90));
      const payout = Number((trade.amount * baseMultiplier * 0.99).toFixed(6));
      
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
          session.balance = Number((session.balance + payout).toFixed(6));
          session.lastWinAt = Date.now();
          // Emit updated balance immediately for zero-latency feel
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
        payout: payout
      });

      // PERSISTENCE: Save to profile history immediately
      cache.pushHistory(trade.userAddr, {
        ...trade,
        won: true,
        exitPrice: trade.lockedExitPrice,
        payout: payout,
        settledAt: Date.now()
      });
      
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
  }

  async ensureOperatorFunded() {
    try {
      const bal = parseFloat(await rpc.getBalance(rpc.wallet.address));
      if (bal < 5) { // Minimum gas threshold
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

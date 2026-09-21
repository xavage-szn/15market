// ==================================================================================
// CLASSIC TRADING ENGINE (DIRECT ON-CHAIN SETTLEMENT)
// ==================================================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');
const priceService = require('./services/priceService');

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this.settlementProcessing = false;
    this.payoutNonce = null;
    this.lastNonceSync = 0;

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
    setInterval(() => this.processSettlementBatch(), 25);
    setInterval(() => this.ensureOperatorFunded(), 15000);

    // Trade Monitor: snapshot prices near expiry, lock results at countdown zero
    setInterval(async () => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status !== 'PENDING') continue;
        const msLeft = (trade.settleAt || 0) - now;
        const timeLeft = Math.max(0, msLeft / 1000);
        if (trade.expiryEmitted) continue;

        // Snapshot live price in the last 500ms before expiry
        const currentPrice = priceService.getLivePrice(trade.symbol);
        if (msLeft < 500 && currentPrice > 0) {
          cache.snapshotPrice(trade.symbol, currentPrice);
        }

        if (msLeft <= 0) {
          await this.lockResult(trade);
        } else {
          const isUp = this.resolveDirection(trade.direction) === 1;
          const isWinning = currentPrice > 0 && Math.abs(currentPrice - trade.entryPrice) > 1e-8
            ? (isUp ? currentPrice > trade.entryPrice : currentPrice < trade.entryPrice)
            : undefined;
          this.io.to(trade.userAddr).emit('trade_tick', {
            betId: trade.id, timeLeft, currentPrice, isWinning, direction: trade.direction
          });
        }
      }
    }, 50);
  }

  normalizeAddr(addr) { return String(addr || '').toLowerCase(); }

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

  // ──────────────────────────────────────────────────────────────────
  // LOCK RESULT — captures exit price at countdown zero and determines result
  // ──────────────────────────────────────────────────────────────────
  async lockResult(trade) {
    if (trade.expiryEmitted) return;
    trade.expiryEmitted = true;

    const symbol = trade.symbol;

    try {
      // Force a fresh price from the price service. Retry up to 3 times.
      for (let i = 0; i < 3; i++) {
        if (cache.prices[symbol] > 0) break;
        try {
          await Promise.race([
            priceService.pollPrices(),
            new Promise((_, reject) => setTimeout(() => reject(new Error('Poll timeout')), 5000))
          ]);
        } catch (e) {
          console.error(`[Engine] Poll attempt ${i + 1} failed for ${symbol}:`, e.message);
        }
      }

      // Exit price = most recent live price. Reject absurdly low prices (e.g. 0.01 for BTC).
      // If price is < 10% of entryPrice, use entryPrice (treats as push/tie).
      let exitPrice = priceService.getLivePrice(symbol) || trade.entryPrice;
      if (trade.entryPrice > 0 && exitPrice < trade.entryPrice * 0.1) {
        exitPrice = trade.entryPrice;
      }

      const isUp = this.resolveDirection(trade.direction) === 1;
      const isTie = Math.abs(exitPrice - trade.entryPrice) < 1e-8;
      const won = isTie ? false : (isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice));

      // Freeze state immediately — status encodes the final result.
      trade.lockedExitPrice = exitPrice;
      trade.lockedWon = won;
      trade.lockedIsPush = isTie;
      trade.status = isTie ? 'PUSH' : (won ? 'WON' : 'LOST');

      this.io.to(trade.userAddr).emit('trade_expired', {
        betId: trade.id, exitPrice, won, isPush: isTie, status: trade.status
      });

      console.log(`[Engine] Result Locked #${trade.id} | ${trade.status} | Exit: ${exitPrice} | Entry: ${trade.entryPrice}`);

      if (isTie) {
        this.settleTradeAsPush(trade);
      } else if (!won) {
        this.settleTradeLocally(trade);
      }
    } catch (err) {
      console.error(`[Engine] lockResult error for #${trade.id}:`, err.message);
      // Fallback: treat as push (refund) so won trades don't show as losses.
      trade.status = 'PUSH';
      trade.lockedExitPrice = trade.entryPrice;
      trade.lockedWon = false;
      trade.lockedIsPush = true;
      this.io.to(trade.userAddr).emit('trade_expired', {
        betId: trade.id, exitPrice: trade.entryPrice, won: false, isPush: true, status: 'PUSH'
      });
      this.settleTradeAsPush(trade);
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PUSH SETTLEMENT — refund stake, status already 'PUSH'
  // ──────────────────────────────────────────────────────────────────
  settleTradeAsPush(trade) {
    trade.settledAt = Date.now();
    trade.isPush = true;

    const session = cache.sessions.get(trade.userAddr);
    if (session) {
      session.balance = Number((session.balance + trade.amount).toFixed(6));
      session.lastTradeAt = Date.now();
    }

    this.io.to(trade.userAddr).emit('balance_update', {
      balance: String(session ? session.balance : trade.amount),
      reason: 'PUSH_REFUND', betId: trade.id
    });
    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id, won: false, isPush: true, status: 'PUSH',
      exitPrice: trade.lockedExitPrice, entryPrice: trade.entryPrice,
      userAddr: trade.userAddr, amount: trade.amount, symbol: trade.symbol,
      direction: trade.direction, duration: trade.duration, refund: trade.amount
    });

    cache.pushHistory(trade.userAddr, { ...trade, won: false, isPush: true, exitPrice: trade.lockedExitPrice, refund: trade.amount, settledAt: Date.now() });
    try { const n = require('./services/notificationService'); n.notifyUser(trade.userAddr, "Trade Push", `Your ${trade.symbol || 'BTC'} ${trade.direction === 1 ? 'LONG' : 'SHORT'} trade was a push. Stake refunded: ${trade.amount.toFixed(2)} USDC.`, "info"); } catch (e) {}
    this.settleCopyTrades(trade, trade.amount);
    this.io.emit('global_trade_settled', { betId: trade.id, won: false, isPush: true, status: 'PUSH', payout: 0, refund: trade.amount, exitPrice: trade.lockedExitPrice, userAddr: trade.userAddr });
    cache.trades.delete(trade.id);
  }

  // ──────────────────────────────────────────────────────────────────
  // LOCAL LOSS SETTLEMENT — status already 'LOST'
  // ──────────────────────────────────────────────────────────────────
  settleTradeLocally(trade) {
    trade.status = 'LOST';
    trade.settledAt = Date.now();

    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id, won: false, isPush: false, status: 'LOST',
      exitPrice: trade.lockedExitPrice, entryPrice: trade.entryPrice,
      userAddr: trade.userAddr, amount: trade.amount, symbol: trade.symbol,
      direction: trade.direction, duration: trade.duration
    });
    cache.pushHistory(trade.userAddr, { ...trade, won: false, isPush: false, exitPrice: trade.lockedExitPrice, settledAt: Date.now() });
    try { const n = require('./services/notificationService'); n.notifyUser(trade.userAddr, "Trade Lost", `Your ${trade.symbol || 'BTC'} ${trade.direction === 1 ? 'LONG' : 'SHORT'} trade lost. -${trade.amount.toFixed(2)} USDC.`, "error"); } catch (e) {}
    this.settleCopyTrades(trade, 0);
    this.io.emit('global_trade_settled', { betId: trade.id, won: false, isPush: false, status: 'LOST', payout: 0, refund: 0, exitPrice: trade.lockedExitPrice, userAddr: trade.userAddr });
  }

  // ──────────────────────────────────────────────────────────────────
  // PLACE TRADE — validates entry price, places on-chain bet
  // ──────────────────────────────────────────────────────────────────
  async placeTrade(tradeParams, identityPayload) {
    const userAddr = this.normalizeAddr(identityPayload.address);
    const sessionWallet = rpc.deriveSessionWallet(userAddr);
    const amount = Number(tradeParams.amount);
    const numericId = BigInt(tradeParams.id && /^\d+$/.test(tradeParams.id) ? tradeParams.id : Date.now());

    const direction = this.resolveDirection(tradeParams.direction);
    const duration = Math.max(1, Number(tradeParams.duration || 5));
    const marketId = Number(tradeParams.marketId || 0);
    const SYMBOL_MAP = ['eth', 'btc', 'sol', 'mon', 'jup', 'xrp', 'avax'];
    const symbol = SYMBOL_MAP[marketId] || 'eth';
    const SCALE = marketId === 2 ? 1000000 : 100;
    const clientPriceRaw = Number(tradeParams.entryPrice);
    const entryPrice = cache.prices[symbol] > 0 ? Number(cache.prices[symbol]) : (clientPriceRaw ? Number((clientPriceRaw / SCALE).toFixed(8)) : 0);

    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      return { success: false, error: `Invalid entry price for ${symbol}: ${entryPrice}. Price service may not be running.` };
    }

    const currentOdds = cache.liveOdds?.[symbol]?.[duration];
    let sharePrice = 0.50;
    if (currentOdds) { sharePrice = direction === 1 ? currentOdds.LONG : currentOdds.SHORT; }

    try {
      const iface = new ethers.Interface(this.TREASURY_ABI);
      const contractDir = direction === 1 ? 0 : 1;
      const contractPrice = ethers.parseUnits(entryPrice.toFixed(8), 8);
      const stakeWei = ethers.parseUnits(amount.toFixed(18), 18);
      const calldata = iface.encodeFunctionData('placeBet', [numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address]);

      const tx = await rpc.broadcastWithFailover(sessionWallet.privateKey, {
        to: config.TREASURY_ADDRESS, data: calldata, value: stakeWei, gasLimit: 400000n
      });

      const trade = {
        id: numericId.toString(), userAddr,
        sessionAddress: sessionWallet.address.toLowerCase(),
        direction, duration, marketId, amount, symbol,
        entryPrice, sharePrice,
        status: 'PENDING', stakeTxHash: tx.hash,
        createdAt: Date.now(), settleAt: Date.now() + (duration * 1000)
      };

      cache.trades.set(trade.id, trade);
      const session = cache.sessions.get(userAddr);
      if (session) {
        session.balance = Number((session.balance - amount).toFixed(6));
        this.io.to(userAddr).emit('balance_update', { balance: String(session.balance), reason: 'TRADE_PLACED', betId: numericId.toString() });
      }
      cache.queueTradeForSettlement(trade);
      return { success: true, txHash: tx.hash, tradeId: trade.id };
    } catch (err) {
      console.error("[Engine] Placement Failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // PROCESS SETTLEMENT BATCH — settles winning trades on-chain
  // ──────────────────────────────────────────────────────────────────
  async processSettlementBatch() {
    if (this.settlementProcessing) return;
    this.settlementProcessing = true;
    try {
      const pending = Array.from(cache.trades.values())
        .filter(t => t.status === 'WON' && !t.onChainSettleStarted)
        .slice(0, 100);
      for (const trade of pending) { await this.settleTradeOnChain(trade); }
    } finally {
      this.settlementProcessing = false;
    }
  }

  async settleTradeOnChain(trade) {
    trade.onChainSettleStarted = true;
    try {
      const exitPrice = Number(trade.lockedExitPrice);
      if (!exitPrice || isNaN(exitPrice) || exitPrice <= 0) {
        console.error(`[On-Chain] Invalid exitPrice for #${trade.id}: ${trade.lockedExitPrice}. Skipping.`);
        trade.onChainSettleStarted = false;
        return;
      }

      if (!this.payoutNonce || (Date.now() - this.lastNonceSync > 30000)) {
        this.payoutNonce = await rpc.wallet.getNonce('pending');
        this.lastNonceSync = Date.now();
      }

      const betId = BigInt(trade.id);
      const exitPriceBigInt = ethers.parseUnits(trade.lockedExitPrice.toFixed(8), 8);

      const feeData = await rpc.mainProvider.getFeeData();
      const baseGasPrice = feeData.gasPrice || ethers.parseUnits("50", "gwei");
      const gasPrice = (baseGasPrice * 120n) / 100n;
      console.log(`[On-Chain] Payout #${betId} | Nonce: ${this.payoutNonce} | Gas: ${ethers.formatUnits(gasPrice, 'gwei')} gwei`);

      const tx = await this.treasuryContract.settleBet(betId, exitPriceBigInt, { gasPrice, nonce: this.payoutNonce++, gasLimit: 600000 });
      console.log(`[On-Chain] Broadcasted #${betId} | Tx: ${tx.hash}`);

      trade.payoutTx = tx.hash;
      trade.status = 'SETTLED';

      const sharePrice = trade.sharePrice || 0.50;
      const grossPayout = trade.amount / sharePrice;
      const payout = Number((grossPayout * 0.99).toFixed(6));

      const session = cache.sessions.get(trade.userAddr);
      if (session) {
        session.balance = Number((session.balance + payout).toFixed(6));
        session.lastWinAt = Date.now();
        this.io.to(trade.userAddr).emit('balance_update', { balance: String(session.balance), reason: 'WIN_PAYOUT_SETTLED', betId: trade.id, txHash: tx.hash });
      }

      this.io.to(trade.userAddr).emit('payout_completed', { tradeId: trade.id, betId: trade.id, tx: tx.hash, payout });
      this.io.emit('global_trade_settled', { betId: trade.id, won: true, status: 'WON', payout, exitPrice: trade.lockedExitPrice, userAddr: trade.userAddr });
      cache.pushHistory(trade.userAddr, { ...trade, won: true, status: 'WON', exitPrice: trade.lockedExitPrice, payout, settledAt: Date.now() });
      try { const n = require('./services/notificationService'); n.notifyUser(trade.userAddr, "Trade Won", `Your ${trade.symbol || 'BTC'} ${trade.direction === 'UP' ? 'LONG' : 'SHORT'} trade won! +${payout.toFixed(2)} USDC.`, "success"); } catch (e) {}
      this.settleCopyTrades(trade, payout);
      cache.trades.delete(trade.id);

      tx.wait().then(async (receipt) => {
        if (receipt.status === 1) {
          const balWei = await rpc.mainProvider.getBalance(trade.sessionAddress);
          const onChainBal = parseFloat(ethers.formatEther(balWei));
          if (session) { session.balance = onChainBal; session.lastWinAt = Date.now(); }
          this.io.to(trade.userAddr).emit('balance_update', { balance: String(onChainBal), reason: 'WIN_CONFIRMED', betId: trade.id, txHash: tx.hash });
          console.log(`✅ [On-Chain] #${betId} confirmed. On-chain balance synced to ${onChainBal}`);
        } else { throw new Error("Transaction reverted on-chain"); }
      }).catch(err => {
        console.error(`❌ [On-Chain] Confirmation failed for #${trade.id}:`, err.message);
        this.io.to(trade.userAddr).emit('payout_failed', { betId: trade.id, message: "Payout transaction failed on-chain" });
        trade.onChainSettleStarted = false;
      });
    } catch (err) {
      console.error(`❌ [On-Chain] Broadcast failed for #${trade.id}:`, err.message);
      this.io.to(trade.userAddr).emit('payout_failed', { betId: trade.id, message: err.message });
      trade.onChainSettleStarted = false;
      this.payoutNonce = null;
    }
  }

  // ──────────────────────────────────────────────────────────────────
  // COPY TRADES
  // ──────────────────────────────────────────────────────────────────
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
          if (won) { investor.copyTradingWallet.balance = (parseFloat(investor.copyTradingWallet.balance) || 0) + settledTrade.payout; }
          if (investor.activeCopies) {
            const rel = investor.activeCopies.find(c => c.providerAddress === providerAddr);
            if (rel) {
              const pnl = won ? (settledTrade.payout - settledTrade.amount) : -settledTrade.amount;
              rel.pnl = (rel.pnl || 0) + pnl;
            }
          }
          profiles.upsert(addr, investor);
          this.io.to(addr).emit('copy_trade_update', { trade: { providerAddress: providerAddr, result: settledTrade.result, amount: settledTrade.amount, payout: settledTrade.payout } });
          this.io.to(addr).emit('balance_update', { balance: String(investor.copyTradingWallet.balance), available: String(investor.copyTradingWallet.balance), reason: won ? 'COPY_WIN' : 'COPY_LOSS' });
          try {
            const n = require('./services/notificationService');
            const providerName = provider?.providerApplication?.contactInfo?.name || provider?.username || providerAddr.substring(0, 6);
            n.notifyUser(addr, won ? "Copy Trade Won" : "Copy Trade Lost", `${providerName}'s copy trade ${won ? 'won! +' : 'lost. -'}${settledTrade.payout.toFixed(2)} USDC on ${settledTrade.asset || 'BTC'}.`, won ? "success" : "error");
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[CopyTrading] settleCopyTrades error:', err.message);
    }
  }

  async ensureOperatorFunded() {
    try {
      const balStr = await rpc.getBalance(rpc.wallet.address);
      if (balStr === null || balStr === "0") return;
      const bal = parseFloat(balStr);
      if (bal < 5) {
        const tBalStr = await rpc.getBalance(config.TREASURY_ADDRESS);
        const treasuryBal = parseFloat(tBalStr || "0");
        if (treasuryBal < 20) return;
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

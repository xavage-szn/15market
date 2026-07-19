// ==================================================================================
// CLASSIC TRADING ENGINE — ON-CHAIN VERIFIED SETTLEMENT
// ==================================================================================
// Every trade is broadcast on-chain BEFORE deducting balance.
// Every settlement tx is broadcast on-chain with real hash.
// All RPC calls use broadcastWithFailover() across 4 Arc RPCs.
// ==================================================================================
const cache = require('./cache');
const config = require('./config');
const rpc = require('./rpc');
const { ethers } = require('ethers');
const crypto = require('crypto');

const STATIC_GAS_PRICE = ethers.parseUnits("60", "gwei");

class ClassicEngine {
  constructor(io) {
    this.io = io;
    this._tradeLocks = new Set(); // Prevents concurrent trade placement per user

    this.TREASURY_ABI = [
      "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
      "function settleBet(uint256 _betId, uint256 _exitPrice, uint256 _payoutAmount) external",
      "function withdraw(uint256 _amount) external",
      "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];

    // Interface for encoding tx data
    this.contractInterface = new ethers.Interface(this.TREASURY_ABI);

    if (rpc.wallet) {
      this.treasuryContract = new ethers.Contract(config.TREASURY_ADDRESS, this.TREASURY_ABI, rpc.wallet);
    }
  }

  start() {
    setInterval(() => this.ensureOperatorFunded(), 30000);
    setInterval(() => this._reclaimIdleSessionArc(), 300000); // Every 5 min

    // Trade Monitor & Result Locking
    setInterval(() => {
      const now = Date.now();
      for (const trade of cache.trades.values()) {
        if (trade.status === 'PENDING') {
          const msLeft = (trade.settleAt || 0) - now;
          const timeLeft = Math.max(0, msLeft / 1000);

          if (trade.expiryEmitted) continue;

          const currentPrice = cache.prices[trade.symbol] || trade.entryPrice;
          if (msLeft < 10000 && currentPrice > 0) cache.snapshotPrice(trade.symbol);

          if (msLeft <= 0) {
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
   * Syncs session balance to profile store so it survives server restarts.
   */
  syncBalance(userAddr, session) {
    if (!session) return;
    try {
      const profiles = require('./profiles');
      profiles.upsert(userAddr, { balance: session.balance });
    } catch (_) {}
  }

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

  // ── RESULT LOCKING ─────────────────────────────────────────────────────
  lockResult(trade) {
    if (trade.expiryEmitted || trade.isSettled) return;
    trade.isSettled = true;

    // ALWAYS lock to the price AT expiry time (trade.settleAt), NOT Date.now().
    // The 50ms monitor loop can fire late — using Date.now() picks up post-expiry
    // prices that may have moved against the user, causing win→lose flips.
    const settleTime = trade.settleAt || Date.now();
    const lockDelay = Date.now() - settleTime;
    let exitPrice = cache.getHistoricalPrice(trade.symbol, settleTime);

    // Fallback: last snapshotted price (never use live cache.prices)
    if (exitPrice <= 0) exitPrice = cache.getLatestPrice(trade.symbol) || 0;
    if (exitPrice <= 0) exitPrice = trade.entryPrice;

    if (trade.entryPrice > 0 && exitPrice > 0) {
      const deviation = Math.abs(exitPrice - trade.entryPrice) / trade.entryPrice;
      if (deviation > 0.30) exitPrice = trade.entryPrice;
    }

    const isUp = this.resolveDirection(trade.direction) === 1;
    const won = isUp ? (exitPrice > trade.entryPrice) : (exitPrice < trade.entryPrice);

    trade.expiryEmitted = true;
    trade.lockedExitPrice = exitPrice;
    trade.lockedWon = won;

    console.log(`[Engine] Locked #${trade.id} | Won: ${won} | Entry: ${trade.entryPrice} | Exit: ${exitPrice} | Lock delay: ${lockDelay}ms`);

    this.io.to(trade.userAddr).emit('trade_expired', {
      betId: trade.id,
      exitPrice,
      won,
      stakeTxHash: trade.stakeTxHash || null,
      status: 'RESOLVING'
    });

    if (won) {
      this.creditWinner(trade, exitPrice);
      this.settleOnChainBackground(trade);
    } else {
      trade.status = 'LOST';
      this.settleTradeLocally(trade);
    }
  }

  // ── INSTANT WINNER CREDIT ──────────────────────────────────────────────
  creditWinner(trade, exitPrice) {
    const sharePrice = Math.max(0.03, Math.min(0.97, Number(trade.sharePrice) || 0.50));
    const grossPayout = trade.amount / sharePrice;
    const netPayout = grossPayout * 0.99;
    const payoutAmount = Math.max(0.000001, netPayout);
    const payoutStr = payoutAmount.toFixed(6);

    const exitPriceBigInt = ethers.parseUnits(Number(exitPrice).toFixed(8), 8);
    let payoutBigInt;
    try { payoutBigInt = ethers.parseEther(payoutStr); } catch { payoutBigInt = ethers.parseEther("0.000001"); }

    trade.status = 'WON';
    trade.payoutAmount = payoutAmount;
    trade.payoutStr = payoutStr;
    trade.exitPriceBigInt = exitPriceBigInt;
    trade.payoutBigInt = payoutBigInt;

    const session = cache.sessions.get(trade.userAddr);
    if (session) {
      session.balance = Number((session.balance + payoutAmount).toFixed(6));
      session.lastWinAt = Date.now();
      session.lastTradeAt = Date.now();
      this.syncBalance(trade.userAddr, session);
    }

    this.io.to(trade.userAddr).emit('balance_update', {
      balance: String(session ? session.balance : payoutAmount),
      reason: 'WIN_PAYOUT',
      betId: trade.id,
      payout: payoutAmount
    });

    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id,
      won: true,
      status: 'WON',
      exitPrice,
      payout: payoutAmount,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration,
      entryPrice: trade.entryPrice,
      stakeTxHash: trade.stakeTxHash || null,
      userAddr: trade.userAddr
    });

    this.io.to(trade.userAddr).emit('payout_completed', {
      tradeId: trade.id,
      betId: trade.id,
      payout: payoutAmount
    });

    this.io.emit('global_trade_settled', {
      betId: trade.id,
      won: true,
      status: 'WON',
      payout: payoutAmount,
      exitPrice: exitPrice,
      userAddr: trade.userAddr
    });

    cache.pushHistory(trade.userAddr, {
      ...trade,
      won: true,
      status: 'PAID',
      exitPrice,
      payout: payoutAmount,
      settledAt: Date.now()
    });

    this.settleCopyTrades(trade, payoutAmount);

    try {
      const notifier = require('./services/notificationService');
      notifier.notifyUser(trade.userAddr, "Trade Won", `Your ${trade.symbol?.toUpperCase() || 'BTC'} ${trade.direction === 1 ? 'LONG' : 'SHORT'} trade won! +${payoutAmount.toFixed(2)} USDC.`, "success");
    } catch (e) {}

    console.log(`[Instant] Bet #${trade.id} credited. Payout: ${payoutStr} USDC`);
  }

  // ── BACKGROUND ON-CHAIN SETTLEMENT ─────────────────────────────────────
  // Broadcasts settleBet via failover RPC. Verifies receipt in background.
  settleOnChainBackground(trade) {
    const betId = BigInt(trade.id);
    const exitPriceBigInt = trade.exitPriceBigInt;
    const payoutBigInt = trade.payoutBigInt;
    const payoutStr = trade.payoutStr;
    const payoutAmount = trade.payoutAmount;

    (async () => {
      let retries = 0;
      const maxRetries = 3;

      while (retries < maxRetries) {
        try {
          const data = this.contractInterface.encodeFunctionData('settleBet', [
            betId, exitPriceBigInt, payoutBigInt
          ]);
          const nonce = await rpc.getNonce(rpc.wallet.address);

          const txResponse = await rpc.broadcastWithFailover(
            config.PRIVATE_KEY,
            {
              to: config.TREASURY_ADDRESS,
              data,
              gasLimit: 600000,
              gasPrice: STATIC_GAS_PRICE,
              nonce,
              chainId: rpc.chainId
            }
          );

          console.log(`[BG-Settle] #${betId} broadcasted | Tx: ${txResponse.hash}`);

          const receipt = await rpc.waitForReceipt(txResponse.hash, 8, 5000);
          if (receipt && receipt.status === 1) {
            console.log(`[BG-Settle] #${betId} confirmed on-chain`);
            cache.trades.delete(String(betId));
            return;
          }

          try {
            const verifyBet = await this.treasuryContract.bets(betId);
            if (verifyBet && verifyBet.settled) {
              console.log(`[BG-Settle] #${betId} confirmed via direct check`);
              cache.trades.delete(String(betId));
              return;
            }
          } catch {}

          throw new Error("Receipt not found or status 0");
        } catch (err) {
          retries++;
          console.error(`[BG-Settle] #${betId} attempt ${retries}/${maxRetries} failed:`, err.message?.substring(0, 120));
          if (retries < maxRetries) await new Promise(r => setTimeout(r, 5000 * retries));
        }
      }

      // ALL RETRIES FAILED — Revert the in-memory credit (guard against negative)
      console.error(`[BG-Settle] #${betId} FAILED after ${maxRetries} attempts. Reverting credit.`);
      const session = cache.sessions.get(trade.userAddr);
      if (session) {
        session.balance = Number(Math.max(0, session.balance - payoutAmount).toFixed(6));
        this.syncBalance(trade.userAddr, session);
        this.io.to(trade.userAddr).emit('balance_update', {
          balance: String(session.balance),
          reason: 'SETTLEMENT_FAILED_REVERT',
          betId: String(betId)
        });
      }

      trade.status = 'LOST';
      trade.lockedWon = false;
      cache.pushHistory(trade.userAddr, {
        ...trade,
        won: false,
        exitPrice: trade.lockedExitPrice,
        settledAt: Date.now()
      });

      this.io.to(trade.userAddr).emit('payout_failed', {
        betId: String(betId),
        message: "On-chain settlement failed. Payout was reverted."
      });

      cache.trades.delete(String(betId));
    })();
  }

  // ── TRADE PLACEMENT ────────────────────────────────────────────────────
  // Sends placeBet on-chain FIRST. Returns real tx hash. Deducts balance
  // after successful broadcast. Verifies confirmation in background.
  async placeTrade(tradeParams, identityPayload) {
    const userAddr = this.normalizeAddr(identityPayload.address);
    const sessionWallet = rpc.deriveSessionWallet(userAddr);

    // Prevent concurrent trades for the same user
    if (this._tradeLocks.has(userAddr)) {
      return { success: false, error: 'A trade is already being placed. Please wait.' };
    }
    this._tradeLocks.add(userAddr);

    try {
      return await this._placeTradeInner(tradeParams, identityPayload, userAddr, sessionWallet);
    } finally {
      this._tradeLocks.delete(userAddr);
    }
  }

  async _placeTradeInner(tradeParams, identityPayload, userAddr, sessionWallet) {

    const rawAmount = tradeParams.amount;
    const amount = Number(rawAmount);
    if (!rawAmount || isNaN(amount) || amount <= 0) {
      return { success: false, error: `Invalid trade amount: "${rawAmount}"` };
    }
    if (amount < 0.001) {
      return { success: false, error: 'Minimum trade amount is 0.001 USDC' };
    }

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

    let entryPrice = Number(cache.prices[symbol]);
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      entryPrice = Number(tradeParams.entryPrice);
    }
    if (!entryPrice || isNaN(entryPrice) || entryPrice <= 0) {
      return { success: false, error: 'Price feed not available. Please wait and retry.' };
    }

    const currentOdds = cache.liveOdds?.[symbol]?.[duration];
    let sharePrice = 0.50;
    if (currentOdds) {
      sharePrice = direction === 1 ? currentOdds.LONG : currentOdds.SHORT;
    }
    sharePrice = Math.max(0.03, Math.min(0.97, sharePrice));

    const contractPrice = ethers.parseUnits(Math.max(0, entryPrice).toFixed(8), 8);
    const contractDir = direction === 1 ? 0 : 1;

    let stakeWei;
    try {
      stakeWei = ethers.parseEther(amount.toFixed(6));
    } catch (e) {
      return { success: false, error: `Invalid amount format: ${e.message}` };
    }

    // Check balance BEFORE sending on-chain
    const session = cache.sessions.get(userAddr);
    if (!session || session.balance < amount) {
      return { success: false, error: 'Insufficient balance' };
    }

    // ── SEND ON-CHAIN FIRST ──────────────────────────────────────────────
    let realHash;
    try {
      // Ensure session wallet has native ARC for gas + stake
      await this._ensureSessionWalletFunded(sessionWallet, stakeWei);

      const data = this.contractInterface.encodeFunctionData('placeBet', [
        numericId, contractDir, duration, contractPrice, marketId, sessionWallet.address
      ]);
      const nonce = await rpc.getNonce(sessionWallet.address);

      const txResponse = await rpc.broadcastWithFailover(
        sessionWallet.privateKey,
        {
          to: config.TREASURY_ADDRESS,
          data,
          value: stakeWei,
          gasLimit: 400000,
          gasPrice: STATIC_GAS_PRICE,
          nonce,
          chainId: rpc.chainId
        }
      );

      realHash = txResponse.hash;
      console.log(`[Place] #${numericId} broadcasted | Tx: ${realHash}`);
    } catch (err) {
      console.error(`[Place] #${numericId} broadcast failed:`, err.message?.substring(0, 150));
      return { success: false, error: `Trade broadcast failed: ${err.message?.substring(0, 100)}` };
    }

    // ── DEDUCT BALANCE AFTER SUCCESSFUL BROADCAST ────────────────────────
    session.balance = Number((session.balance - amount).toFixed(6));
    session.lastTradeAt = Date.now();
    this.syncBalance(userAddr, session);

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
      createdAt: Date.now(),
      settleAt: Date.now() + (duration * 1000),
      settleRetries: 0,
      stakeTxHash: realHash,
    };
    cache.trades.set(trade.id, trade);

    this.io.to(userAddr).emit('balance_update', {
      balance: String(session.balance),
      reason: 'TRADE_PLACED',
      betId: numericId.toString()
    });

    // ── VERIFY CONFIRMATION IN BACKGROUND ────────────────────────────────
    rpc.waitForReceipt(realHash, 8, 3000).then(receipt => {
      if (!receipt || receipt.status !== 1) {
        console.error(`[Place] #${numericId} tx NOT confirmed. Reverting balance.`);
        cache.trades.delete(trade.id);
        const sess = cache.sessions.get(userAddr);
        if (sess) {
          sess.balance = Number(Math.max(0, sess.balance + amount).toFixed(6));
          this.syncBalance(userAddr, sess);
          this.io.to(userAddr).emit('balance_update', {
            balance: String(sess.balance),
            reason: 'TRADE_FAILED_REVERT',
            betId: String(numericId)
          });
        }
        this.io.to(userAddr).emit('trade_failed', {
          betId: String(numericId),
          message: "Trade failed on-chain. Balance restored.",
          txHash: realHash
        });
      } else {
        console.log(`[Place] #${numericId} confirmed on-chain`);
      }
    }).catch(() => {});

    // Return REAL tx hash — verifiable on ArcScan
    return { success: true, txHash: realHash, tradeId: trade.id };
  }

  settleTradeLocally(trade) {
    trade.status = 'LOST';
    trade.settledAt = Date.now();

    this.io.to(trade.userAddr).emit('trade_settled', {
      betId: trade.id,
      won: false,
      status: 'LOST',
      exitPrice: trade.lockedExitPrice,
      stakeTxHash: trade.stakeTxHash || null,
      userAddr: trade.userAddr,
      entryPrice: trade.entryPrice,
      amount: trade.amount,
      symbol: trade.symbol,
      direction: trade.direction,
      duration: trade.duration
    });

    cache.pushHistory(trade.userAddr, {
      ...trade,
      won: false,
      exitPrice: trade.lockedExitPrice,
      settledAt: Date.now()
    });

    this.settleCopyTrades(trade, 0);

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
      const won = providerTrade.won || providerTrade.status === 'WON' || providerTrade.status === 'PAID';
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
              notifier.notifyUser(addr, "Copy Trade Won", `${providerName}'s copy trade won! +${settledTrade.payout.toFixed(2)} USDC on ${settledTrade.asset?.toUpperCase() || 'BTC'}.`, "success");
            } else {
              notifier.notifyUser(addr, "Copy Trade Lost", `${providerName}'s copy trade lost. -${settledTrade.amount.toFixed(2)} USDC on ${settledTrade.asset?.toUpperCase() || 'BTC'}.`, "error");
            }
          } catch (e) {}
        }
      }
    } catch (err) {
      console.error('[CopyTrading] settleCopyTrades error:', err.message);
    }
  }

  async _reclaimIdleSessionArc() {
    if (!rpc.wallet) return;

    const MIN_TO_KEEP = 0.05;
    const MAX_RECLAIM = 50;

    for (const [userAddr, session] of cache.sessions.entries()) {
      if (!session || !session.wallet) continue;
      try {
        const bal = await rpc.getBalance(session.wallet.address);
        const balNum = parseFloat(bal || '0');
        if (balNum <= MIN_TO_KEEP) continue;

        // Sum up active trade stakes for this user
        let lockedAmount = 0;
        for (const trade of cache.trades.values()) {
          if (trade.sessionAddress === session.wallet.address.toLowerCase() && trade.status === 'PENDING') {
            lockedAmount += trade.amount;
          }
        }

        const reclaimable = Math.min(MAX_RECLAIM, Math.max(0, balNum - lockedAmount - MIN_TO_KEEP));
        if (reclaimable < 0.01) continue;

        console.log(`[Reclaim] ${session.wallet.address.slice(0, 10)}... has ${balNum} ARC, reclaiming ${reclaimable}`);

        const nonce = await rpc.getNonce(session.wallet.address);
        const txResponse = await rpc.broadcastWithFailover(
          session.wallet.privateKey,
          {
            to: rpc.wallet.address,
            value: ethers.parseEther(reclaimable.toFixed(6)),
            gasLimit: 21000,
            gasPrice: STATIC_GAS_PRICE,
            nonce,
            chainId: rpc.chainId
          }
        );
        await rpc.waitForReceipt(txResponse.hash);
        console.log(`[Reclaim] Reclaimed ${reclaimable} ARC from ${session.wallet.address.slice(0, 10)}`);
      } catch (e) {
        // Skip this wallet on error, move on
      }
    }
  }

  async _ensureSessionWalletFunded(sessionWallet, requiredWei) {
    const sessionBal = await rpc.getBalance(sessionWallet.address);
    const sessionBalNum = parseFloat(sessionBal || '0');
    const requiredNum = parseFloat(ethers.formatEther(requiredWei));
    const GAS_BUFFER = 0.01; // 0.01 ARC buffer for gas

    if (sessionBalNum >= requiredNum + GAS_BUFFER) return;

    const needed = Math.max(0, requiredNum + GAS_BUFFER - sessionBalNum);
    if (needed <= 0) return;

    // Round up to 2 decimals for clean transfer
    const sendAmount = Math.ceil(needed * 100) / 100;
    if (sendAmount <= 0) return;

    console.log(`[SessionFunder] Session wallet ${sessionWallet.address.slice(0, 10)}... needs ${sendAmount} ARC (has ${sessionBalNum})`);

    try {
      const operatorBal = await rpc.getBalance(rpc.wallet.address);
      if (parseFloat(operatorBal || '0') < sendAmount + 0.05) {
        console.error(`[SessionFunder] Operator insufficient balance (${operatorBal}) to fund ${sendAmount} ARC`);
        return;
      }

      const nonce = await rpc.getNonce(rpc.wallet.address);
      const txResponse = await rpc.broadcastWithFailover(
        config.PRIVATE_KEY,
        {
          to: sessionWallet.address,
          value: ethers.parseEther(sendAmount.toFixed(6)),
          gasLimit: 21000,
          gasPrice: STATIC_GAS_PRICE,
          nonce,
          chainId: rpc.chainId
        }
      );
      console.log(`[SessionFunder] Sent ${sendAmount} ARC to ${sessionWallet.address.slice(0, 10)}... | Tx: ${txResponse.hash}`);
      await rpc.waitForReceipt(txResponse.hash);
    } catch (e) {
      console.error(`[SessionFunder] Failed to fund session wallet:`, e.message?.substring(0, 120));
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
        if (treasuryBal < 20) {
           console.log(`[GasTank] Treasury low (${treasuryBal} ARC). Cannot refill Operator.`);
           return;
        }

        console.log(`[GasTank] Low (${bal} ARC). Refilling 20 ARC...`);
        const data = this.contractInterface.encodeFunctionData('withdraw', [ethers.parseUnits("20", 18)]);
        const nonce = await rpc.getNonce(rpc.wallet.address);
        const txResponse = await rpc.broadcastWithFailover(
          config.PRIVATE_KEY,
          {
            to: config.TREASURY_ADDRESS,
            data,
            gasLimit: 150000,
            gasPrice: STATIC_GAS_PRICE,
            nonce,
            chainId: rpc.chainId
          }
        );
        const receipt = await rpc.waitForReceipt(txResponse.hash);
        if (!receipt || receipt.status !== 1) {
          console.error("[GasTank] Refill tx reverted on-chain");
        }
      }
    } catch (e) {
      console.error("[GasTank] Refill failed:", e.message);
    }
  }
}

module.exports = ClassicEngine;

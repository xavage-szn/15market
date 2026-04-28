// ============================================================
// nexus-core/src/services/nexus-auto-signer.js
// CommonJS version of the Auto-Signer service
// ============================================================

const { ethers } = require('ethers');
const Redis = require('ioredis');
const { Queue, Worker } = require('bullmq');
const cache = require('../cache');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
  retryStrategy: (times) => Math.min(times * 50, 2000)
});

redis.on('error', (err) => {
  console.warn("⚠️ [Redis] Connection error:", err.message);
});

const FACTORY_ABI = [
  "constructor(address _operator)",
  "event WalletDeployed(address indexed player, address wallet)",
  "function createWallet(address player) external",
  "function deployAndDeposit() external payable",
  "function getWalletAddress(address player) public view returns (address)",
  "function operator() public view returns (address)",
  "function playerToWallet(address) public view returns (address)"
];

const WALLET_ABI = [
  "constructor(address _owner, address _operator)",
  "event BatchSwept(uint256 amount, address treasury)",
  "event Deposit(address indexed player, uint256 amount, uint256 newAvailableBalance)",
  "event StakeLocked(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 remainingAvailable)",
  "event TradeSettledLoss(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 pendingLossTotal)",
  "event TradeSettledWin(bytes32 indexed tradeId, address indexed player, uint256 stake, uint256 profit, uint256 totalPayout)",
  "event Withdrawal(address indexed player, uint256 amount, uint256 remainingBalance)",
  "function availableBalance() public view returns (uint256)",
  "function checkInvariant() public view returns (bool)",
  "function deposit() external payable",
  "function lockStake(bytes32 tradeId, uint256 amount) external",
  "function lockedBalance() public view returns (uint256)",
  "function operator() public view returns (address)",
  "function owner() public view returns (address)",
  "function pendingLoss() public view returns (uint256)",
  "function settleLoss(bytes32 tradeId, uint256 amount) external",
  "function settleWin(bytes32 tradeId, uint256 stake, uint256 profit) external",
  "function sweepLosses(address payable treasury) external",
  "function withdraw(uint256 amount) external",
  "receive()"
];

class RedisMirrorService {
  constructor(provider, io) {
    this.provider = provider;
    this.io = io;
    this.lastBlock = 0;
    this.setupGlobalMonitoring();
  }

  setupGlobalMonitoring() {
    const iface = new ethers.Interface(WALLET_ABI);
    
    const pollLogs = async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        if (this.lastBlock === 0) {
          this.lastBlock = currentBlock - 50; 
        }
        if (currentBlock <= this.lastBlock) return;

        const topics = [
          [
            iface.getEvent("Deposit").topicHash,
            iface.getEvent("StakeLocked").topicHash,
            iface.getEvent("TradeSettledWin").topicHash,
            iface.getEvent("TradeSettledLoss").topicHash,
            iface.getEvent("Withdrawal").topicHash
          ]
        ];

        const logs = await this.provider.getLogs({
          fromBlock: this.lastBlock + 1,
          toBlock: currentBlock,
          topics
        });

        for (const log of logs) {
          try {
            const parsed = iface.parseLog(log);
            if (!parsed) continue;

            const { name, args } = parsed;
            let playerId = "";
            let newAvailable = "0";

            if (name === "Deposit") {
              playerId = args[0].toLowerCase();
              newAvailable = ethers.formatUnits(args[2], 18);
              await redis.set(`balance:${playerId}:available`, newAvailable);
            } else if (name === "StakeLocked") {
              playerId = args[1].toLowerCase();
              newAvailable = ethers.formatUnits(args[3], 18);
              await redis.set(`balance:${playerId}:available`, newAvailable);
              await redis.incrby(`balance:${playerId}:locked`, args[2].toString());
            } else if (name === "TradeSettledWin") {
              playerId = args[1].toLowerCase();
              // Note: totalPayout logic here if needed, but usually we just sync available
              // We'll trigger a full sync for accuracy on settlement
              continue; 
            } else if (name === "TradeSettledLoss") {
              playerId = args[1].toLowerCase();
              await redis.set(`balance:${playerId}:pending_loss`, ethers.formatUnits(args[3], 18));
              continue;
            } else if (name === "Withdrawal") {
              playerId = args[0].toLowerCase();
              newAvailable = ethers.formatUnits(args[2], 18);
              await redis.set(`balance:${playerId}:available`, newAvailable);
            }

            if (playerId && this.io) {
              console.log(`[REAL-TIME SYNC] ${name} for ${playerId} -> ${newAvailable}`);
              this.io.to(playerId).emit('balance_update', { 
                balance: newAvailable, 
                available: newAvailable, 
                reason: name 
              });
            }
          } catch (e) {
            console.error("Error parsing log:", e.message);
          }
        }
        this.lastBlock = currentBlock;
      } catch (err) {
        console.error("Global log polling failed:", err.message);
      }
    };

    setInterval(pollLogs, 4000); // 4s poll for responsive state
  }

  async syncPlayer(player, walletContract) {
    const addr = player.toLowerCase();
    
    // BALANCE GUARD: If a trade was JUST placed/settled, ignore sync for 4 seconds
    const lastAction = await redis.get(`balance:${addr}:last_action_ts`);
    if (lastAction && (Date.now() - parseInt(lastAction)) < 4000) {
      return null;
    }

    const available = await walletContract.availableBalance();
    const locked = await walletContract.lockedBalance();
    const pending = await walletContract.pendingLoss();
    
    const formattedAvail = ethers.formatUnits(available, 18);
    await redis.set(`balance:${addr}:available`, formattedAvail);
    await redis.set(`balance:${addr}:locked`, locked.toString());
    await redis.set(`balance:${addr}:pending_loss`, ethers.formatUnits(pending, 18));

    if (this.io) {
      this.io.to(addr).emit('balance_update', { 
        balance: formattedAvail, 
        available: formattedAvail, 
        reason: 'SYNC' 
      });
    }
    return formattedAvail;
  }
}

class SettlementService {
  constructor(operatorWallet, io, factoryAddress, cacheInstance) {
    this.operatorWallet = operatorWallet;
    this.io = io;
    this.isPolling = false;
    this.factoryAddress = factoryAddress;
    this.factoryContract = new ethers.Contract(factoryAddress, FACTORY_ABI, operatorWallet);
    this.tradeCounterKey = 'global:trade_counter';
    this.cache = cacheInstance;
  }

  async startSettlementPoller() {
    if (this.isPolling) return;
    this.isPolling = true;
    console.log("🚀 [SettlementService] Poller started");
    
    setInterval(async () => {
      try {
        const tradeIds = await redis.smembers('active_trades');
        for (const tradeId of tradeIds) {
          const tradeData = await redis.get(`trade:${tradeId}`);
          if (!tradeData) {
            await redis.srem('active_trades', tradeId);
            continue;
          }
          
          const trade = JSON.parse(tradeData);
          if (Date.now() >= trade.closeTime) {
            console.log(`🕒 [SettlementService] Settling trade ${tradeId}...`);
            await this.settleTrade(tradeId);
          }
        }
      } catch (err) {
        console.error("Poller tick failed:", err);
      }
    }, 1000);
    this.cache = cache;
    this.startBatchWorker();
  }

  startBatchWorker() {
    console.log("🚀 [BatchSettler] Semi-parallel worker initiated (5s interval)");
    setInterval(() => this.processBatchWinnings(), 5000);
  }

  async processBatchWinnings() {
    const wins = [];
    let count = 0;
    
    // 1. Pull all pending wins from Redis (Batch capture)
    while (count < 50) {
      const winData = await redis.rpop('winning_payouts_queue');
      if (!winData) break;
      wins.push(JSON.parse(winData));
      count++;
    }

    if (wins.length === 0) return;

    console.log(`📦 [BatchSettler] Processing ${wins.length} winning payouts in semi-parallel...`);

    // 2. Semi-parallel processing (chunks of 5)
    for (let i = 0; i < wins.length; i += 5) {
      const chunk = wins.slice(i, i + 5);
      await Promise.allSettled(chunk.map(async (win) => {
        try {
          const walletContract = new ethers.Contract(win.walletAddress, WALLET_ABI, this.operatorWallet);
          const amountWei = ethers.parseUnits(win.amount, 18);
          
          // Using settleWin to both RELEASE state and CREDIT profit from treasury
          // In the new model, settleWin should be called by the operator to move funds from treasury
          const tx = await walletContract.settleWin(win.tradeId, 0, amountWei, { gasLimit: 200000 });
          console.log(`✅ [BatchSettler] Payout SUCCESS for ${win.tradeId}: ${tx.hash}`);
        } catch (err) {
          console.error(`❌ [BatchSettler] Payout FAILED for ${win.tradeId}:`, err.message);
          // Re-queue on failure for retry
          await redis.lpush('winning_payouts_queue', JSON.stringify(win));
        }
      }));
    }
  }

  async submitTrade(playerId, symbol, direction, stake, duration) {
    try {
      const addr = playerId.toLowerCase();
      
      // CACHE-FIRST WALLET LOOKUP
      let walletAddress = await redis.get(`scw:${addr}`);
      if (!walletAddress) {
        walletAddress = await this.factoryContract.playerToWallet(playerId);
        if (walletAddress && walletAddress !== ethers.ZeroAddress) {
          await redis.set(`scw:${addr}`, walletAddress);
        }
      }

      if (!walletAddress || walletAddress === ethers.ZeroAddress) {
        throw new Error("User has no smart contract wallet. Deposit first.");
      }
      
      const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
      const tradeId = ethers.id(`${addr}-${Date.now()}`);
      const stakeWei = ethers.parseUnits(String(stake), 18);

      // --- ON-CHAIN STAKE LOCK (treasury-first deduction via lockStake) ---
      // This deducts from availableBalance and moves to lockedBalance IN the SCW.
      // No USDC moves between wallets here — it's just an internal state update.
      const lockTx = await walletContract.lockStake(tradeId, stakeWei, { gasLimit: 200000 });
      await lockTx.wait(); // Wait for the lock to be confirmed on-chain
      
      // --- READ THE REAL ON-CHAIN BALANCE AFTER LOCK ---
      const realAvailWei = await walletContract.availableBalance();
      const realAvail = ethers.formatUnits(realAvailWei, 18);
      
      // --- SEED REDIS WITH REAL ON-CHAIN VALUE (write-through cache) ---
      const availKey = `balance:${addr}:available`;
      await redis.set(availKey, realAvail);
      await redis.set(`balance:${addr}:last_action_ts`, Date.now().toString());

      const entryPrice = await this.getLatestPrice(symbol);
      const trade = {
        tradeId,
        playerId,
        walletAddress,
        stakeAmount: String(stake),
        entryPrice,
        closeTime: Date.now() + (duration * 1000),
        startTime: Date.now(),
        symbol,
        direction,
        txHash: lockTx.hash
      };

      // REGISTER TRADE
      await redis.set(`trade:${tradeId}`, JSON.stringify(trade));
      await redis.sadd(`active_trades`, tradeId);
      
      // BROADCAST REAL BALANCE TO FRONTEND IMMEDIATELY
      this.io.to(addr).emit('trade_placed', trade);
      this.io.to(addr).emit('balance_update', { 
        balance: realAvail, 
        available: realAvail, 
        reason: 'STAKE_LOCKED',
        amount: String(stake),
        txHash: lockTx.hash
      });

      console.log(`✅ [Trade] ${tradeId} staked. Real on-chain available: ${realAvail} USDC`);
      return { tradeId, success: true, newBalance: realAvail, txHash: lockTx.hash, mode: 'scw-lockstake' };
    } catch (err) {
      console.error("submitTrade failed:", err);
      return { success: false, error: err.message };
    }
  }

  async settleTrade(tradeId) {
    const tradeData = await redis.get(`trade:${tradeId}`);
    if (!tradeData) return;
    
    const trade = JSON.parse(tradeData);
    const addr = trade.playerId.toLowerCase();
    
    // Use historical price at the exact close time for stable settlement
    const key = trade.symbol.toLowerCase().replace('usdt', '');
    const exitPrice = this.cache ? this.cache.getHistoricalPrice(key, trade.closeTime) : await this.getLatestPrice(trade.symbol);
    const isCall = trade.direction === 1 || trade.direction === 'UP' || trade.direction === 'buy';
    const won = isCall ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;

    // Use cached wallet address from trade record first, then fallback to RPC
    const walletAddress = trade.walletAddress || await this.factoryContract.playerToWallet(trade.playerId);
    const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
    const stakeWei = ethers.parseUnits(String(trade.stakeAmount), 18);

    let settleTxHash = null;
    try {
      if (won) {
        // WIN: The stake is locked in the SCW. Call settleWin to:
        // 1) release the locked stake back to available
        // 2) credit the profit from the treasury to the SCW
        const multiplier = 1.90; // 90% profit on wins
        const profitWei = BigInt(Math.floor(Number(stakeWei) * 0.90));

        console.log(`[Settlement] WIN for ${tradeId}. Calling settleWin...`);
        const winTx = await walletContract.settleWin(tradeId, stakeWei, profitWei, { gasLimit: 250000 });
        await winTx.wait();
        settleTxHash = winTx.hash;
        console.log(`✅ [Settlement] settleWin confirmed: ${winTx.hash}`);
      } else {
        // LOSS: Stake is locked in SCW. Call settleLoss to:
        // 1) move the locked stake to pendingLoss (ready for batch sweep to treasury)
        console.log(`[Settlement] LOSS for ${tradeId}. Calling settleLoss...`);
        const lossTx = await walletContract.settleLoss(tradeId, stakeWei, { gasLimit: 200000 });
        await lossTx.wait();
        settleTxHash = lossTx.hash;
        console.log(`✅ [Settlement] settleLoss confirmed: ${lossTx.hash}`);
      }

      // --- READ REAL ON-CHAIN BALANCE AFTER SETTLEMENT ---
      const realAvailWei = await walletContract.availableBalance();
      const realAvail = ethers.formatUnits(realAvailWei, 18);
      await redis.set(`balance:${addr}:available`, realAvail);
      await redis.set(`balance:${addr}:last_action_ts`, Date.now().toString());

      // Cleanup Redis
      await redis.del(`trade:${tradeId}`);
      await redis.srem(`active_trades`, tradeId);

      const payout = won ? (parseFloat(trade.stakeAmount) * 1.90).toFixed(4) : '0';
      const result = {
        tradeId,
        success: true,
        won,
        entryPrice: trade.entryPrice,
        exitPrice,
        payout,
        newBalance: realAvail,
        txHash: settleTxHash
      };

      // Push final result + real balance to frontend
      this.io.to(addr).emit('trade_settled', result);
      this.io.to(addr).emit('balance_update', {
        balance: realAvail,
        available: realAvail,
        reason: won ? 'WIN' : 'LOSS',
        payout,
        txHash: settleTxHash
      });

      // Trigger batch sweep for accumulated losses
      if (!won) this.triggerBatchSweep();

      return result;
    } catch (err) {
      console.error("settleTrade failed:", err);
      return { success: false, error: err.message };
    }
  }

  async triggerBatchSweep() {
    if (!process.env.TREASURY_ADDRESS) {
      console.warn("[SWEEP] TREASURY_ADDRESS not configured, skipping sweep.");
      return;
    }
    try {
      const players = await redis.keys('scw:*');
      for (const key of players) {
        const player = key.replace('scw:', '');
        const walletAddress = await redis.get(key);
        if (!walletAddress || walletAddress === ethers.ZeroAddress) continue;

        const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
        const pendingLossWei = await walletContract.pendingLoss();
        
        if (pendingLossWei > 0n) {
          console.log(`[SWEEP] Sweeping ${ethers.formatUnits(pendingLossWei, 18)} USDC from ${player} to treasury...`);
          const tx = await walletContract.sweepLosses(process.env.TREASURY_ADDRESS);
          await tx.wait();
          console.log(`\u2705 [SWEEP] Swept for ${player}: ${tx.hash}`);
        }
      }
    } catch (err) {
      console.error("Batch sweep execution failed:", err.message);
    }
  }

  async getLatestPrice(symbol) {
    const price = await redis.get(`price:${symbol.toLowerCase()}`);
    return parseFloat(price || '0');
  }
}

const setupBatchSweepJob = (operatorWallet, factoryContract) => {
  const sweepQueue = new Queue('sweep-losses', { connection: redis });
  
  const worker = new Worker('sweep-losses', async (job) => {
    console.log("[JOB] Starting Batch Loss Sweep...");
    try {
      const keys = await redis.keys('balance:*:pending_loss');
      for (const key of keys) {
        const val = await redis.get(key);
        if (val && BigInt(val) > 0n) {
          const player = key.split(':')[1];
          const walletAddress = await factoryContract.playerToWallet(player);
          const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, operatorWallet);
          try {
            const tx = await walletContract.sweepLosses(process.env.TREASURY_ADDRESS);
            await tx.wait();
            await redis.set(key, "0");
            console.log(`[SWEEP] Success for ${player}`);
          } catch (err) {
            console.error(`[SWEEP] Failed for ${player}:`, err.message);
          }
        }
      }
    } catch (e) {
      console.error("Sweep job failed:", e);
    }
  }, { connection: redis });

  sweepQueue.add('sweep', {}, {
    repeat: {
      pattern: '*/2 * * * *'
    }
  });
};

module.exports = {
  RedisMirrorService,
  SettlementService,
  setupBatchSweepJob,
  FACTORY_ABI,
  WALLET_ABI
};
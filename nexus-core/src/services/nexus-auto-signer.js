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
  }

  async submitTrade(playerId, symbol, direction, stake, duration) {
    try {
      const addr = playerId.toLowerCase();
      
      // CACHE-FIRST WALLET LOOKUP (Eliminates RPC lag during trade start)
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
      const stakeWei = ethers.parseUnits(stake, 18); 

      // --- INSTANT UI FEEDBACK (OPTIMISTIC REDIS DEDUCTION) ---
      const availKey = `balance:${addr}:available`;
      const currentAvail = await redis.get(availKey) || "0";
      const newAvail = Math.max(0, parseFloat(currentAvail) - parseFloat(stake)).toFixed(6);
      await redis.set(availKey, newAvail);
      await redis.set(`balance:${addr}:last_action_ts`, Date.now().toString());

      const trade = {
        tradeId,
        playerId,
        stakeAmount: stake,
        entryPrice: await this.getLatestPrice(symbol),
        closeTime: Date.now() + (duration * 1000),
        startTime: Date.now(),
        symbol,
        direction,
        txHash: null
      };

      // 1. REGISTER TRADE INSTANTLY
      await redis.set(`trade:${tradeId}`, JSON.stringify(trade));
      await redis.sadd(`active_trades`, tradeId);
      
      // 2. BROADCAST TO FRONTEND IMMEDIATELY
      this.io.to(addr).emit('trade_placed', trade);
      this.io.to(addr).emit('balance_update', { 
        balance: newAvail, 
        available: newAvail, 
        reason: 'TRADE_PLACED',
        amount: stake
      });

      // 3. BACKGROUND ON-CHAIN LOCKING
      walletContract.lockStake(tradeId, stakeWei, { gasLimit: 150000 }).then(tx => {
        trade.txHash = tx.hash;
        redis.set(`trade:${tradeId}`, JSON.stringify(trade));
      }).catch(err => {
        console.error(`❌ [Settlement] Background LockStake FAILED for ${tradeId}:`, err.message);
      });

      return { tradeId, success: true, mode: 'instant-optimistic-locking' };
    } catch (err) {
      console.error("submitTrade failed:", err);
      return { success: false, error: err.message };
    }
  }

  async settleTrade(tradeId) {
    const tradeData = await redis.get(`trade:${tradeId}`);
    if (!tradeData) return;
    
    const trade = JSON.parse(tradeData);
    
    // Stable Settlement Logic from 95cd1b5: Use historical price at the exact close time
    const key = trade.symbol.toLowerCase().replace('usdt', '');
    const exitPrice = this.cache ? this.cache.getHistoricalPrice(key, trade.closeTime) : await this.getLatestPrice(trade.symbol);
    const isCall = trade.direction === 1 || trade.direction === 'UP' || trade.direction === 'buy';
    const won = isCall ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;

    const walletAddress = await this.factoryContract.playerToWallet(trade.playerId);
    const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);

    try {
      const stakeWei = ethers.parseUnits(trade.stakeAmount, 18);
      let tx;

      if (won) {
        // WIN: Update on-chain SCW state (release stake + add profit)
        // Correct multiplier logic from UserApp.jsx
        const multiplier = trade.duration <= 5 ? 1.90 : (trade.duration <= 10 ? 1.40 : 0.90);
        const profit = (parseFloat(trade.stakeAmount) * multiplier).toFixed(6);
        const profitWei = ethers.parseUnits(profit, 18);
        console.log(`[Settlement] WIN for ${tradeId}. Updating SCW state on-chain...`);
        tx = await walletContract.settleWin(tradeId, stakeWei, profitWei);
        
        // Optimistic balance update for WIN
        const addr = trade.playerId.toLowerCase();
        const currentAvail = await redis.get(`balance:${addr}:available`) || "0";
        const totalPayout = parseFloat(trade.stakeAmount) + parseFloat(profit);
        const newAvail = (parseFloat(currentAvail) + totalPayout).toFixed(6);
        await redis.set(`balance:${addr}:available`, newAvail);
        await redis.set(`balance:${addr}:last_action_ts`, Date.now().toString());
      } else {
        // LOSS: Update on-chain SCW state (mark as pendingLoss)
        console.log(`[Settlement] LOSS for ${tradeId}. Updating SCW state on-chain...`);
        tx = await walletContract.settleLoss(tradeId, stakeWei);
        // Balance already deducted at start, so no Redis update needed here
        await redis.set(`balance:${trade.playerId.toLowerCase()}:last_action_ts`, Date.now().toString());
      }

      // Cleanup Redis immediately
      await redis.del(`trade:${tradeId}`);
      await redis.srem(`active_trades`, tradeId);

      const result = {
        tradeId,
        success: true,
        won,
        entryPrice: trade.entryPrice,
        exitPrice,
        payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toFixed(4) : '0',
        txHash: tx.hash
      };

      this.io.to(trade.playerId.toLowerCase()).emit('trade_settled', result);
      return result;
    } catch (err) {
      console.error("settleTrade failed:", err);
      return { success: false, error: err.message };
    }
  }

  async triggerBatchSweep() {
    try {
      const keys = await redis.keys('balance:*:pending_loss');
      const treasury = process.env.TREASURY_ADDRESS;
      
      for (const key of keys) {
        const val = await redis.get(key);
        if (val && BigInt(val) > 0n) {
          const player = key.split(':')[1];
          const walletAddress = await this.factoryContract.playerToWallet(player);
          const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
          
          console.log(`[SWEEP] Sweeping losses for ${player} to treasury...`);
          const tx = await walletContract.sweepLosses(treasury);
          await tx.wait();
          await redis.set(key, "0");
        }
      }
    } catch (err) {
      console.error("Batch sweep execution failed:", err);
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
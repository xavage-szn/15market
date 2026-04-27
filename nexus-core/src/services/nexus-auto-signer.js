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
  constructor(contract) {
    this.contract = contract;
    this.setupListeners();
  }

  setupListeners() {
    const iface = new ethers.Interface(WALLET_ABI);
    const provider = this.contract.runner.provider;
    let lastBlock = 0;

    const pollLogs = async () => {
      try {
        const currentBlock = await provider.getBlockNumber();
        if (lastBlock === 0) {
          lastBlock = currentBlock - 100; // Start from 100 blocks ago
        }
        if (currentBlock <= lastBlock) return;

        const topics = [
          [
            iface.getEvent("Deposit").topicHash,
            iface.getEvent("StakeLocked").topicHash,
            iface.getEvent("TradeSettledWin").topicHash,
            iface.getEvent("TradeSettledLoss").topicHash,
            iface.getEvent("Withdrawal").topicHash
          ]
        ];

        const logs = await provider.getLogs({
          fromBlock: lastBlock + 1,
          toBlock: currentBlock,
          topics
        });

        for (const log of logs) {
          const parsed = iface.parseLog(log);
          if (!parsed) continue;

          const { name, args } = parsed;
          if (name === "Deposit") {
            console.log(`[EVENT] Deposit: ${args[0]}, ${args[1]}`);
            await redis.set(`balance:${args[0].toLowerCase()}:available`, args[2].toString());
          } else if (name === "StakeLocked") {
            console.log(`[EVENT] StakeLocked: ${args[0]}, ${args[1]}`);
            await redis.set(`balance:${args[1].toLowerCase()}:available`, args[3].toString());
            await redis.incrby(`balance:${args[1].toLowerCase()}:locked`, args[2].toString());
          } else if (name === "TradeSettledWin") {
            console.log(`[EVENT] TradeSettledWin: ${args[0]}, ${args[1]}`);
            await redis.decrby(`balance:${args[1].toLowerCase()}:locked`, args[2].toString());
          } else if (name === "TradeSettledLoss") {
            console.log(`[EVENT] TradeSettledLoss: ${args[0]}, ${args[1]}`);
            await redis.decrby(`balance:${args[1].toLowerCase()}:locked`, args[2].toString());
            await redis.set(`balance:${args[1].toLowerCase()}:pending_loss`, args[3].toString());
          } else if (name === "Withdrawal") {
            console.log(`[EVENT] Withdrawal: ${args[0]}, ${args[1]}`);
            await redis.set(`balance:${args[0].toLowerCase()}:available`, args[2].toString());
          }
        }
        lastBlock = currentBlock;
      } catch (err) {
        if (err.message.includes("filter not found")) {
          // Ignore transient filter errors if they still happen somehow
        } else {
          console.error("Log polling failed:", err.message);
        }
      }
    };

    setInterval(pollLogs, 5000); // Poll every 5 seconds
  }

  async syncPlayer(player, walletContract) {
    const available = await walletContract.availableBalance();
    const locked = await walletContract.lockedBalance();
    const pending = await walletContract.pendingLoss();
    const addr = player.toLowerCase();
    await redis.set(`balance:${addr}:available`, available.toString());
    await redis.set(`balance:${addr}:locked`, locked.toString());
    await redis.set(`balance:${addr}:pending_loss`, pending.toString());
  }
}

class SettlementService {
  constructor(operatorWallet, io, factoryAddress) {
    this.operatorWallet = operatorWallet;
    this.io = io;
    this.isPolling = false;
    this.factoryAddress = factoryAddress;
    this.factoryContract = new ethers.Contract(factoryAddress, FACTORY_ABI, operatorWallet);
    this.tradeCounterKey = 'global:trade_counter';
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
      const walletAddress = await this.factoryContract.playerToWallet(playerId);
      if (walletAddress === ethers.ZeroAddress) {
         throw new Error("User has no smart contract wallet. Deposit first.");
      }
      
      const balanceKey = `balance:${playerId.toLowerCase()}:available`;
      const currentBalance = await redis.get(balanceKey) || "0";
      const stakeNum = parseFloat(stake);
      const balanceNum = parseFloat(currentBalance);

      if (balanceNum < stakeNum) {
        throw new Error("Insufficient session balance.");
      }

      // 1. DEDUCT IN STATE (High-Performance/Ultra-Low-Latency)
      const newBalance = (balanceNum - stakeNum).toFixed(18);
      await redis.set(balanceKey, newBalance);

      const tradeId = ethers.id(`${playerId}-${Date.now()}`);
      const trade = {
        tradeId,
        playerId,
        stakeAmount: stake,
        entryPrice: await this.getLatestPrice(symbol),
        closeTime: Date.now() + (duration * 1000),
        symbol,
        direction,
        status: 'open'
      };

      await redis.set(`trade:${tradeId}`, JSON.stringify(trade));
      await redis.sadd(`active_trades`, tradeId);
      
      // Notify frontend immediately of state update
      this.io.to(playerId.toLowerCase()).emit('balance_update', { available: newBalance });
      this.io.to(playerId.toLowerCase()).emit('trade_placed', trade);

      return { tradeId, success: true, mode: 'state-execution' };
    } catch (err) {
      console.error("submitTrade state-exec failed:", err);
      return { success: false, error: err.message };
    }
  }

  async settleTrade(tradeId) {
    const tradeData = await redis.get(`trade:${tradeId}`);
    if (!tradeData) return;
    
    const trade = JSON.parse(tradeData);
    const exitPrice = await this.getLatestPrice(trade.symbol);
    const isCall = trade.direction === 1 || trade.direction === 'UP' || trade.direction === 'buy';
    const won = isCall ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;

    const playerId = trade.playerId.toLowerCase();
    const balanceKey = `balance:${playerId}:available`;
    const pendingLossKey = `balance:${playerId}:pending_loss`;

    try {
      if (won) {
        // WIN: Update state by returning stake + profit
        const currentBalance = await redis.get(balanceKey) || "0";
        const profit = parseFloat(trade.stakeAmount) * 0.95;
        const newBalance = (parseFloat(currentBalance) + parseFloat(trade.stakeAmount) + profit).toFixed(18);
        await redis.set(balanceKey, newBalance);
        
        console.log(`[State-Settlement] WIN for ${tradeId}. Profit added to state.`);
        this.io.to(playerId).emit('balance_update', { available: newBalance });
      } else {
        // LOSS: Add to pending_loss state for later on-chain sweep
        const currentLoss = await redis.get(pendingLossKey) || "0";
        const newLoss = (parseFloat(currentLoss) + parseFloat(trade.stakeAmount)).toFixed(18);
        await redis.set(pendingLossKey, newLoss);
        
        console.log(`[State-Settlement] LOSS for ${tradeId}. Loss moved to pending state.`);
      }

      // Finalize Result
      this.io.to(playerId).emit('trade_settled', { 
        tradeId, 
        won, 
        exitPrice, 
        payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toFixed(6) : "0" 
      });

      // Cleanup
      await redis.del(`trade:${tradeId}`);
      await redis.srem(`active_trades`, tradeId);

      return {
        tradeId,
        success: true,
        won,
        entryPrice: trade.entryPrice,
        exitPrice,
        payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toFixed(4) : '0'
      };
    } catch (err) {
      console.error("settleTrade state-exec failed:", err);
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
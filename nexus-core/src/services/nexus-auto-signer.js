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
      
      const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
      const tradeId = ethers.id(`${playerId}-${Date.now()}`);
      const stakeWei = ethers.parseUnits(stake, 18); // Assuming 18 decimals for Arc native/USDC

      // 1. Lock Stake on-chain in the SCW
      const tx = await walletContract.lockStake(tradeId, stakeWei);
      await tx.wait();

      const trade = {
        tradeId,
        playerId,
        stakeAmount: stake,
        entryPrice: await this.getLatestPrice(symbol),
        closeTime: Date.now() + (duration * 1000),
        symbol,
        direction
      };

      await redis.set(`trade:${tradeId}`, JSON.stringify(trade));
      await redis.sadd(`active_trades`, tradeId);
      
      this.io.to(playerId.toLowerCase()).emit('trade_placed', trade);
      return { tradeId, success: true };
    } catch (err) {
      console.error("submitTrade failed:", err);
      return { success: false, error: err.message };
    }
  }

  async settleTrade(tradeId) {
    const tradeData = await redis.get(`trade:${tradeId}`);
    if (!tradeData) return;
    
    const trade = JSON.parse(tradeData);
    const exitPrice = await this.getLatestPrice(trade.symbol);
    const won = trade.direction === 1 ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;

    const walletAddress = await this.factoryContract.playerToWallet(trade.playerId);
    const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);

    try {
      let tx;
      const stakeWei = ethers.parseUnits(trade.stakeAmount, 18);

      if (won) {
        // WIN: Payout profit from treasury/pool to user SCW
        // In this SCW model, settleWin usually releases stake + adds profit
        const profit = (parseFloat(trade.stakeAmount) * 0.95).toFixed(6); // 95% profit
        const profitWei = ethers.parseUnits(profit, 18);
        
        console.log(`[Settlement] WIN for ${tradeId}. Paying out profit...`);
        tx = await walletContract.settleWin(tradeId, stakeWei, profitWei);
      } else {
        // LOSS: Finalize loss in SCW (moves to pendingLoss)
        console.log(`[Settlement] LOSS for ${tradeId}. Finalizing loss...`);
        tx = await walletContract.settleLoss(tradeId, stakeWei);
      }

      await tx.wait();
      
      // Cleanup
      await redis.del(`trade:${tradeId}`);
      await redis.srem(`active_trades`, tradeId);

      // Increment Global Trade Counter for Batch Sweep
      const currentCount = await redis.incr(this.tradeCounterKey);
      if (currentCount >= 5) {
        console.log("📦 [SettlementService] Batch limit reached (5 trades). Triggering global sweep...");
        await redis.set(this.tradeCounterKey, "0");
        this.triggerBatchSweep();
      }

      const result = {
        tradeId,
        success: true,
        outcome: won ? 'WIN' : 'LOSS',
        payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toFixed(4) : '0',
        txHash: tx.hash,
        won,
        entryPrice: trade.entryPrice,
        exitPrice,
        direction: trade.direction,
        amount: trade.stakeAmount,
        symbol: trade.symbol.toUpperCase(),
        timestamp: Date.now(),
        userAddr: trade.playerId
      };

      cache.pushHistory(trade.playerId, result);
      this.io.to(trade.playerId.toLowerCase()).emit('trade_settled', result);
      return result;
    } catch (err) {
      console.error(`Settlement failed for ${tradeId}:`, err);
      return { tradeId, success: false, error: err.message };
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
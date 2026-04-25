// ============================================================
// nexus-core/src/services/nexus-auto-signer.js
// JavaScript implementation of the Auto-Signer system services
// ============================================================

const { Redis } = require('ioredis');
const { ethers } = require('ethers');
const { Queue, Worker } = require('bullmq');

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
    maxRetriesPerRequest: null
});

const WALLET_ABI = [
    "function availableBalance() view returns (uint256)",
    "function lockedBalance() view returns (uint256)",
    "function pendingLoss() view returns (uint256)",
    "function lockStake(bytes32 tradeId, uint256 amount)",
    "function settleWin(bytes32 tradeId, uint256 stake, uint256 profit)",
    "function settleLoss(bytes32 tradeId, uint256 amount)",
    "function sweepLosses(address treasury)",
    "event Deposit(address indexed player, uint256 amount, uint256 newAvailableBalance)",
    "event StakeLocked(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 remainingAvailable)",
    "event TradeSettledWin(bytes32 indexed tradeId, address indexed player, uint256 stake, uint256 profit, uint256 totalPayout)",
    "event TradeSettledLoss(bytes32 indexed tradeId, address indexed player, uint256 amount, uint256 pendingLossTotal)",
    "event Withdrawal(address indexed player, uint256 amount, uint256 remainingBalance)"
];

const FACTORY_ABI = [
    "function playerToWallet(address player) view returns (address)",
    "function getWalletAddress(address player) view returns (address)",
    "event WalletDeployed(address indexed player, address wallet)"
];

/**
 * RedisMirrorService
 * Listens to on-chain events and updates Redis state
 */
class RedisMirrorService {
    constructor(factoryContract, operatorWallet) {
        this.factoryContract = factoryContract;
        this.operatorWallet = operatorWallet;
        this.setupListeners();
    }

    async setupListeners() {
        console.log("📡 [RedisMirror] Setting up listeners...");
        
        // Listen for new wallet deployments
        this.factoryContract.on("WalletDeployed", (player, wallet) => {
            console.log(`🆕 [WALLET] New wallet deployed for ${player}: ${wallet}`);
            this.trackWallet(player, wallet);
        });

        // Initialize tracking for existing wallets
        // In a production app, we would query the factory for all existing wallets
    }

    async trackWallet(player, walletAddress) {
        const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
        
        walletContract.on("Deposit", async (owner, amount, newAvailable) => {
            console.log(`💰 [DEPOSIT] ${owner}: ${ethers.formatUnits(amount, 6)} USDC`);
            await redis.set(`balance:${owner.toLowerCase()}:available`, newAvailable.toString());
        });

        walletContract.on("StakeLocked", async (tradeId, owner, amount, remaining) => {
            console.log(`🔒 [LOCKED] ${tradeId} for ${owner}`);
            await redis.set(`balance:${owner.toLowerCase()}:available`, remaining.toString());
            await redis.incrby(`balance:${owner.toLowerCase()}:locked`, amount.toString());
        });

        walletContract.on("TradeSettledWin", async (tradeId, owner, stake, profit, totalPayout) => {
            console.log(`🏆 [WIN] ${tradeId} for ${owner}`);
            const available = await walletContract.availableBalance();
            const locked = await walletContract.lockedBalance();
            await redis.set(`balance:${owner.toLowerCase()}:available`, available.toString());
            await redis.set(`balance:${owner.toLowerCase()}:locked`, locked.toString());
        });

        walletContract.on("TradeSettledLoss", async (tradeId, owner, amount, pendingLossTotal) => {
            console.log(`💀 [LOSS] ${tradeId} for ${owner}`);
            const locked = await walletContract.lockedBalance();
            await redis.set(`balance:${owner.toLowerCase()}:locked`, locked.toString());
            await redis.set(`balance:${owner.toLowerCase()}:pending_loss`, pendingLossTotal.toString());
        });

        walletContract.on("Withdrawal", async (owner, amount, remaining) => {
            console.log(`💸 [WITHDRAW] ${owner}: ${ethers.formatUnits(amount, 6)} USDC`);
            await redis.set(`balance:${owner.toLowerCase()}:available`, remaining.toString());
        });
    }
}

/**
 * SettlementService
 * Handles trade submission and on-chain settlement
 */
class SettlementService {
    constructor(operatorWallet, factoryContract, io) {
        this.operatorWallet = operatorWallet;
        this.factoryContract = factoryContract;
        this.io = io;
    }

    async submitTrade(playerId, symbol, direction, stake, duration) {
        const walletAddress = await this.factoryContract.playerToWallet(playerId);
        if (!walletAddress || walletAddress === ethers.ZeroAddress) {
            return { success: false, error: "No Auto-Signer wallet found. Please deposit first." };
        }

        const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
        const tradeId = ethers.id(`${playerId}-${Date.now()}`);

        try {
            console.log(`🚀 [TRADE] Submitting ${tradeId} on-chain...`);
            const tx = await walletContract.lockStake(tradeId, ethers.parseUnits(stake.toString(), 6));
            await tx.wait();

            const trade = {
                tradeId,
                playerId,
                stakeAmount: stake,
                entryPrice: await this.getLatestPrice(symbol),
                closeTime: Date.now() + (duration * 1000),
                symbol,
                direction,
                status: 'PENDING'
            };

            await redis.set(`trade:${tradeId}`, JSON.stringify(trade));
            await redis.sadd(`active_trades`, tradeId);

            this.io.to(playerId.toLowerCase()).emit('trade_placed', trade);
            return { success: true, tradeId, txHash: tx.hash };
        } catch (err) {
            console.error("❌ [TRADE] LockStake failed:", err.message);
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
            console.log(`⚖️ [SETTLE] Settling ${tradeId} (${won ? 'WIN' : 'LOSS'})...`);
            let tx;
            if (won) {
                const profit = (parseFloat(trade.stakeAmount) * 0.95).toFixed(6);
                tx = await walletContract.settleWin(tradeId, ethers.parseUnits(trade.stakeAmount.toString(), 6), ethers.parseUnits(profit, 6));
            } else {
                tx = await walletContract.settleLoss(tradeId, ethers.parseUnits(trade.stakeAmount.toString(), 6));
            }
            await tx.wait();

            await redis.del(`trade:${tradeId}`);
            await redis.srem(`active_trades`, tradeId);

            const result = {
                tradeId,
                success: true,
                outcome: won ? 'WIN' : 'LOSS',
                payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toString() : '0',
                txHash: tx.hash
            };

            this.io.to(trade.playerId.toLowerCase()).emit('trade_settled', result);
            return result;
        } catch (err) {
            console.error("❌ [SETTLE] Settlement failed:", err.message);
        }
    }

    async getLatestPrice(symbol) {
        const price = await redis.get(`price:${symbol.toLowerCase()}`);
        return parseFloat(price || '0');
    }

    async startSettlementPoller() {
        console.log("⏱️ [Settlement] Starting settlement poller...");
        setInterval(async () => {
            const now = Date.now();
            const activeTradeIds = await redis.smembers(`active_trades`);
            for (const tradeId of activeTradeIds) {
                const tradeData = await redis.get(`trade:${tradeId}`);
                if (tradeData) {
                    const trade = JSON.parse(tradeData);
                    if (now >= trade.closeTime) {
                        await this.settleTrade(tradeId);
                    }
                }
            }
        }, 1000);
    }
}

/**
 * BatchSweepJob
 * Periodic job to sweep losses to treasury
 */
function setupBatchSweepJob(operatorWallet, factoryContract) {
    const sweepQueue = new Queue('sweep-losses', { connection: redis });
    
    new Worker('sweep-losses', async (job) => {
        console.log("Sweep loss job started");
        const keys = await redis.keys('balance:*:pending_loss');
        const treasury = process.env.TREASURY_ADDRESS;

        for (const key of keys) {
            const val = await redis.get(key);
            if (val && BigInt(val) > 0n) {
                const player = key.split(':')[1];
                const walletAddress = await factoryContract.playerToWallet(player);
                const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, operatorWallet);
                try {
                    const tx = await walletContract.sweepLosses(treasury);
                    await tx.wait();
                    await redis.set(key, "0");
                    console.log(`✅ [SWEEP] Swept ${player}`);
                } catch (err) {
                    console.error(`❌ [SWEEP] Failed for ${player}:`, err.message);
                }
            }
        }
    }, { connection: redis });

    sweepQueue.add('sweep', {}, {
        repeat: { pattern: '*/2 * * * *' }
    });
}

module.exports = { RedisMirrorService, SettlementService, setupBatchSweepJob, WALLET_ABI, FACTORY_ABI };

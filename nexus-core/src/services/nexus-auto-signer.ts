// ============================================================
// nexus-core/src/types/nexus.ts
// Full type definitions for the Auto-Signer system
// ============================================================

export interface AutoSignerAccount {
    address: string;
    owner: string;
    availableBalance: string;
    lockedBalance: string;
    pendingLoss: string;
}

export interface ActiveTrade {
    tradeId: string;
    playerId: string;
    stakeAmount: string;
    entryPrice: number;
    closeTime: number;
    symbol: string;
    direction: number;
}

export interface SettlementResult {
    tradeId: string;
    success: boolean;
    outcome: 'WIN' | 'LOSS';
    payout?: string;
    txHash?: string;
}

export interface BatchSweepPayload {
    playerWallets: string[];
}

// Instruction Parameters
export interface LockStakeParams {
    tradeId: string;
    amount: string;
}

export interface SettleWinParams {
    tradeId: string;
    stake: string;
    profit: string;
}

export interface SettleLossParams {
    tradeId: string;
    amount: string;
}

// Events
export interface DepositEvent {
    player: string;
    amount: string;
    newAvailableBalance: string;
}

export interface StakeLockedEvent {
    tradeId: string;
    player: string;
    amount: string;
    remainingAvailable: string;
}

export interface TradeSettledWinEvent {
    tradeId: string;
    player: string;
    stake: string;
    profit: string;
    totalPayout: string;
}

export interface TradeSettledLossEvent {
    tradeId: string;
    player: string;
    amount: string;
    pendingLossTotal: string;
}

export interface BatchSweptEvent {
    amount: string;
    treasury: string;
}

export interface WithdrawalEvent {
    player: string;
    amount: string;
    remainingBalance: string;
}

// ============================================================
// nexus-core/src/services/redis-mirror.ts
// WebSocket listener and Redis state synchronization
// ============================================================

import { Redis } from 'ioredis';
import { ethers } from 'ethers';
import { 
    DepositEvent, StakeLockedEvent, TradeSettledWinEvent, 
    TradeSettledLossEvent, BatchSweptEvent, WithdrawalEvent 
} from '../types/nexus';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export class RedisMirrorService {
    constructor(private contract: ethers.Contract) {
        this.setupListeners();
    }

    private setupListeners() {
        this.contract.on("Deposit", async (player: string, amount: bigint, newAvailable: bigint) => {
            console.log(`[EVENT] Deposit: ${player}, ${amount}`);
            await redis.set(`balance:${player.toLowerCase()}:available`, newAvailable.toString());
        });

        this.contract.on("StakeLocked", async (tradeId: string, player: string, amount: bigint, remaining: bigint) => {
            console.log(`[EVENT] StakeLocked: ${tradeId}, ${player}`);
            await redis.set(`balance:${player.toLowerCase()}:available`, remaining.toString());
            await redis.incrby(`balance:${player.toLowerCase()}:locked`, amount.toString());
        });

        this.contract.on("TradeSettledWin", async (tradeId: string, player: string, stake: bigint, profit: bigint, totalPayout: bigint) => {
            console.log(`[EVENT] TradeSettledWin: ${tradeId}, ${player}`);
            // Available balance is updated on-chain (stake returned + profit added)
            // We need to fetch the new available balance or compute it if we trust the event
            // For robustness, we could increment available and decrement locked
            await redis.decrby(`balance:${player.toLowerCase()}:locked`, stake.toString());
            // The availableBalance in the contract is updated, so we should sync it
            const newAvailable = await this.contract.availableBalance(); // Assuming individual wallet
            // Wait, if it's a factory, we need to listen to the specific wallet contract.
            // Or use a filtered listener.
        });

        this.contract.on("TradeSettledLoss", async (tradeId: string, player: string, amount: bigint, pendingLossTotal: bigint) => {
            console.log(`[EVENT] TradeSettledLoss: ${tradeId}, ${player}`);
            await redis.decrby(`balance:${player.toLowerCase()}:locked`, amount.toString());
            await redis.set(`balance:${player.toLowerCase()}:pending_loss`, pendingLossTotal.toString());
        });

        this.contract.on("BatchSwept", async (amount: bigint, treasury: string) => {
            // Note: BatchSwept on the wallet level only knows its own amount.
            // Global listener would be better.
        });

        this.contract.on("Withdrawal", async (player: string, amount: bigint, remaining: bigint) => {
            await redis.set(`balance:${player.toLowerCase()}:available`, remaining.toString());
        });
    }

    // Helper to sync full state for a player
    async syncPlayer(player: string, walletContract: ethers.Contract) {
        const available = await walletContract.availableBalance();
        const locked = await walletContract.lockedBalance();
        const pending = await walletContract.pendingLoss();
        
        const addr = player.toLowerCase();
        await redis.set(`balance:${addr}:available`, available.toString());
        await redis.set(`balance:${addr}:locked`, locked.toString());
        await redis.set(`balance:${addr}:pending_loss`, pending.toString());
    }
}

// ============================================================
// nexus-core/src/services/settlement.ts
// Trade submission and settlement logic
// ============================================================

import { ActiveTrade, SettlementResult } from '../types/nexus';

export class SettlementService {
    constructor(
        private operatorWallet: ethers.Wallet,
        private factoryContract: ethers.Contract,
        private io: any // Socket.io instance
    ) {}

    async submitTrade(playerId: string, symbol: string, direction: number, stake: string, duration: number): Promise<SettlementResult> {
        const walletAddress = await this.factoryContract.playerToWallet(playerId);
        if (!walletAddress || walletAddress === ethers.ZeroAddress) {
            return { tradeId: '', success: false, outcome: 'LOSS' }; // Should handle deployment first
        }

        const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);
        const tradeId = ethers.id(`${playerId}-${Date.now()}`);

        try {
            // 1. Lock Stake on-chain
            const tx = await walletContract.lockStake(tradeId, ethers.parseUnits(stake, 6));
            await tx.wait();

            // 2. Store in Redis
            const trade: ActiveTrade = {
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

            // 3. Notify Player
            this.io.to(playerId.toLowerCase()).emit('trade_placed', trade);

            return { tradeId, success: true, outcome: 'PENDING' } as any;
        } catch (err) {
            console.error("LockStake failed:", err);
            return { tradeId, success: false, outcome: 'LOSS' };
        }
    }

    async settleTrade(tradeId: string): Promise<SettlementResult> {
        const tradeData = await redis.get(`trade:${tradeId}`);
        if (!tradeData) return { tradeId, success: false, outcome: 'LOSS' };
        
        const trade: ActiveTrade = JSON.parse(tradeData);
        const exitPrice = await this.getLatestPrice(trade.symbol);
        const won = trade.direction === 1 ? exitPrice > trade.entryPrice : exitPrice < trade.entryPrice;

        const walletAddress = await this.factoryContract.playerToWallet(trade.playerId);
        const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, this.operatorWallet);

        try {
            let tx;
            if (won) {
                const profit = (parseFloat(trade.stakeAmount) * 0.95).toFixed(6); // 95% payout
                // In a real scenario, Treasury must approve or the operator has profit funds
                tx = await walletContract.settleWin(tradeId, ethers.parseUnits(trade.stakeAmount, 6), ethers.parseUnits(profit, 6));
            } else {
                tx = await walletContract.settleLoss(tradeId, ethers.parseUnits(trade.stakeAmount, 6));
            }
            await tx.wait();

            // Cleanup Redis
            await redis.del(`trade:${tradeId}`);
            await redis.srem(`active_trades`, tradeId);

            const result: SettlementResult = {
                tradeId,
                success: true,
                outcome: won ? 'WIN' : 'LOSS',
                payout: won ? (parseFloat(trade.stakeAmount) * 1.95).toString() : '0',
                txHash: tx.hash
            };

            this.io.to(trade.playerId.toLowerCase()).emit('trade_settled', result);
            return result;
        } catch (err) {
            console.error("Settlement failed:", err);
            return { tradeId, success: false, outcome: 'LOSS' };
        }
    }

    private async getLatestPrice(symbol: string): Promise<number> {
        const price = await redis.get(`price:${symbol.toLowerCase()}`);
        return parseFloat(price || '0');
    }
}

// ============================================================
// nexus-core/src/jobs/batch-sweep.ts
// BullMQ job for periodic loss collection
// ============================================================

import { Queue, Worker } from 'bullmq';

const sweepQueue = new Queue('sweep-losses', { connection: redis });

export const setupBatchSweepJob = (operatorWallet: ethers.Wallet, factoryContract: ethers.Contract) => {
    const worker = new Worker('sweep-losses', async (job) => {
        console.log("[JOB] Starting Batch Loss Sweep...");
        
        // In this architecture, each wallet is swept individually.
        // A more advanced version would use a multicall or a global sweep if funds were pooled.
        // But per requirements, we call sweepLosses on each player wallet.
        
        // 1. Get all players with pending losses
        const keys = await redis.keys('balance:*:pending_loss');
        const playersToSweep = [];
        for (const key of keys) {
            const val = await redis.get(key);
            if (val && BigInt(val) > 0n) {
                playersToSweep.push(key.split(':')[1]);
            }
        }

        if (playersToSweep.length === 0) return;

        // 2. Execute Batch Sweep (Parallel or sequential depending on gas/concurrency)
        const treasury = process.env.TREASURY_ADDRESS;
        for (const player of playersToSweep) {
            const walletAddress = await factoryContract.playerToWallet(player);
            const walletContract = new ethers.Contract(walletAddress, WALLET_ABI, operatorWallet);
            try {
                const tx = await walletContract.sweepLosses(treasury);
                await tx.wait();
                await redis.set(`balance:${player}:pending_loss`, "0");
                console.log(`[SWEEP] Success for ${player}`);
            } catch (err) {
                console.error(`[SWEEP] Failed for ${player}:`, err);
            }
        }
    }, { connection: redis });

    // Schedule every 2 minutes
    sweepQueue.add('sweep', {}, {
        repeat: {
            pattern: '*/2 * * * *'
        }
    });
}

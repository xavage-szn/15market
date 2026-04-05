const { ethers } = require('ethers');
const redis = require('../services/redis');
const pricing = require('../services/pricing');
// Vault decommissioned.
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });

/**
 * ROUNDS PROCESSOR
 * 
 * Manages the 30s prediction cycle:
 * 1. T=0:  Lock current price for the "Live" round. Initialize the next "Entry" round.
 * 2. T=15: Capture "Settle" price for the "Live" round. Trigger on-chain settlement.
 * 3. T=30: (Back to 1).
 */

class RoundsProcessor {
    constructor() {
        this.provider = new ethers.JsonRpcProvider(process.env.ARC_RPC || 'https://rpc.testnet.arc.network');
        const pk = process.env.PRIVATE_KEY;
        this.wallet = new ethers.Wallet(pk, this.provider);


        // Contract setup (Address to be filled after deployment)
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS || "";
        this.abi = [
            "function lockRound(uint256 _roundId, uint256 _price) external",
            "function settleRound(uint256 _roundId, uint256 _price) external",
            "event RoundLocked(uint256 indexed roundId, uint256 lockPrice, uint256 timestamp)",
            "event RoundSettled(uint256 indexed roundId, uint256 settlePrice, uint256 timestamp, uint8 result)"
        ];

        this.assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        this.timer = null;
        this.lastProcessedMinute = -1;
        this.lastStep = -1; // 0 for T=0, 1 for T=15
    }

    async start() {
        console.log('[Rounds] Starting Rounds Processor...');
        this.timer = setInterval(() => this.tick(), 1000);
    }

    async tick() {
        const now = Date.now();
        const seconds = Math.floor(now / 1000) % 30;

        if (seconds === 0 && this.lastStep !== 0) {
            this.lastStep = 0;
            await this.handleLock();
        } else if (seconds === 15 && this.lastStep !== 15) {
            this.lastStep = 15;
            await this.handleSettle();
        } else if (seconds === 20 && this.lastStep !== 20) {
            this.lastStep = 20;
            await this.handleBotEntries();
        }
    }

    async handleLock() {
        const roundId = Math.floor(Date.now() / 30000);
        console.log(`[Rounds] Lock Round ${roundId}`);

        for (const asset of this.assets) {
            try {
                const baseAsset = asset.replace('USDT', '');
                const price = await pricing.getPrice(baseAsset);
                
                if (!price || isNaN(price)) {
                    console.error(`[Rounds] Price missing for ${asset}`);
                    continue;
                }

                // Update Redis state for frontend
                const state = await redis.getRound(`${asset}_state`) || { live: null, next: this.getInitialPools() };

                // Promote next to live
                state.live = {
                    id: roundId,
                    lockPrice: parseFloat(price),
                    pools: state.next.pools,
                    startTime: Date.now()
                };

                // Reset next
                state.next = {
                    id: roundId + 1,
                    ...this.getInitialPools()
                };

                await redis.setRound(`${asset}_state`, state);

                // On-chain Lock
                if (this.contractAddress) {
                    const contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
                    const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                    const tx = await contract.lockRound(roundId, priceFixed);
                    console.log(`[Rounds] Lock TX for ${asset} (${price}): ${tx.hash}`);
                }
            } catch (e) {
                console.error(`[Rounds] Lock error for ${asset}:`, e.message);
            }
        }
    }

    async handleSettle() {
        const roundId = Math.floor(Date.now() / 30000);
        console.log(`[Rounds] Settle Round ${roundId}`);

        for (const asset of this.assets) {
            try {
                const baseAsset = asset.replace('USDT', '');
                const price = await pricing.getPrice(baseAsset);
                const state = await redis.getRound(`${asset}_state`);

                if (state && state.live && state.live.id === roundId) {
                    const isAbove = parseFloat(price) >= state.live.lockPrice;
                    state.live.result = isAbove ? 'WON' : 'LOST';
                    state.live.settlePrice = parseFloat(price);

                    await redis.setRound(`${asset}_state`, state);

                    // On-chain Settle
                    if (this.contractAddress) {
                        const contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
                        const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                        const tx = await contract.settleRound(roundId, priceFixed);
                        console.log(`[Rounds] Settle TX for ${asset} (${price}): ${tx.hash}`);
                    }
                }
            } catch (e) {
                console.error(`[Rounds] Settle error for ${asset}:`, e.message);
            }
        }
    }

    async handleBotEntries() {
        // T=20: Trigger bot pulse for NEXT round (locked at T=30)
        const nextRoundId = Math.floor(Date.now() / 30000) + 1;
        console.log(`[Rounds] Bot pulse for Round ${nextRoundId}`);
        for (const asset of this.assets) {
            try {
                const state = await redis.getRound(`${asset}_state`);
                const participants = state?.next?.pools?.participants || 0;
                botService.act(asset, nextRoundId, participants).catch(e => {
                    console.error(`[Rounds] Bot pulse failed for ${asset}:`, e.message);
                });
            } catch (e) {
                console.error(`[Rounds] Bot trigger failed for ${asset}:`, e.message);
            }
        }
    }

    getInitialPools() {
        return {
            pools: {
                long: 100 + Math.random() * 200,
                short: 100 + Math.random() * 200,
                participants: 5 + Math.floor(Math.random() * 5)
            }
        };
    }
}

module.exports = new RoundsProcessor();

const { ethers } = require('ethers');
const blockchain = require('./blockchain');
const redis = require('../services/redis');
const pricing = require('../services/pricing');

class RoundsProcessor {
    constructor() {
        this.assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        this.timer = null;
        this.lastStep = -1;
        this.lastSettledId = {};
    }

    async start() {
        console.log('[Rounds] Starting Rounds Processor...');
        // Wait for services to be ready
        await blockchain.ensureReady();
        
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

                // Update Redis state using centralized RedisStore
                const state = await redis.getRound(`${asset}_state`) || { live: null, next: this.getInitialPools() };

                state.live = {
                    id: roundId,
                    lockPrice: parseFloat(price),
                    pools: state.next.pools,
                    startTime: Date.now()
                };

                state.next = {
                    id: roundId + 1,
                    ...this.getInitialPools()
                };

                await redis.setRound(`${asset}_state`, state);

                // On-chain Lock
                const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                blockchain.lockRound(roundId, priceFixed).then(tx => {
                    console.log(`[Rounds] Round ${roundId} Locked for ${asset}: ${tx.hash}`);
                }).catch(e => {
                    console.error(`[Rounds] Lock failed for ${asset}:`, e.message);
                });
                
            } catch (e) {
                console.error(`[Rounds] Lock process failed for ${asset}:`, e.message);
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
                
                if (!price || isNaN(price)) {
                    console.error(`[Rounds] Price missing for ${asset}`);
                    continue;
                }

                const state = await redis.getRound(`${asset}_state`);
                if (state && state.live && state.live.id === roundId && !state.live.settlePrice) {
                    const lPrice = state.live.lockPrice;
                    const sPrice = parseFloat(price);
                    state.live.settlePrice = sPrice;
                    
                    // Removed HOUSE win rule. 
                    // sPrice > lPrice is WON (Long), everything else is LOST (Short).
                    state.live.result = sPrice > lPrice ? 'WON' : 'LOST';
                    
                    await redis.setRound(`${asset}_state`, state);
                    this.lastSettledId[asset] = roundId;
                }

                // On-chain Settle
                const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                blockchain.settleRound(roundId, priceFixed).then(tx => {
                    console.log(`[Rounds] Round ${roundId} Settled for ${asset}: ${tx.hash}`);
                }).catch(e => {
                    console.error(`[Rounds] Settle failed for ${asset}:`, e.message);
                });

            } catch (e) {
                console.error(`[Rounds] Settle process failed for ${asset}:`, e.message);
            }
        }
    }

    getInitialPools() {
        return { pools: { long: 1.0, short: 1.0, participants: 0 } };
    }
}

module.exports = new RoundsProcessor();

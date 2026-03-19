const { ethers } = require('ethers');
const blockchain = require('./blockchain');
const redis = require('./redis');
const pricing = require('./pricing');

class RoundsProcessor {
    constructor() {
        this.assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        this.timer = null;
        this.lastStep = -1;
    }

    async start() {
        console.log('[Rounds] 🟢 Starting Rounds Processor...');
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
        console.log(`[Rounds] 🔒 Locking Round ${roundId} at T=0`);

        for (const asset of this.assets) {
            try {
                const baseAsset = asset.replace('USDT', '');
                const price = await pricing.getPrice(baseAsset);
                
                if (!price || isNaN(price)) {
                    console.error(`[Rounds] ⚠️ Could not fetch price for ${asset}`);
                    continue;
                }

                // Update Redis state
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
                if (blockchain.contract) {
                    const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                    const tx = await blockchain.contract.lockRound(roundId, priceFixed);
                    console.log(`[Rounds] ✅ Round ${roundId} Locked for ${asset}: ${tx.hash}`);
                }
            } catch (e) {
                console.error(`[Rounds] ❌ Lock Round Failed for ${asset}:`, e.message);
            }
        }
    }

    async handleSettle() {
        const roundId = Math.floor(Date.now() / 30000);
        console.log(`[Rounds] 🏁 Settling Round ${roundId} at T=15`);

        for (const asset of this.assets) {
            try {
                const baseAsset = asset.replace('USDT', '');
                const price = await pricing.getPrice(baseAsset);
                
                if (!price || isNaN(price)) {
                    console.error(`[Rounds] ⚠️ Could not fetch price for ${asset}`);
                    continue;
                }

                const state = await redis.getRound(`${asset}_state`);
                if (state && state.live && state.live.id === roundId) {
                    const lPrice = state.live.lockPrice;
                    const sPrice = parseFloat(price);
                    state.live.settlePrice = sPrice;
                    
                    // Logic: If price didn't move, House (Treasury) wins.
                    // We check if it truly stayed static or if it's within 0.0001% tolerance
                    const diff = Math.abs(sPrice - lPrice);
                    if (diff < 0.00000001) {
                        state.live.result = 'HOUSE';
                        console.log(`[Rounds] 🏠 HOUSE WINS for ${asset}: Settle=${sPrice}, Lock=${lPrice}`);
                    } else {
                        state.live.result = sPrice > lPrice ? 'WON' : 'LOST';
                        console.log(`[Rounds] 🏆 Round ${roundId} Result for ${asset}: ${state.live.result} (Settle=${sPrice}, Lock=${lPrice})`);
                    }
                    
                    await redis.setRound(`${asset}_state`, state);
                    this.lastSettledId[asset] = roundId;
                }

                if (blockchain.contract) {
                    const priceFixed = ethers.parseUnits(price.toFixed(8), 8);
                    const tx = await blockchain.contract.settleRound(roundId, priceFixed);
                    console.log(`[Rounds] ✅ Round ${roundId} Settled for ${asset}: ${tx.hash}`);
                }
            } catch (e) {
                console.error(`[Rounds] ❌ Settle Round Failed for ${asset}:`, e.message);
            }
        }
    }

    getInitialPools() {
        return { pools: { long: 1.0, short: 1.0, participants: 0 } };
    }
}

module.exports = new RoundsProcessor();

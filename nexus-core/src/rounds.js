// ============================================================
// nexus-core/src/rounds.js
// Rounds Execution & Settlement Engine
// ============================================================
const cache = require('./cache');
const config = require('./config');

class RoundsEngine {
  constructor(io) {
    this.io = io;
    this.assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
    this.lastStep = -1;
  }

  start() {
    console.log('[Rounds] Starting Unified Rounds Engine...');
    setInterval(() => this.tick(), 1000);
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
    // Note: Bot handling removed for simplicity, can be re-added as needed.
  }

  getInitialPools() {
    return { pools: { long: 1.0, short: 1.0, participants: 0 } };
  }

  async handleLock() {
    const roundId = Math.floor(Date.now() / 30000);
    console.log(`[Rounds] Lock Round ${roundId}`);

    for (const asset of this.assets) {
      try {
        const baseAsset = asset.replace('USDT', '').toLowerCase();
        const price = cache.prices[baseAsset];
        if (!price) continue;

        const state = cache.getRoundState(asset);
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

        cache.setRoundState(asset, state);
        this.io.emit('round_update', { asset, state });
        
        // Broadcast on-chain lock logic would go here if needed
      } catch (e) {
        console.error(`[Rounds] Lock Failed for ${asset}:`, e.message);
      }
    }
  }

  async handleSettle() {
    const roundId = Math.floor(Date.now() / 30000);
    console.log(`[Rounds] Settle Round ${roundId}`);

    for (const asset of this.assets) {
      try {
        const state = cache.getRoundState(asset);
        if (state && state.live && state.live.id === roundId) {
          if (state.live.resultLocked) continue;

          const baseAsset = asset.replace('USDT', '').toLowerCase();
          const price = cache.prices[baseAsset];
          if (!price) continue;

          const sPrice = parseFloat(price);
          const lPrice = state.live.lockPrice;
          state.live.settlePrice = sPrice;

          const diff = Math.abs(sPrice - lPrice);
          if (diff < 0.00000001) {
            state.live.result = 'HOUSE';
          } else {
            state.live.result = sPrice > lPrice ? 'WON' : 'LOST';
          }
          
          state.live.resultLocked = true;
          cache.setRoundState(asset, state);
          this.io.emit('round_update', { asset, state });
          
          // Broadcast on-chain settlement logic would go here if needed
        }
      } catch (e) {
        console.error(`[Rounds] Settle Failed for ${asset}:`, e.message);
      }
    }
  }
}

module.exports = RoundsEngine;

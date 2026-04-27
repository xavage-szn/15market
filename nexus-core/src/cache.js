// ============================================================
// nexus-core/src/cache.js
// In-process cache layer for the unified backend.
// ============================================================

class Cache {
  constructor() {
    this.sessions = new Map(); // address/identityKey -> session object
    this.trades = new Map(); // tradeId -> trade object
    this.userHistory = new Map(); // address -> array of history records
    
    // In-memory queues
    this.settlementQueue = [];
    this.payoutQueue = [];
    
    // Market data
    this.prices = { btc: 65000, eth: 3200, sol: 145 };
    this.priceMeta = {
      btc: { updatedAt: 0 },
      eth: { updatedAt: 0 },
      sol: { updatedAt: 0 },
    };
    this.priceMeta = {
      btc: { updatedAt: 0 },
      eth: { updatedAt: 0 },
      sol: { updatedAt: 0 },
    };
    
    // Rounds state
    this.roundsState = new Map();

    // Price History (Stable settlement buffer)
    this.priceHistory = {}; // key -> array of {price, time}
  }

  getHistoricalPrice(key, targetTime) {
    const history = this.priceHistory[key];
    if (!history || history.length === 0) return this.prices[key] || 0;

    let closest = history[0];
    let minDiff = Math.abs(targetTime - closest.time);

    for (const entry of history) {
      const diff = Math.abs(targetTime - entry.time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    if (minDiff > 10000) return this.prices[key] || 0;
    return closest.price;
  }

  // --- Classic Trade Helpers ---
  
  getOrCreateSession(identityKey, defaultData) {
    if (!this.sessions.has(identityKey)) {
      this.sessions.set(identityKey, defaultData);
    }
    return this.sessions.get(identityKey);
  }

  pushHistory(address, record) {
    const list = this.userHistory.get(address) || [];
    list.unshift(record);
    this.userHistory.set(address, list.slice(0, 100));
  }

  queueTradeForSettlement(trade) {
    this.settlementQueue.push(trade);
    this.settlementQueue.sort((a, b) => a.settleAt - b.settleAt);
  }

  // --- Rounds Helpers ---
  
  getRoundState(asset) {
    if (!this.roundsState.has(asset)) {
      this.roundsState.set(asset, { live: null, next: { pools: { long: 1.0, short: 1.0, participants: 0 } } });
    }
    return this.roundsState.get(asset);
  }

  setRoundState(asset, state) {
    this.roundsState.set(asset, state);
  }
}

module.exports = new Cache();

// ============================================================
// nexus-core/src/cache.js
// In-process cache layer for the unified backend.
// ============================================================

class Cache {
  constructor() {
    this.sessions = new Map(); // address/identityKey -> session object
    this.trades = new Map(); // tradeId -> trade object
    this.userHistory = new Map(); // address -> array of history records
    
    // In-memory queues (unused)
    this.settlementQueue = [];
    
    // Market data
    // Market data
    this.prices = { btc: 0, eth: 0, sol: 0 };
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

  /**
   * Snapshot the current price into the high-resolution history buffer.
   * Called every 250ms so we get ~4 captures per second around expiry.
   */
  snapshotPrice(key) {
    const price = this.prices[key];
    if (!price || price <= 0) return;
    if (!this.priceHistory[key]) this.priceHistory[key] = [];
    const now = Date.now();
    this.priceHistory[key].push({ price, time: now });
    // Keep 20 minutes of 250ms snapshots ≈ 4800 entries per asset
    if (this.priceHistory[key].length > 4800) this.priceHistory[key].shift();
  }

  /**
   * Return the most recently captured price from the history buffer.
   * Used as a zero-latency fallback when no historical match is found.
   */
  getLatestPrice(key) {
    const history = this.priceHistory[key];
    if (!history || history.length === 0) return this.prices[key] || 0;
    return history[history.length - 1].price;
  }

  /**
   * Find the historical price closest to `targetTime`.
   * Stale threshold tightened to 3 s — any miss beyond that falls back
   * to the most recently snapshotted price (not just cache.prices which
   * could be a stale 1-second-old REST poll result).
   */
  getHistoricalPrice(key, targetTime) {
    const history = this.priceHistory[key];
    if (!history || history.length === 0) return this.prices[key] || 0;

    let closest = history[0];
    let minDiff = Math.abs(targetTime - closest.time);

    // Find the price capture closest to our target expiration timestamp
    for (const entry of history) {
      const diff = Math.abs(targetTime - entry.time);
      if (diff < minDiff) {
        minDiff = diff;
        closest = entry;
      }
    }

    // CRITICAL: If we are looking for a past expiration price and the engine is lagging, 
    // we must NOT use the 'latest' price (which could be a retracement).
    // If the gap is > 1s, we prefer the closest price BEFORE the target if available.
    if (minDiff > 1000 && targetTime < Date.now()) {
      const before = history.filter(h => h.time <= targetTime).pop();
      if (before) {
        console.warn(`[Cache] Large gap (${minDiff}ms) for ${key} at ${targetTime}. Locking to last known price before expiry.`);
        return before.price;
      }
    }

    return closest.price;
  }

  // --- Classic Trade Helpers ---
  
  getOrCreateSession(identityKey, defaultData) {
    if (!this.sessions.has(identityKey)) {
      this.sessions.set(identityKey, defaultData);
    }
    return this.sessions.get(identityKey);
  }

  pushHistory(userAddr, trade) {
    const profiles = require('./profiles');
    return profiles.pushTrade(userAddr, trade);
  }

  getHistory(userAddr) {
    const profiles = require('./profiles');
    return profiles.getHistory(userAddr);
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

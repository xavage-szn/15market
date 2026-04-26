// ============================================================
// nexus-core/src/price-backend.js
// Standalone Backend Price Feed Service
// Updates Redis for authoritative settlement.
// ============================================================

const WebSocket = require('ws');
const Redis = require('ioredis');
require('dotenv').config();

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Track local state for logging
const prices = {
  btc: 0,
  eth: 0,
  sol: 0
};

const PYTH_IDS = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
};

async function fetchPythPrices() {
  try {
    const ids = Object.values(PYTH_IDS).map(id => `ids[]=${id.replace('0x', '')}`).join('&');
    const res = await fetch(`https://hermes.pyth.network/v2/updates/price/latest?${ids}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    for (const p of data.parsed) {
      const id = p.id.startsWith('0x') ? p.id : `0x${p.id}`;
      const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
      const publishTime = p.price.publish_time * 1000; // Convert to ms

      let key = '';
      if (id === PYTH_IDS.btc) { key = 'btc'; prices.btc = price; }
      if (id === PYTH_IDS.eth) { key = 'eth'; prices.eth = price; }
      if (id === PYTH_IDS.sol) { key = 'sol'; prices.sol = price; }

      if (key) {
        // Update Redis for settlement engine
        // Using Pyth's actual publish_time ensures consistency across different feed services
        await redis.set(`price:${key}`, price.toString());
        await redis.set(`price:${key}:ts`, String(publishTime));
      }
    }
  } catch (err) {
    console.error('[Price-Backend] Pyth error:', err.message);
  }
}

// Log prices every 10 seconds
setInterval(() => {
  console.log(`[Price-Backend] BTC: ${prices.btc} | ETH: ${prices.eth} | SOL: ${prices.sol}`);
}, 10000);

// Warm immediately, then poll every 300ms for high-frequency settlement readiness
fetchPythPrices().catch(() => {});
setInterval(fetchPythPrices, 300);

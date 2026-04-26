// ============================================================
// nexus-core/src/price-frontend.js
// Standalone Frontend Price Feed Service (No ties to backend)
// ============================================================

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const WebSocket = require('ws');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

const PORT = process.env.PRICE_FRONTEND_PORT || 3012;

app.get('/prices', (req, res) => {
  res.header('Access-Control-Allow-Origin', '*');
  // Flatten for backward compatibility with REST consumers
  res.json({
    btc: prices.btc.price,
    eth: prices.eth.price,
    sol: prices.sol.price,
    oracleReady: true,
    hasAnyPrice: true
  });
});

// Track prices with timestamps for consistency
const prices = {
  btc: { price: 0, ts: 0 },
  eth: { price: 0, ts: 0 },
  sol: { price: 0, ts: 0 }
};

const PYTH_IDS = {
  btc: '0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43',
  eth: '0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace',
  sol: '0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d'
};

async function fetchPythPrices() {
  try {
    const ids = Object.values(PYTH_IDS).map(id => `ids[]=${id.replace('0x', '')}`).join('&');
    const url = `https://hermes.pyth.network/v2/updates/price/latest?${ids}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    const data = await res.json();

    let count = 0;
    data.parsed.forEach(p => {
      const id = p.id.startsWith('0x') ? p.id.toLowerCase() : `0x${p.id.toLowerCase()}`;
      const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);
      const publishTime = p.price.publish_time * 1000;

      const targetBtc = PYTH_IDS.btc.toLowerCase();
      const targetEth = PYTH_IDS.eth.toLowerCase();
      const targetSol = PYTH_IDS.sol.toLowerCase();

      if (id === targetBtc) { prices.btc.price = price; prices.btc.ts = publishTime; count++; }
      if (id === targetEth) { prices.eth.price = price; prices.eth.ts = publishTime; count++; }
      if (id === targetSol) { prices.sol.price = price; prices.sol.ts = publishTime; count++; }
    });
    // console.log(`[Pyth Poller] Updated ${count} prices`);
  } catch (err) {
    console.error('[Pyth Poller] Error:', err.message);
  }
}

// Poll Pyth every 300ms
setInterval(fetchPythPrices, 300);

// ============================================================
// THE METRONOME: Steady Pulse Emitter
// ============================================================
// We emit at a fixed interval (e.g., 50ms = 20Hz) to ensure the 
// frontend signal never stalls. The frontend chart can then
// interpolate between these pulses at 60fps for maximum smoothness.
// ============================================================
setInterval(() => {
  // Only emit if we have data for at least one asset
  const hasAnyPrice = prices.btc.price > 0 || prices.eth.price > 0 || prices.sol.price > 0;
  
  if (hasAnyPrice) {
    const payload = {
      btc: prices.btc.price,
      eth: prices.eth.price,
      sol: prices.sol.price,
      ts: {
        btc: prices.btc.ts || Date.now(),
        eth: prices.eth.ts || Date.now(),
        sol: prices.sol.ts || Date.now()
      },
      pulse: Date.now()
    };
    io.emit('price_update', payload);
  }
}, 100); // 10Hz is more than enough for smooth interpolation

io.on('connection', (socket) => {
  console.log(`[Price-Frontend] New client connected: ${socket.id}`);
  
  // Initial state (flat payload for compatibility + ts for new logic)
  socket.emit('price_update', {
    btc: prices.btc.price,
    eth: prices.eth.price,
    sol: prices.sol.price,
    ts: { btc: prices.btc.ts, eth: prices.eth.ts, sol: prices.sol.ts },
    pulse: Date.now()
  });

  socket.on('disconnect', () => {
    console.log(`[Price-Frontend] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend Price Feed Service listening on port ${PORT}`);
});

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
  res.json({ ...prices, oracleReady: true, hasAnyPrice: true });
});

// Track prices
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
    const url = `https://hermes.pyth.network/v2/updates/price/latest?${ids}`;
    const res = await fetch(url);
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`HTTP ${res.status}: ${body}`);
    }
    const data = await res.json();

    data.parsed.forEach(p => {
      const id = p.id.startsWith('0x') ? p.id : `0x${p.id}`;
      const price = parseFloat(p.price.price) * Math.pow(10, p.price.expo);

      if (id === PYTH_IDS.btc) prices.btc = price;
      if (id === PYTH_IDS.eth) prices.eth = price;
      if (id === PYTH_IDS.sol) prices.sol = price;
    });

    io.emit('price_update', prices);
  } catch (err) {
    console.error('[Pyth Poller] Error:', err.message);
  }
}

// Poll Pyth every 500ms for high-frequency updates
setInterval(fetchPythPrices, 500);

io.on('connection', (socket) => {
  console.log(`[Price-Frontend] New client connected: ${socket.id}`);
  // Send current prices immediately on connection
  socket.emit('price_update', prices);

  socket.on('disconnect', () => {
    console.log(`[Price-Frontend] Client disconnected: ${socket.id}`);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Frontend Price Feed Service listening on port ${PORT}`);
});

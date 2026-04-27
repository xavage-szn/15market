// ============================================================
// nexus-core/src/price-frontend.js
// High-performance price streaming service (Port 3012)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');
const config = require('./config');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
const sub = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

// Cache latest prices to send on connection
const priceCache = { btc: 0, eth: 0, sol: 0, ts: {} };

// Subscribe to price updates from index.js (or price-backend)
sub.subscribe('price_updates', (err) => {
  if (err) console.error('[Price-Frontend] Subscribe error:', err.message);
});

sub.on('message', (channel, message) => {
  if (channel === 'price_updates') {
    try {
      const data = JSON.parse(message);
      priceCache[data.key] = data.price;
      priceCache.ts[data.key] = data.ts;
      
      // Broadcast to all connected clients
      io.emit('price', data);
    } catch (e) {}
  }
});

io.on('connection', (socket) => {
  // Send current cache immediately
  for (const [key, price] of Object.entries(priceCache)) {
    if (key === 'ts') continue;
    if (price > 0) {
      socket.emit('price', { key, price, ts: priceCache.ts[key] });
    }
  }
});

const PORT = process.env.PRICE_FRONTEND_PORT || 3012;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Price Stream Server listening on port ${PORT}`);
});

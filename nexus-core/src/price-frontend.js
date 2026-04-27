// ============================================================
// nexus-core/src/price-frontend.js
// High-performance price streaming service (Port 3012)
// ============================================================
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const Redis = require('ioredis');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' },
  transports: ['websocket', 'polling']
});

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
const redis = new Redis(redisUrl);
const sub = new Redis(redisUrl);

// Cache latest prices to send on connection
const priceCache = { btc: 0, eth: 0, sol: 0, ts: {} };
let lastRedisUpdate = Date.now();

// Subscribe to price updates from index.js (or price-backend)
sub.subscribe('price_updates', (err) => {
  if (err) console.error('[Price-Frontend] Subscribe error:', err.message);
  else console.log('[Price-Frontend] Subscribed to price_updates channel');
});

sub.on('message', (channel, message) => {
  if (channel === 'price_updates') {
    try {
      const data = JSON.parse(message);
      priceCache[data.key] = data.price;
      priceCache.ts[data.key] = data.ts;
      lastRedisUpdate = Date.now();
      
      // Broadcast to all connected clients
      io.emit('price', data);
    } catch (e) {}
  }
});

// Watchdog: Restart Redis sub if no messages for 10 seconds
setInterval(() => {
  if (Date.now() - lastRedisUpdate > 10000) {
    console.warn('[Price-Frontend] Redis sub stalled. Reconnecting...');
    sub.disconnect();
    sub.connect().then(() => {
        sub.subscribe('price_updates');
    });
    lastRedisUpdate = Date.now(); // Reset to avoid loop
  }
}, 5000);

io.on('connection', (socket) => {
  console.log(`[Price-Frontend] Client connected: ${socket.id}`);
  
  // Send current cache immediately to avoid "Stuck in Loading"
  for (const [key, price] of Object.entries(priceCache)) {
    if (key === 'ts') continue;
    if (price > 0) {
      socket.emit('price', { key, price, ts: priceCache.ts[key] });
    }
  }

  socket.on('disconnect', () => {
    console.log(`[Price-Frontend] Client disconnected: ${socket.id}`);
  });
});

// Warmup logging
setInterval(() => {
  const activeClients = io.engine.clientsCount;
  console.log(`[Price-Frontend] Heatcheck: ${activeClients} clients active. Last update: ${new Date(lastRedisUpdate).toLocaleTimeString()}`);
}, 30000);

const PORT = process.env.PRICE_FRONTEND_PORT || 3012;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Price Stream Server listening on port ${PORT}`);
});

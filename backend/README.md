# 15market Backend (Overhauled)

High-performance, parallel trade settlement engine for **Arc Testnet**.

## Features
- **Parallel Processing**: settled multiple trades concurrently using asynchronous cycles.
- **Multi-Asset Support**: Real-time price consensus for BTC, ETH, SOL, MON, JUP, XRP.
- **Scalable Keeper**: Efficiently monitors on-chain events and manages state in Redis.
- **USDC Optimized**: Handles native USDC transactions on Arc Testnet.

## Project Structure
- `src/index.js`: Express API server with UI-compatible endpoints.
- `src/services/blockchain.js`: Arc Testnet blockchain interaction layer.
- `src/services/pricing.js`: Price discovery and consensus service.
- `src/services/redis.js`: Fast trade state management.
- `src/keeper/processor.js`: Parallel settlement engine.

## Configuration
All configuration is handled via `.env` in the root of the backend directory.

## Getting Started
```bash
# Install dependencies
npm install

# Run in development mode
npm run dev

# Run in production mode
npm start
```

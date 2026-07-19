# Nexus Core

The backend engine powering the 15MARKET protocol. Handles trade execution, price aggregation, settlement, session wallet lifecycle, and cross-chain deposit monitoring.

## Stack

| Layer | Technology |
|-------|------------|
| Runtime | Node.js 18+ |
| API | Express.js |
| Realtime | Socket.IO |
| Cache | Redis |
| Blockchain | Viem (multi-provider RPC failover) |
| Price Feeds | Pyth Network, Binance, MEXC |

## Core Modules

### Classic Engine (classic.js)

The central trade engine managing the full trade lifecycle.

**placeTrade** validates input, resolves the session wallet, auto-funds it with native ARC if needed, computes share price from the OddsEngine, encodes the `placeBet` call, broadcasts via multi-provider failover, deducts from session balance, and returns the on-chain transaction hash.

**lockResult** fires at the exact moment of trade expiry using `trade.settleAt`. It resolves the exit price from a high-resolution historical price buffer (250ms snapshots), applies safety guards against extreme deviation, and emits `trade_expired` to the frontend with the authoritative result.

**creditWinner** computes the net payout (stake / sharePrice * 0.99), credits the session balance, emits `trade_settled` to the frontend, and broadcasts `settleBet` on-chain in the background. If on-chain settlement fails after retries, the in-memory credit is reverted.

**settleLoss** marks the trade as lost, emits `trade_settled`, and leaves the stake in the treasury.

### OddsEngine (services/OddsEngine.js)

Computes dynamic share prices every 250ms for BTC, ETH, and SOL across all duration tiers (5s, 10s, 15s).

The pricing model combines:
5-second rate of change (30% weight)
Tick-to-tick velocity (20% weight)
60-second rate of change (25% weight)
15-minute trend (15% weight)
24-hour change from Binance (10% weight)

Micro-volatility noise is injected as a sine wave to ensure price oscillation even in flat markets. Share prices are clamped between $0.03 and $0.97 with LONG + SHORT always summing to $1.00.

### Session Wallets (rpc.js)

Each user receives a deterministic EOA derived from `keccak256(MASTER_SECRET + userAddress)`. The operator holds private keys and broadcasts transactions on behalf of users.

Key functions:
deriveSessionWallet creates or retrieves the deterministic keypair
_ensureSessionWalletFunded sends native ARC to the session wallet before trades if balance is insufficient
_reclaimIdleSessionArc sweeps excess native ARC back to the operator periodically

### Price Feeds (index.js)

Polls Pyth Network, Binance, and MEXC for BTC/USDT, ETH/USDT, and SOL/USDT. Falls back gracefully on provider failures. Prices are cached in-memory and snapped every 250ms into a historical buffer for accurate settlement price lookups.

### Funding Service (services/fundingService.js)

Monitors cross-chain USDC deposits via Circle's CCTP V2 protocol. Tracks burn events on source chains, polls the IRIS attestation API, and calls `receiveMessage` on Arc Testnet to mint USDC.

Supports deposits from Ethereum Sepolia, Avalanche Fuji, OP Sepolia, and Base Sepolia.

## API Routes

| Route | Method | Purpose |
|-------|--------|---------|
| /session/init | POST | Initialize or restore a trading session |
| /session/balance/:address | GET | Fetch trading balance (cached 15s) |
| /session/deposit | POST | Credit trading balance |
| /session/cashout | POST | Withdraw with 1% fee |
| /trade | POST | Execute a new trade |
| /trades/:address | GET | List active and settled trades |
| /settings | GET | Platform settings (min/max bet, fees) |
| /listings | GET | Available markets |
| /prices | GET | Current price feeds |

## Socket Events

| Event | Direction | Purpose |
|-------|-----------|---------|
| trade_confirmed | Server to Client | Trade executed on-chain |
| trade_expired | Server to Client | Trade reached expiry with result |
| trade_settled | Server to Client | Payout credited or loss confirmed |
| balance_update | Server to Client | Balance changed (deposit, trade, settlement) |
| price_update | Server to Client | Live price feed |

## Configuration

```bash
ARC_RPC=https://rpc.arc.testnet
SESSION_MASTER_SECRET=your_secure_secret
TREASURY_ADDRESS=0x...
PRIVATE_KEY=operator_key
```

## Deployment

```bash
npm install
npm start
```

Runs on the port defined in environment variables (default 3001).

2026 Xavage SZN Engineering.

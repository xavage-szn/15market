# NEXUS CORE - High-Performance Settlement Engine

Nexus Core is the proprietary backend engine powering the 15MARKET protocol. It is engineered for low-latency trade execution, secure asset management, and robust data integrity.

## 🛡️ Core Responsibilities

### 1. Deterministic Identity Management
The engine uses a cryptographic derivation path to generate unique, server-side EOAs (Externally Owned Accounts) for every connected user.
- **Master Secret Protection**: Private keys are generated on-the-fly and never stored in a database.
- **Identity Linkage**: The user's primary wallet address (MetaMask/Base) acts as the entropy source for their session wallet.

### 2. High-Frequency Oracle (Hybrid Model)
Nexus Core maintains a sub-second price feed by aggregating data from:
- **Pyth Network**: Authoritative on-chain data for settlement finality.
- **Binance/MEXC**: Redundant high-liquidity fallbacks to ensure 100% uptime.

### 3. Automated Settlement Engine
The engine monitors active trades with a 50ms heartbeat pulse.
- **Boundary Locking**: Results are locked at the exact millisecond of expiry.
- **Batch Payouts**: Winning payouts are batched into optimized transactions to minimize gas overhead on the Arc Network.

## ⚙️ Technical Stack
- **Runtime**: Node.js 18+
- **Communication**: Socket.IO (Real-time events) & Express.js (REST API)
- **Infrastructure**: Redis (In-memory caching and cross-instance synchronization)
- **Blockchain Interface**: Ethers.js v6

## 🚀 Production Configuration
Nexus Core is designed to be highly configurable through environment variables:
- `SESSION_MASTER_SECRET`: Critical key for wallet derivation.
- `TREASURY_ADDRESS`: Destination for 1% platform fees.
- `ARC_RPC`: High-speed node endpoint.

---
© 2026 Xavage SZN Engineering.

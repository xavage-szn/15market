# 15MARKET - The Next-Generation Decentralized Trading Protocol

![15MARKET Banner](https://img.shields.io/badge/Status-Production--Ready-success?style=for-the-badge&logo=blockchain&color=3CB371)
![Network](https://img.shields.io/badge/Network-Arc--Testnet-blue?style=for-the-badge)
![License](https://img.shields.io/badge/License-Proprietary-red?style=for-the-badge)

**15MARKET** is a high-performance, decentralized binary options and prediction market protocol built on the **Arc Network**. By leveraging an innovative **Embedded Session Wallet** model, 15MARKET delivers a seamless, CEX-like trading experience while maintaining full non-custodial security.

---

## 🚀 Key Innovation: The Nexus Core
At the heart of 15MARKET is the **Nexus Core**, a proprietary high-speed engine that eliminates the friction of traditional DeFi trading.

### ⚡ Deterministic Auto-Signer
Users no longer need to sign every single trade on-chain. Our protocol derives a secure, server-side **EOA (Externally Owned Account)** for each user based on their master wallet identity.
- **Latency-Free Execution**: Trades are matched and executed in milliseconds.
- **Non-Custodial**: Users retain full authority over their session wallets through cryptographic signatures.
- **Auto-Settlement**: Winning trades are automatically calculated and pushed back to the session wallet using our backend authority model.

### 📈 Hybrid Oracle System
15MARKET utilizes a multi-tiered price aggregation engine to ensure 100% data integrity and zero price manipulation:
1. **Primary**: [Pyth Network](https://pyth.network/) (On-chain low-latency data)
2. **Secondary**: Binance Spot (Global liquidity standard)
3. **Tertiary**: MEXC Global (Redundant safety fallback)

---

## 🛠️ Architecture

The platform is split into two specialized clusters:

### 1. [15market (Frontend)](/15market)
A premium, React-based terminal designed for high-stakes trading.
- **Aesthetic**: Sleek dark mode with glassmorphism and real-time micro-animations.
- **State Engine**: Framer Motion & TailwindCSS for a fluid, reactive UI.
- **Connectivity**: Integrated with **Wagmi** and **Viem** for robust EVM wallet support.

### 2. [Nexus-Core (Backend)](/nexus-core)
A robust Node.js controller managing the protocol's lifecycle.
- **Engine**: Express.js + Socket.IO for real-time bi-directional streaming.
- **Storage**: Redis-backed cache for high-frequency price history and session management.
- **Security**: Strict nonce-management and 1% platform fee routing to the Treasury.

---

## 📦 Deployment & Setup

### Environment Configuration
Ensure you have the following variables set in your `.env` files:
```bash
# Nexus-Core
ARC_RPC=https://rpc.arc.testnet
SESSION_MASTER_SECRET=your_secure_secret
TREASURY_ADDRESS=0x...

# 15market
VITE_KEEPER_URL=https://api.15market.com
```

### Installation
```bash
# Install dependencies
npm install

# Start the trading terminal
cd 15market && npm run dev

# Start the Nexus Core
cd nexus-core && npm start
```

---

## 🛡️ Security & Audits
- **Treasury Isolation**: All platform fees (1%) are instantly routed to a dedicated cold wallet.
- **Signature Guard**: Withdrawals require an explicit `personal_sign` from the user's primary wallet.
- **Rate Limiting**: Integrated anti-spam protection for trade execution.

---

## 📬 Contact & Support
Developed by the **Xavage SZN** engineering team. 
- **Website**: [15market.app](https://15market.app)
- **Twitter**: [@15MarketApp](https://twitter.com/15MarketApp)

© 2026 15MARKET Protocol. All rights reserved.

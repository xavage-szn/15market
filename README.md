# 15MARKET

A decentralized prediction market protocol built on the **Arc Network**. Users trade binary outcome shares on real-time crypto price movements with instant execution, dynamic odds, and non-custodial security powered by embedded session wallets.

---

## How It Works

15MARKET operates as a **share-based prediction market**. When you place a trade, you buy YES or NO shares at a dynamic price determined by the OddsEngine. The share price reflects the probability of each outcome and adjusts in real time based on market momentum.

### Shares and Odds

Every trade has two sides: LONG (price goes up) and SHORT (price goes down). Each side has a share price between $0.03 and $0.97, and they always sum to exactly $1.00.

If LONG is priced at $0.65, then SHORT is $0.35. Buying $10 worth of LONG shares means you acquire approximately 15.38 shares. If the outcome is correct, each share pays out $1.00, giving you a gross payout of $15.38 minus the 1% platform fee.

### Payout Calculation

```
grossPayout = stakeAmount / sharePrice
netPayout = grossPayout * 0.99
```

The share price is influenced by duration. Shorter durations allow more extreme odds while longer durations normalize closer to 50/50.

| Duration | Odds Skew |
|----------|-----------|
| 5 seconds | Maximum skew, most extreme odds |
| 10 seconds | Moderate skew |
| 15 seconds | Strongest normalization toward even odds |

### Settlement

At the moment of expiry, the system locks the exit price from a high-resolution price buffer (snapshots every 250ms). If the exit price confirms your direction, you win. Otherwise, your stake is retained by the treasury.

Winning payouts are credited to your session balance instantly. On-chain settlement follows in the background.

---

## Supported Markets

| Asset | Symbol |
|-------|--------|
| Bitcoin | BTC |
| Ethereum | ETH |
| Solana | SOL |

Price feeds are sourced from **Pyth Network**, **Binance**, and **MEXC** with automatic failover to ensure continuous uptime.

---

## Architecture

### Frontend (15market)

A React-based trading terminal optimized for real-time decision making.

**Stack:** React 18, Vite, TailwindCSS, Framer Motion, Wagmi/Viem

**Key features:**
Real-time price charts and countdown timers
Optimistic UI updates with backend-confirmed state
Dark and Light mode with glassmorphism design
Embedded session wallet management

### Backend (Nexus Core)

A Node.js engine handling trade execution, price aggregation, settlement, and session wallet lifecycle.

**Stack:** Node.js, Express, Socket.IO, Redis, Viem

**Key features:**
Deterministic session wallet derivation from user identity
Multi-provider RPC failover with broadcast retry
Dynamic odds computation via OddsEngine (250ms updates)
Automated trade settlement with price locking at expiry
CCTP bridge monitoring for cross-chain USDC deposits

---

## Session Wallets

Each user is assigned a deterministic EOA (Externally Owned Account) derived from their primary wallet address and a server-side master secret. These session wallets handle on-chain trade execution so users never need to sign individual transactions.

Session wallets are funded automatically by the operator before each trade. Excess native ARC tokens are periodically reclaimed by the operator to maintain efficiency.

---

## Deposits and Withdrawals

### Deposits

USDC can be deposited via the **Circle CCTP V2** bridge from any supported source chain:
Ethereum Sepolia
Avalanche Fuji
OP Sepolia
Base Sepolia

Deposits are credited optimistically once the burn transaction is detected. The backend monitors Circle's IRIS attestation API and completes the cross-chain mint on Arc Testnet.

### Withdrawals

Withdrawals send native ARC (USDC) from your session wallet to your connected wallet. A 1% fee applies. Processing time depends on Arc Testnet block confirmation.

---

## Fees

| Fee | Rate | Applied To |
|-----|------|------------|
| Trading fee | 1% of gross payout | Winning trades only |
| Deposit fee | 1% + 0.5% spread | CCTP bridge deposits |
| Withdrawal fee | 1% | All cashouts |

---

## Trade Limits

| Parameter | Value |
|-----------|-------|
| Minimum trade | 0.001 USDC |
| Maximum trade | 1,000,000 USDC |

---

## Setup

### Environment Variables

```bash
# Nexus Core
ARC_RPC=https://rpc.arc.testnet
SESSION_MASTER_SECRET=your_secure_secret
TREASURY_ADDRESS=0x...

# Frontend
VITE_KEEPER_URL=https://api.15market.com
```

### Installation

```bash
npm install

cd 15market && npm run dev
cd nexus-core && npm start
```

---

## FAQ

### How do deposits work?

Deposits are processed through Circle's CCTP V2 cross-chain protocol. You send USDC from a supported testnet (Ethereum Sepolia, Avalanche Fuji, OP Sepolia, or Base Sepolia) and the backend bridges it to Arc Testnet. Your trading balance is credited optimistically once the burn transaction is detected on the source chain, usually within seconds. The full cross-chain completion happens in the background and does not block your ability to trade.

### Are withdrawals instant?

Withdrawals are processed quickly but are not instant in the same way deposits feel. Once you request a cashout, the backend sends native ARC (USDC) from your session wallet to your connected wallet on Arc Testnet. This requires block confirmation on the network, which typically takes a few seconds. A 1% fee is deducted from the withdrawal amount.

### What happens if I lose a trade?

Your staked amount is retained by the treasury contract. No further action is taken on-chain for losing trades. You can immediately place new trades with your remaining balance.

### How are winning payouts calculated?

Your gross payout equals your stake divided by the share price at the time of purchase. A 1% platform fee is deducted from the gross payout. For example, staking $10 at a share price of $0.60 yields a net payout of approximately $16.50.

### What determines the share price?

The OddsEngine computes share prices every 250ms using a weighted model that combines 5-second rate of change (30% weight), tick velocity (20%), 60-second rate of change (25%), 15-minute trend (15%), and 24-hour change (10%). Micro-volatility noise is added to ensure price oscillation even in flat markets.

---

## Security

**Treasury isolation:** Platform fees are routed to a dedicated treasury contract.
**Session wallet derivation:** Private keys are generated on-the-fly from a master secret and never stored.
**Signature guard:** Withdrawals require explicit user authorization.
**Rate limiting:** Anti-spam protection for trade execution endpoints.

---

Developed by **Xavage SZN**

Website: [15market.app](https://15market.app)
Twitter: [@15MarketApp](https://twitter.com/15MarketApp)

2026 15MARKET Protocol. All rights reserved.

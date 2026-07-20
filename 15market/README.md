# 15MARKET Trading Terminal

The frontend interface for the 15MARKET prediction market protocol. Built for real-time trading with instant feedback and non-custodial wallet management.

## Stack

| Layer | Technology |
|-------|------------|
| Framework | React 18 |
| Build | Vite |
| Styling | TailwindCSS, custom design system |
| Animation | Framer Motion |
| Charts | Recharts |
| Wallet | Wagmi, Viem |
| Auth | Privy |

## Key Features

### Real-Time Trading

The TradeTerminal component provides instant price updates, dynamic share pricing, and one-click trade execution. Share prices are computed by the backend OddsEngine and streamed via Socket.IO. The UI displays potential payout before confirmation using the current share price and selected duration.

### Live Execution Monitor

Active trades display a live countdown, real-time entry-to-current price comparison, and a visual progress bar. During the final seconds of a trade, a pulsing indicator signals that the result is being locked by the backend. The frontend does not guess the outcome and waits for the backend to confirm via socket events.

### Balance Synchronization

Trading balance is synchronized from the backend as the single source of truth. A 5-second polling interval provides redundancy alongside real-time socket updates. Every deposit, withdrawal, trade, and settlement event updates the displayed balance immediately without optimistic guards or delta thresholds.

### Embedded Session Wallet

The frontend manages a session wallet derived from the user's primary wallet. On trade execution, the session wallet is auto-funded by the operator and the `placeBet` transaction is broadcast on-chain. The transaction hash is visible in trade history and links to the Arc Testnet explorer.

### Deposit and Withdrawal Flows

Deposits support CCTP V2 bridging from Ethereum Sepolia, Avalanche Fuji, OP Sepolia, and Base Sepolia. A success overlay with backdrop blur confirms the action and auto-dismisses after one second. Withdrawal requests deduct from the session balance and broadcast a native ARC transfer to the connected wallet.

### Dark and Light Mode

The application supports dark and light themes with glassmorphism card effects, backdrop blur, and fluid transitions powered by Framer Motion's AnimatePresence.

## Project Structure

```
src/
  UserApp.jsx          Main application with socket handlers, balance state, trade management
  App.jsx              Entry point with Privy provider and wallet connection
  client.js            Viem public client and chain configuration
  constants.js         Chain IDs, RPC URLs, explorer links, market definitions
  index.css            Global styles and scrollbar theming
  components/
    TradeTerminal.jsx  Trade execution UI with asset selection, duration, share pricing
    LiveExecution.jsx  Active trade monitor with countdown and settlement status
    TradeHistory.jsx   Settled trade records with receipt generation and explorer links
    SuccessOverlay.jsx Animated success confirmation overlay
    ShareReceipt.jsx   Trade receipt card for sharing
    DashboardLayout.jsx Navigation and layout wrapper
```

## Build and Deploy

```bash
npm install
npm run build
npm run preview
```

Optimized for deployment on Vercel or Render.

2026 Xavage SZN. Built for the Arc Network.

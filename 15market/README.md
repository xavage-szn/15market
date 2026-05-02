# 15MARKET - Trading Terminal (v2.0)

This is the flagship frontend implementation for the 15MARKET protocol—a high-fidelity, reactive trading interface designed for the professional trader.

## ✨ Experience Highlights

### 🚄 Zero-Latency UX
- **Optimistic State Management**: Balance updates and trade confirmations are reflected in the UI instantly, even before on-chain finality.
- **Micro-Animations**: Built with **Framer Motion** to provide tactile feedback on every user interaction.
- **Dynamic Theming**: Support for sleek "Dark" and curated "Light" modes with glassmorphism effects.

### 🔐 Secure-First Wallet Integration
- **Wagmi/Viem Stack**: Industry-standard connectivity for all EVM wallets.
- **Embedded Session Support**: Seamlessly manages the transition between primary and session wallets.
- **Signature Authorization**: High-value actions (like withdrawals) require explicit user signatures to prevent unauthorized execution.

## 🛠️ Architecture
- **Framework**: React 18+
- **Styling**: TailwindCSS & Custom Vanilla CSS (Design System)
- **Visualization**: Recharts & High-precision LCD Digital Displays
- **Build Tool**: Vite (Lightning-fast HMR)

## 📦 Deployment
The frontend is optimized for deployment on Vercel or Render.
```bash
npm run build
npm run preview
```

---
© 2026 Xavage SZN. Built for the Arc Network.

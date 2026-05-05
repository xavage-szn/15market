// ============================================================
// nexus-core/src/config.js
// Single source of truth for all configuration
// ============================================================
require('dotenv').config();

module.exports = {
  // Network
  PORT: Number(process.env.PORT || 3010),
  ROUNDS_PORT: Number(process.env.ROUNDS_PORT || 3011),
  
  // Blockchain / Arc Testnet
  CHAIN_ID: Number(process.env.CHAIN_ID || 5042002),
  RPCS: [
    process.env.ARC_RPC_1,
    process.env.ARC_RPC_2,
    process.env.ARC_RPC_3,
    process.env.ARC_RPC_4
  ].filter(Boolean),
  THIRDWEB_SECRET_KEY: process.env.THIRDWEB_SECRET_KEY,
  THIRDWEB_CLIENT_ID: process.env.THIRDWEB_CLIENT_ID,
  PRIVATE_KEY: process.env.PRIVATE_KEY,
  CONTRACT_ADDRESS: process.env.ARC_CONTRACT_ADDRESS,
  ROUNDS_CONTRACT_ADDRESS: process.env.ROUNDS_CONTRACT_ADDRESS,
  
  // Classic Trades
  BATCH_WINDOW_MS: Number(process.env.SETTLEMENT_BATCH_WINDOW_MS || 25),
  SETTLEMENT_CONCURRENCY: Number(process.env.SETTLEMENT_CONCURRENCY || 16),
  DEFAULT_SESSION_BALANCE: Number(process.env.DEFAULT_SESSION_BALANCE || 1000),
  PAYOUT_INLINE_FALLBACK: String(process.env.PAYOUT_INLINE_FALLBACK || 'true') === 'true',

  // Payout Multipliers (hardcoded — do NOT source from env)
  // Duration tiers: 5s = 2.90x, 10s = 2.40x, 15s = 1.90x
  // Applied as: stake * multiplier * 0.99 (1% platform fee)
  MULTIPLIERS: { 5: 2.90, 10: 2.40, 15: 1.90 },
  
  // Auth: wallet address-based identity (Reown / WalletConnect)

  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',

  // Auto-Signer
  FACTORY_ADDRESS: process.env.ARC_FACTORY_ADDRESS || '0x0000000000000000000000000000000000000000',
  TREASURY_ADDRESS: process.env.TREASURY_ADDRESS || '0x0000000000000000000000000000000000000000',
};

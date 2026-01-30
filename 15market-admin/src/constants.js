// Network Constants & Chain Definitions

// 1. Solana RPC Endpoints
export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || "https://api.devnet.solana.com";
export const SOLANA_READ_RPC = import.meta.env.VITE_SOLANA_READ_RPC || "https://api.devnet.solana.com";

// 2. Arc Network Constants
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS || "0x041e80256b3C72a0e16d78753F28f14A40d78c08";
export const ARC_RPC = import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network";

// 3. Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'c57ca95b47569778a828d19178114f4d';
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '15MARKET_ADMIN_SECRET_KEY_2024';
const rawKeeperUrl = import.meta.env.VITE_KEEPER_URL || "https://api.15market.online";
export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;

// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// 1. Arc Network Selection
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS || "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
export const ARC_USDC_ADDRESS = import.meta.env.VITE_ARC_USDC_ADDRESS || "0x3600000000000000000000000000000000000000";
export const ARC_RPC = "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1";
export const ARC_RPC_BACKUP = "https://rpc.testnet.arc.network";
export const SOLANA_RPC = import.meta.env.VITE_SOLANA_RPC || "https://api.devnet.solana.com";
// 2. Keeper Configuration
export const KEEPER_URL = import.meta.env.VITE_KEEPER_URL || "https://api.15market.online";
export const KEEPER_URL_SOLANA = import.meta.env.VITE_KEEPER_URL_SOLANA || `${KEEPER_URL}/solana`;
export const KEEPER_URL_ARC = import.meta.env.VITE_KEEPER_URL_ARC || `${KEEPER_URL}/arc`;
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '15MARKET_ADMIN_SECRET_KEY_2024';

// 2. Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'c57ca95b47569778a828d19178114f4d';

// 3. Chain Definition for Arc
export const arcTestnet = defineChain({
    id: 5042002,
    name: 'Arc Testnet',
    nativeCurrency: {
        name: 'USDC',
        symbol: 'USDC',
        decimals: 18
    },
    rpcUrls: {
        default: {
            http: [ARC_RPC],
        },
        public: {
            http: [ARC_RPC],
        },
    },
    blockExplorers: {
        default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
    },
    testnet: true,
});

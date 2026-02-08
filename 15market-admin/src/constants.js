// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// Arc Network Constants
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS || "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
export const ARC_RPC = import.meta.env.VITE_ARC_RPC || "https://rpc.testnet.arc.network";

// Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || 'c57ca95b47569778a828d19178114f4d';
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '15MARKET_ADMIN_SECRET_KEY_2024';
const rawKeeperUrl = import.meta.env.VITE_KEEPER_URL || "https://api.15market.online";
export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;
export const KEEPER_URL_ARC = KEEPER_URL;

// Chain Definition for Arc
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

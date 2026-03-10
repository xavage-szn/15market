import { defineChain } from 'viem'
const THIRDWEB_CLIENT_ID = import.meta.env.VITE_THIRDWEB_CLIENT_ID || "33df2adaf240de11d97651104a14c461";

// Arc Network Constants
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_RPC = import.meta.env.VITE_ARC_RPC || `https://5042002.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`;

// Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;
const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const rawKeeperUrl = import.meta.env.VITE_KEEPER_URL || (isLocal ? "http://localhost:3010" : "https://api.15market.online");
export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;
export const KEEPER_URL_ARC = isLocal ? "http://localhost:3010" : (import.meta.env.VITE_KEEPER_URL_ARC || `${KEEPER_URL}/arc`);


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

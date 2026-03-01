// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// ARC TESTNET
export const ARC_CHAIN_ID = 5042002;
export const ARC_RPCS = [
    "https://rpc.testnet.arc.network",
    "https://5042002.rpc.thirdweb.com",
    "https://rpc-test-1.arc.market"
];
export const ARC_RPC = ARC_RPCS[0];
export const ARC_EXPLORER = "https://explorer-test-1.arc.market";
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_USDC_ADDRESS = "0x0000000000000000000000000000000000000000"; // Native Coin
export const ARC_RPC_BACKUP = ARC_RPCS[1];
export const ARC_RPC_THIRDWEB = ARC_RPCS[0];
// 2. Keeper Configuration
const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.') ||
        window.location.hostname.includes('10.'));

// Derivation logic:
// 1. If VITE_KEEPER_URL is an absolute URL (starts with http), use it always.
// 2. If it's a relative path (starts with /), only use it if we are local OR we explicitly want proxying (like in some local dev setups).
// 3. Fallback to hardcoded absolute URL for production if ENV is relative or missing.

const envUrl = import.meta.env.VITE_KEEPER_URL;
let rawKeeperUrl = envUrl || (isLocal ? `http://${window.location.hostname}:3010` : "https://api.15market.online");

// Special case: if ENV is a relative path like /arc-api but we are on Vercel, it will fail unless we are local.
if (envUrl && envUrl.startsWith('/') && !isLocal && typeof window !== 'undefined') {
    // In production Vercel, relative paths for APIs fail without proxy config. 
    // If the user hasn't provided a full URL, we fallback to the last known production domain
    rawKeeperUrl = "https://api.15market.online";
}

export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;
export const KEEPER_URL_ARC = import.meta.env.VITE_KEEPER_URL_ARC || (isLocal && envUrl?.startsWith('/') ? envUrl : `${KEEPER_URL}/arc`);
console.log(`🌐 [Config] Keeper URL: ${KEEPER_URL_ARC}`);
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN;

// 2. Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID;

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

// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// ARC TESTNET
export const ARC_CHAIN_ID = 5042002;

export const ARC_RPCS = [
    "https://rpc.testnet.arc.network"
];
export const ARC_RPC = ARC_RPCS[0];
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_ROUNDS_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_ROUNDS_CONTRACT_ADDRESS || "0x02AE9D2a7CEca436E7B3A482772EfB74C4fE4721";
export const ARC_USDC_ADDRESS = "0x0000000000000000000000000000000000000000"; // Native Coin
export const ARC_RPC_BACKUP = ARC_RPCS[1];
// 2. Keeper Configuration
const isNative = typeof window !== 'undefined' && !!window.Capacitor;
const isLocal = typeof window !== 'undefined' &&
    !isNative &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.includes('192.168.') ||
        window.location.hostname.includes('10.'));

// Derivation logic:
// 1. If VITE_KEEPER_URL is an absolute URL (starts with http), use it always.
// 2. If it's a relative path (starts with /), only use it if we are local OR we explicitly want proxying (like in some local dev setups).
// 3. Fallback to hardcoded absolute URL for production if ENV is relative or missing.

const envUrl = import.meta.env.VITE_KEEPER_URL;
const envUrlArc = import.meta.env.VITE_KEEPER_URL_ARC;

// If we are local, and the env variable is missing or pointing to the production domain,
// we should default to the local backend to prevent "Failed to Fetch" or CORS errors.
const PRODUCTION_BACKEND = "https://api.15market.online";

const getBaseUrl = (envValue) => {
    // Directly use the provided environment variable, or fallback to the production backend.
    // This allows localhost to test against production by simply setting it in .env
    const final = envValue || PRODUCTION_BACKEND;
    if (isLocal && final === PRODUCTION_BACKEND) {
        console.log("🛠️ [Config] Connecting to Production Backend from Localhost");
    }
    return final;
};

const rawKeeperUrl = getBaseUrl(envUrl);
const rawKeeperUrlArc = getBaseUrl(envUrlArc);

const ensureAbsolute = (url) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://')) return url;
    // Don't modify absolute paths in local dev
    if (url.startsWith('/') || url.includes('localhost')) return url;
    return `https://${url}`;
};

export const KEEPER_URL = ensureAbsolute(rawKeeperUrl).endsWith('/') ? ensureAbsolute(rawKeeperUrl).slice(0, -1) : ensureAbsolute(rawKeeperUrl);
export const KEEPER_URL_ARC = ensureAbsolute(rawKeeperUrlArc).endsWith('/') ? ensureAbsolute(rawKeeperUrlArc).slice(0, -1) : ensureAbsolute(rawKeeperUrlArc);

export const KEEPER_URL_ROUNDS = `${KEEPER_URL_ARC}/rounds`;


// PRODUCTION DIAGNOSTIC - Helps find "Failed to Fetch" causes
console.log(`🌐 [Config] API Endpoint: ${KEEPER_URL_ARC}`);
console.log(`🎯 [Config] Rounds API: ${KEEPER_URL_ROUNDS}`);
if (!isLocal && KEEPER_URL_ARC.includes('localhost')) {
    console.warn("⚠️ [Config] WARNING: Production frontend is trying to call a LOCAL backend. Check VITE_KEEPER_URL_ARC environment variable in Vercel.");
}
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
            http: ARC_RPCS,
        },
        public: {
            http: ARC_RPCS,
        },
    },
    blockExplorers: {
        default: { name: 'ArcScan', url: 'https://testnet.arcscan.app' },
    },
    testnet: true,
});

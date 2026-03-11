// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// ARC TESTNET
export const ARC_CHAIN_ID = 5042002;
export const THIRDWEB_CLIENT_ID = import.meta.env.VITE_THIRDWEB_CLIENT_ID || "33df2adaf240de11d97651104a14c461";

export const ARC_RPCS = [
    "https://rpc.testnet.arc.network",
    `https://5042002.rpc.thirdweb.com/${THIRDWEB_CLIENT_ID}`
];
export const ARC_RPC = ARC_RPCS[0];
export const ARC_EXPLORER = "https://testnet.arcscan.app";
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS;
export const ARC_USDC_ADDRESS = "0x0000000000000000000000000000000000000000"; // Native Coin
export const ARC_RPC_BACKUP = ARC_RPCS[1];
export const ARC_RPC_THIRDWEB = ARC_RPCS[1];
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
    if (isLocal) {
        if (!envValue || envValue.includes('api.15market.online') || envValue.includes('railway.app') || envValue.startsWith('/')) {
            console.log("🛠️ [Config] Local fallback enabled: Using localhost:3010");
            return `http://${window.location.hostname}:3010`;
        }
    }
    // Production: Use env var if set, otherwise use the backend domain
    const final = envValue || PRODUCTION_BACKEND;
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

// PRODUCTION DIAGNOSTIC - Helps find "Failed to Fetch" causes
console.log(`🌐 [Config] API Endpoint: ${KEEPER_URL_ARC}`);
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

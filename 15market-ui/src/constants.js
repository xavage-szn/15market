// Network Constants & Chain Definitions
import { defineChain } from 'viem'

// ARC TESTNET
export const ARC_CHAIN_ID = 5042002;
export const ARC_RPCS = [
    "https://5042002.rpc.thirdweb.com",
    "https://rpc.testnet.arc.network",
    "https://rpc-test-1.arc.market"
];
export const ARC_RPC = ARC_RPCS[0];
export const ARC_EXPLORER = "https://explorer-test-1.arc.market";
export const ARC_CONTRACT_ADDRESS = import.meta.env.VITE_ARC_CONTRACT_ADDRESS || "0x345014899b42bF9034D9475760609e64B1433A6a"; // NEW V2
export const ARC_USDC_ADDRESS = "0x0000000000000000000000000000000000000000"; // Native Coin
export const ARC_RPC_BACKUP = ARC_RPCS[1];
export const ARC_RPC_THIRDWEB = ARC_RPCS[0];
// 2. Keeper Configuration
const isLocal = typeof window !== 'undefined' &&
    (window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1' ||
        window.location.hostname.startsWith('192.168.') ||
        window.location.hostname.startsWith('10.'));

const rawKeeperUrl = import.meta.env.VITE_KEEPER_URL || (isLocal ? `http://${window.location.hostname}:3010` : "https://api.15market.online");
export const KEEPER_URL = rawKeeperUrl.endsWith('/') ? rawKeeperUrl.slice(0, -1) : rawKeeperUrl;

// If we are local, prioritize current hostname:3010 for the Arc keeper unless explicitly overridden
export const KEEPER_URL_ARC = import.meta.env.VITE_KEEPER_URL_ARC || (isLocal ? `http://${window.location.hostname}:3010` : `${KEEPER_URL}/arc`);
console.log(`🌐 [Config] Keeper URL: ${KEEPER_URL_ARC}`);
export const ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN || '15MARKET_ADMIN_SECRET_KEY_2024';

// 2. Project ID
export const projectId = import.meta.env.VITE_REOWN_PROJECT_ID || '4aebd2ef806c541b6aaf003da2930c58';
export const PARA_API_KEY = import.meta.env.VITE_PARA_API_KEY || "beta_d86df4100fa75b359939af58f0f43abb";

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

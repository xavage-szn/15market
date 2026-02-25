import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arcTestnet, projectId } from './constants';

/**
 * Wagmi Configuration for Reown AppKit
 * 
 * Single-network config: Arc Testnet only.
 * Auto-switches wallets to Arc Testnet on connect.
 */

// Fallback to the known working ID if env is missing
const FINAL_PROJECT_ID = projectId || '4aebd2ef806c541b6aaf003da2930c58';
if (!projectId) console.warn("⚠️ [Config] VITE_REOWN_PROJECT_ID is missing from .env, using fallback.");

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    networks: [arcTestnet],
    projectId: FINAL_PROJECT_ID
});

// Initialize Reown AppKit — Arc Testnet ONLY
createAppKit({
    adapters: [wagmiAdapter],
    networks: [arcTestnet],
    defaultNetwork: arcTestnet,
    projectId: FINAL_PROJECT_ID,
    metadata: {
        name: '15market',
        description: 'The Precision Market - Decentralized Prediction Markets',
        url: typeof window !== 'undefined' ? window.location.origin : 'https://15market.online',
        icons: ['https://15market.online/logo.png']
    },
    features: {
        analytics: false,
        email: false,
        socials: false,
    },
    allowUnsupportedChain: false,
    enableNetworkSwitch: true,
});

// Export Wagmi config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

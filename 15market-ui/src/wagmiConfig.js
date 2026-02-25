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
        url: 'https://15market.online',
        icons: ['https://15market.online/logo.png']
    },
    features: {
        analytics: false,
        swaps: false,
        onramp: false,
        emailShowWallets: false,
        socials: false,
    },
    allWallets: 'SHOW',
    featuredWalletIds: [
        'c57ca95b47569778a828d19178114f4db188b89b763c899ba0be274e97267d96', // MetaMask
        '4622a2b2d6af1c9844944291e5e7351a6aa24cd7b23099efac1b2fd875da31a0', // Trust Wallet
        'fd20dc426fb37566d803205b19bbc1d4096b248ac04548e18b75ea5b45987ef9', // Coinbase Wallet
        '1ae92b26df02f0abca6304df07debccd18262fdf5fe82daa81593582dac9a369', // Rainbow
    ],
    allowUnsupportedChain: false,
    enableNetworkSwitch: false,
    enableWalletGuide: false,
});

// Export Wagmi config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arcTestnet, projectId } from './constants';

/**
 * Wagmi Configuration for Reown AppKit
 * 
 * Single-network config: Arc Testnet only.
 * Auto-switches wallets to Arc Testnet on connect.
 */

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    networks: [arcTestnet],
    projectId
});

// Initialize Reown AppKit — Arc Testnet ONLY
createAppKit({
    adapters: [wagmiAdapter],
    networks: [arcTestnet],
    defaultNetwork: arcTestnet,
    projectId,
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
    },
    allowUnsupportedChain: false,
    enableNetworkSwitch: false,
});

// Export Wagmi config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

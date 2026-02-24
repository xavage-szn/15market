import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arcTestnet, ARC_RPC, projectId } from './constants';

/**
 * Wagmi Configuration for Reown AppKit - Admin Portal
 * 
 * Target Network: Arc Testnet only.
 */

// Create Wagmi adapter for Reown
export const wagmiAdapter = new WagmiAdapter({
    networks: [arcTestnet],
    projectId
});

// Initialize Reown AppKit
createAppKit({
    adapters: [wagmiAdapter],
    networks: [arcTestnet],
    defaultNetwork: arcTestnet,
    projectId,
    metadata: {
        name: '15market Admin',
        description: '15market Administrative Control Center',
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
export const wagmiConfig = wagmiAdapter.wagmiConfig;

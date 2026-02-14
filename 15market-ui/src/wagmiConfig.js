import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arcTestnet, projectId } from './constants';

/**
 * Wagmi Configuration for Reown AppKit
 * 
 * Provides wallet connectivity using Reown (official WalletConnect solution)
 * Supports Arc testnet with MetaMask, WalletConnect, and other EVM wallets
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
    projectId,
    metadata: {
        name: '15market',
        description: 'The Precision Market - Decentralized Prediction Markets',
        url: 'https://15market.online',
        icons: ['https://15market.online/logo.png']
    },
    features: {
        analytics: false
    }
});

// Export Wagmi config for WagmiProvider
export const config = wagmiAdapter.wagmiConfig;

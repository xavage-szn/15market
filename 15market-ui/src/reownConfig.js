import { createAppKit } from '@reown/appkit/react'
import { SolanaAdapter } from '@reown/appkit-adapter-solana'
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi'
import { solanaDevnet } from '@reown/appkit/networks'
import { projectId, arcTestnet, SOLANA_RPC } from './constants'

// Export constants for convenience, re-exported from constants.js
export * from './constants'

// 1. Set up Solana Adapter
const solanaWeb3JsAdapter = new SolanaAdapter({})

// Custom Solana Devnet with Alchemy RPC
const customSolanaDevnet = {
    ...solanaDevnet,
    rpcUrls: {
        ...solanaDevnet.rpcUrls,
        default: { http: [SOLANA_RPC] },
        public: { http: [SOLANA_RPC] }
    }
}

// 2. Set up Wagmi Adapter
const wagmiAdapterExport = new WagmiAdapter({
    projectId,
    networks: [arcTestnet]
})

// 3. Create AppKit
if (typeof window !== 'undefined') {
    createAppKit({
        adapters: [solanaWeb3JsAdapter, wagmiAdapterExport],
        networks: [arcTestnet, customSolanaDevnet],
        metadata: {
            name: '15Market',
            description: '15Market App',
            url: 'https://15market.app',
            icons: ['https://avatars.githubusercontent.com/u/179229932']
        },
        projectId,
        features: {
            analytics: true
        }
    })
}

export const wagmiAdapter = wagmiAdapterExport;

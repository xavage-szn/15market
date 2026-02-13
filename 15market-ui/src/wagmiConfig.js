import { createConfig, http } from 'wagmi'
import { arcTestnet, projectId, ARC_RPC } from './constants'
import { sepolia } from 'viem/chains'
import { injected, walletConnect } from 'wagmi/connectors'
import { paraConnector } from '@getpara/wagmi-v2-integration'
import { para, queryClient } from './paraClient'

export const wagmiConfig = createConfig({
    chains: [arcTestnet, sepolia],
    connectors: [
        injected(),
        walletConnect({
            projectId: "4aebd2ef806c541b6aaf003da2930c58",
            metadata: {
                name: "15market",
                description: "Trade Assets on Arc",
                url: "https://15market.online",
                icons: ["https://15market.online/logo.png"]
            }
        }),
        paraConnector({ para, queryClient, appName: '15market' }),
    ],
    transports: {
        [arcTestnet.id]: http(ARC_RPC, {
            timeout: 30000, // 30s timeout for Arc RPC
            retryCount: 3,
            retryDelay: 1000,
        }),
        [sepolia.id]: http(),
    },
})

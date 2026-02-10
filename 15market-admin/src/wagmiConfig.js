import { createConfig, http } from 'wagmi'
import { arcTestnet, ARC_RPC } from './constants'
import { injected, walletConnect } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    connectors: [
        injected(),
        walletConnect({ projectId: "4aebd2ef806c541b6aaf003da2930c58" }),
    ],
    transports: {
        [arcTestnet.id]: http(ARC_RPC, {
            timeout: 30000,
            retryCount: 3,
            retryDelay: 1000,
        }),
    },
})

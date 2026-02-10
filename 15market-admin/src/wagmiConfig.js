import { arcTestnet, ARC_RPC } from './constants'
import { injected, walletConnect } from 'wagmi/connectors'
import { paraConnector } from '@getpara/wagmi-v2-integration'
import { para, queryClient } from './paraClient'

import { createConfig, http, createStorage } from 'wagmi'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    multiInjectedProviderDiscovery: true,
    storage: createStorage({ storage: window.localStorage }),
    connectors: [
        paraConnector({ para, queryClient, appName: '15market' }),
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

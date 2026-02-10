import { arcTestnet, ARC_RPC } from './constants'
import { injected, walletConnect } from 'wagmi/connectors'
import { paraConnector } from '@getpara/wagmi-v2-integration'
import { para, queryClient } from './paraClient'

import { createConfig, http, createStorage } from 'wagmi'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    multiInjectedProviderDiscovery: false, // Disable for stability
    storage: createStorage({ storage: window.localStorage }),
    connectors: [
        paraConnector({ para, queryClient, appName: '15market' }),
        injected(),
    ],
    transports: {
        [arcTestnet.id]: http(ARC_RPC),
    },
})

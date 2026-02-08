import { createConfig, http } from 'wagmi'
import { arcTestnet } from './constants'
import { injected } from 'wagmi/connectors'
import { paraConnector } from '@getpara/wagmi-v2-integration'
import { para, queryClient } from './paraClient'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    connectors: [
        injected(),
        paraConnector({ para, queryClient, appName: '15market' }),
    ],
    transports: {
        [arcTestnet.id]: http(),
    },
})

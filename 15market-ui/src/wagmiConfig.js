import { createConfig, http } from 'wagmi'
import { arcTestnet } from './constants'
import { injected } from 'wagmi/connectors'
import { getParaConnector } from '@getpara/wagmi-v2-integration'
import { para } from './paraClient'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    connectors: [
        injected(),
        getParaConnector(para),
    ],
    transports: {
        [arcTestnet.id]: http(),
    },
})

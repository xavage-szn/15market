import { createConfig, http } from 'wagmi'
import { arcTestnet } from './constants'
import { injected } from 'wagmi/connectors'

export const wagmiConfig = createConfig({
    chains: [arcTestnet],
    connectors: [
        injected(),
    ],
    transports: {
        [arcTestnet.id]: http(),
    },
})

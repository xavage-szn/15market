import { createConfig, http } from 'wagmi';
import { injected, walletConnect } from 'wagmi/connectors';
import { arcTestnet, projectId } from './constants';

export const config = createConfig({
    chains: [arcTestnet],
    connectors: [
        injected(),
        walletConnect({ projectId }),
    ],
    transports: {
        [arcTestnet.id]: http(),
    },
});

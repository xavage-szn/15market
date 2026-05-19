import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { arcTestnet, monadTestnet, avalancheFuji, sepolia } from './constants';

export const config = createConfig({
    chains: [arcTestnet, monadTestnet, avalancheFuji, sepolia],
    transports: {
        [arcTestnet.id]: http(),
        [monadTestnet.id]: http(),
        [avalancheFuji.id]: http(),
        [sepolia.id]: http(),
    },
});



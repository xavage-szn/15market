import { createConfig } from '@privy-io/wagmi';
import { http } from 'wagmi';
import { arcTestnet } from './constants';

export const config = createConfig({
    chains: [arcTestnet],
    transports: {
        [arcTestnet.id]: http(),
    },
});



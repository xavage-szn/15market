import { createConfig, http } from 'wagmi';
import { arcTestnet } from './constants';

/**
 * Wagmi Configuration for 15market
 * 
 * Standard wagmi config to be used with PrivyProvider.
 */

export const config = createConfig({
    chains: [arcTestnet],
    transports: {
        [arcTestnet.id]: http(),
    },
});

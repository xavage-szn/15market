import { createConfig, http } from 'wagmi';
import { arcTestnet } from './constants';
import { turnkeyConnector } from './utils/TurnkeyConnector';
import { getRpId } from './main';

// We will pass a reference to the Turnkey state to this connector 
// This is initialized in main.jsx via the TurnkeyProvider
export const config = createConfig({
    chains: [arcTestnet],
    connectors: [
        turnkeyConnector({
            organizationId: import.meta.env.VITE_TURNKEY_ORGANIZATION_ID,
            apiBaseUrl: import.meta.env.VITE_TURNKEY_API_BASE_URL,
            rpId: getRpId(),
            getWallets: () => window.getTurnkeyWallets?.() || [],
        }),
    ],
    transports: {
        [arcTestnet.id]: http(),
    },
});


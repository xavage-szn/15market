import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { arcTestnet, projectId } from './constants';

// WagmiAdapter is Reown's official wrapper that wires AppKit with Wagmi.
// The createAppKit() call in main.jsx will consume this adapter.
export const wagmiAdapter = new WagmiAdapter({
    networks: [arcTestnet],
    projectId,
    ssr: false,
});

// Export the wagmi config produced by the adapter so components
// that need <WagmiProvider config={...}> can import it directly.
export const config = wagmiAdapter.wagmiConfig;

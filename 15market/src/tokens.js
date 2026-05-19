export const SUPPORTED_TOKENS = [
    {
        id: 'mon',
        symbol: 'MON',
        name: 'Monad',
        icon: '/monad.png',
        chainId: 10143, 
        address: '0x0000000000000000000000000000000000000000', // Native
        usdcAddress: '0x534b2f3A21130d7a60830c2Df862319e593943A3', // Monad USDC
        decimals: 18,
    },
    {
        id: 'avax',
        symbol: 'AVAX',
        name: 'Avalanche',
        icon: '/avax.png',
        chainId: 43113, // Fuji Testnet
        address: '0x0000000000000000000000000000000000000000', // Native
        usdcAddress: '0x5425890298aed601595a70AB815c96711a31Bc65', // Fuji USDC
        decimals: 18,
    },
    {
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        icon: '/ethereum.png',
        chainId: 11155111, // Sepolia
        address: '0x0000000000000000000000000000000000000000', // Native
        usdcAddress: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238', // Sepolia USDC
        decimals: 18,
    },
    {
        id: 'sol',
        symbol: 'SOL',
        name: 'Solana',
        icon: '/sol.png',
        chainId: 101, // Devnet/Testnet
        address: '11111111111111111111111111111111', 
        usdcAddress: '4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU', // Devnet USDC
        decimals: 9,
    }
];

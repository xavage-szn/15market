export const SUPPORTED_TOKENS = [
    {
        id: 'mon',
        symbol: 'MON',
        name: 'Monad',
        icon: '/monad.png',
        chainId: 10143, 
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'avax',
        symbol: 'AVAX',
        name: 'Avalanche',
        icon: '/avax.png',
        chainId: 43113, // Fuji Testnet
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        icon: '/ethereum.png',
        chainId: 11155111, // Sepolia
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'sol',
        symbol: 'SOL',
        name: 'Solana',
        icon: '/sol.png',
        chainId: 101, // Devnet/Testnet
        address: '11111111111111111111111111111111', 
        decimals: 9,
    }
];

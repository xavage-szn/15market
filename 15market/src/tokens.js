export const SUPPORTED_TOKENS = [
    {
        id: 'usdc',
        symbol: 'USDC',
        name: 'USD Coin',
        icon: 'https://cryptologos.cc/logos/usd-coin-usdc-logo.png',
        chainId: 5042002,
        address: '0x0000000000000000000000000000000000000000', // Native on Arc
        decimals: 18,
    },
    {
        id: 'mon',
        symbol: 'MON',
        name: 'Monad',
        icon: 'https://pbs.twimg.com/profile_images/1643640247754399744/wM8d-8jD_400x400.jpg',
        chainId: 10143, // Monad Testnet Chain ID (Commonly used)
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'avax',
        symbol: 'AVAX',
        name: 'Avalanche',
        icon: 'https://cryptologos.cc/logos/avalanche-avax-logo.png',
        chainId: 43113, // Fuji Testnet
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'eth',
        symbol: 'ETH',
        name: 'Ethereum',
        icon: 'https://cryptologos.cc/logos/ethereum-eth-logo.png',
        chainId: 11155111, // Sepolia
        address: '0x0000000000000000000000000000000000000000', // Native
        decimals: 18,
    },
    {
        id: 'sol',
        symbol: 'SOL',
        name: 'Solana',
        icon: 'https://cryptologos.cc/logos/solana-sol-logo.png',
        chainId: 101, // Devnet/Testnet
        address: '11111111111111111111111111111111', 
        decimals: 9,
    }
];

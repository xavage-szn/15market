const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function findPlaceBets() {
    const target = '0x2C2A74EA3c85f5Df6E5D9402540140f25d9fFa0d';
    const latest = await provider.getBlockNumber();

    // Filter by user
    const filter = contract.filters.BetPlaced(null, target);
    console.log(`Searching for BetPlaced events for ${target}...`);

    try {
        const events = await contract.queryFilter(filter, latest - 200000, latest);
        console.log(`Found ${events.length} BetPlaced events`);
        events.forEach(e => {
            console.log(`[Block ${e.blockNumber}] Amount: ${formatEther(e.args.amount)} USDC, ID: ${e.args.id}`);
            console.log(`Hash: ${e.transactionHash}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

findPlaceBets();

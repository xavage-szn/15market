const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function scanAllBets() {
    const start = 31400000;
    const end = 31403000;

    console.log(`Scanning for ALL BetPlaced events in range [${start}, ${end}]...`);

    try {
        const events = await contract.queryFilter("BetPlaced", start, end);
        console.log(`Found ${events.length} BetPlaced events`);
        events.forEach(e => {
            console.log(`[Block ${e.blockNumber}] BetID: ${e.args.id.toString()}, User: ${e.args.user}, Amount: ${formatEther(e.args.amount)} USDC`);
            console.log(`Hash: ${e.transactionHash}`);
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

scanAllBets();

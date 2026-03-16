const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function scanForLargeBets() {
    const latest = 31403000;
    const range = 5000;

    console.log(`Scanning for large BetPlaced events (> 10 USDC) in block 31307000...`);

    try {
        const events = await contract.queryFilter("BetPlaced", 31307000, 31308000);
        console.log(`Found ${events.length} BetPlaced events`);
        events.forEach(e => {
            const amt = parseFloat(formatEther(e.args.amount));
            console.log(`[Block ${e.blockNumber}] BetID: ${e.args.id.toString()}`);
            console.log(`  User: ${e.args.user}`);
            console.log(`  Amount: ${amt.toFixed(2)} USDC`);
            console.log(`  Duration: ${e.args.duration.toString()}s`);
            console.log(`  Dir: ${e.args.direction}`);
            console.log(`  Entry: ${e.args.entryPrice.toString()}`);
            console.log(`  Hash: ${e.transactionHash}`);
            console.log('---');
        });
    } catch (e) {
        console.error('Error:', e.message);
    }
}

scanForLargeBets();

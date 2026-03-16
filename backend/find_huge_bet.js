const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function findBet() {
    const betId = '1773604562832448';
    const latest = await provider.getBlockNumber();

    console.log(`Searching for BetID ${betId} in the last 10k blocks...`);

    try {
        const events = await contract.queryFilter("BetPlaced", latest - 10000, latest);
        const e = events.find(ev => ev.args.id.toString() === betId);
        if (e) {
            console.log(`Found! Block ${e.blockNumber}`);
            console.log(`  User: ${e.args.user}`);
            console.log(`  Amount: ${formatEther(e.args.amount)} USDC`);
            console.log(`  Hash: ${e.transactionHash}`);
        } else {
            console.log('Not found in last 10k blocks');
        }
    } catch (err) {
        console.error(err.message);
    }
}

findBet();

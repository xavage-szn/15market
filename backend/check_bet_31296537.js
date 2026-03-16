const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function checkBet() {
    const block = 31296537;
    const betId = '1773232514022211';

    console.log(`Checking bet ${betId} in block ${block}...`);

    try {
        const events = await contract.queryFilter("BetPlaced", block, block);
        const e = events.find(ev => ev.args.id.toString() === betId);
        if (e) {
            console.log(`User: ${e.args.user}`);
            console.log(`Amount: ${formatEther(e.args.amount)} USDC`);
            console.log(`Duration: ${e.args.duration.toString()}s`);
            console.log(`Direction: ${e.args.direction}`);
            console.log(`Price: ${e.args.entryPrice.toString()}`);
            console.log(`Time: ${new Date(Number(e.args.timestamp) * 1000).toISOString()}`);
            console.log(`Hash: ${e.transactionHash}`);
        } else {
            console.log('Not found in block logs');
        }
    } catch (err) {
        console.error(err.message);
    }
}

checkBet();

const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function scanOldEvents() {
    const start = 31900000;
    const range = 10000;

    for (let i = 0; i < 15; i++) {
        const from = start + (i * range);
        const to = from + range;
        console.log(`Scanning block ${from} to ${to}...`);

        try {
            const events = await contract.queryFilter("BetSettled", from, to);
            console.log(`Found ${events.length} BetSettled events`);
            events.forEach(e => {
                if (parseFloat(formatEther(e.args.payout)) > 1) { // Any significant payout
                    console.log(`Winner! User: ${e.args.user}, Payout: ${formatEther(e.args.payout)} USDC, Won: ${e.args.won}`);
                    console.log(`Hash: ${e.transactionHash}`);
                }
            });
        } catch (e) {
            console.log(`Error: ${e.message}`);
        }
    }
}

scanOldEvents();

const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function scanSettlements() {
    const start = 31400000;
    const end = 31600000;
    const range = 10000;

    console.log(`Scanning for ALL settlements between ${start} and ${end}...`);

    for (let i = 0; i < 20; i++) {
        const from = start + (i * range);
        const to = from + range;

        try {
            const events = await contract.queryFilter("BetSettled", from, to);
            events.forEach(e => {
                const payout = parseFloat(formatEther(e.args.payout));
                if (payout > 10) {
                    console.log(`[Block ${e.blockNumber}] BetID: ${e.args.id.toString()}, User: ${e.args.user}, Payout: ${payout.toFixed(2)} USDC`);
                    console.log(`Hash: ${e.transactionHash}`);
                }
            });
        } catch (e) { }
    }
}

scanSettlements();

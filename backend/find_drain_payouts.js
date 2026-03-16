const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function findTheDrain() {
    const start = 31400000;
    const end = 31600000;
    const chunk = 5000;

    console.log(`Scanning for the 6000 USDC drain between blocks ${start} and ${end}...`);

    for (let from = start; from < end; from += chunk) {
        const to = Math.min(from + chunk, end);
        try {
            const events = await contract.queryFilter("BetSettled", from, to);
            events.forEach(e => {
                const payout = parseFloat(formatEther(e.args.payout));
                if (payout > 10) { // Look for any significant payouts
                    console.log(`[Block ${e.blockNumber}] Payout: ${payout.toFixed(2)} USDC to ${e.args.user} (Won: ${e.args.won})`);
                    console.log(`Hash: ${e.transactionHash}`);
                }
            });
        } catch (e) {
            // console.log(`Error at ${from}: ${e.message}`);
        }
    }
}

findTheDrain();

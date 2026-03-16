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
    const range = 10000;

    console.log(`Scanning for large BetPlaced events (> 100 USDC) up to block ${latest}...`);

    // Scan 20 chunks back (~200k blocks)
    for (let i = 0; i < 20; i++) {
        const to = latest - (i * range);
        const from = to - range;

        try {
            const events = await contract.queryFilter("BetPlaced", from, to);
            events.forEach(e => {
                const amt = parseFloat(formatEther(e.args.amount));
                if (amt > 100) {
                    console.log(`[Block ${e.blockNumber}] BetID: ${e.args.id.toString()}, User: ${e.args.user}, Amount: ${amt.toFixed(2)} USDC`);
                    console.log(`Hash: ${e.transactionHash}`);
                }
            });
        } catch (e) {
            // console.log(`Error at ${from}: ${e.message}`);
        }
    }
}

scanForLargeBets();

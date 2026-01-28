const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = "https://rpc.quicknode.testnet.arc.network";
const CONTRACT_ADDRESS = "0x43f36AC1Fd85E2BC15e4ebB39BCB61d2619d23bB";

const ABI = ["event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp)"];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    let currentBlock = await provider.getBlockNumber();
    console.log("Current block:", currentBlock);

    const CHUNK_SIZE = 1000;
    const TOTAL_SCAN = 10000;

    for (let i = 0; i < TOTAL_SCAN; i += CHUNK_SIZE) {
        const from = currentBlock - i - CHUNK_SIZE;
        const to = currentBlock - i;
        console.log(`Checking blocks ${from} to ${to}...`);
        try {
            const events = await contract.queryFilter(contract.filters.BetPlaced(), from, to);
            if (events.length > 0) {
                console.log(`FOUND ${events.length} EVENTS!`);
                events.forEach(e => console.log(`ID: ${e.args.id}, User: ${e.args.user}`));
            }
        } catch (e) {
            console.error(`Error in chunk ${from}-${to}:`, e.message);
        }
    }
}

main().catch(console.error);

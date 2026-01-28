const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC || "https://rpc.quicknode.testnet.arc.network";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

const ABI = [
    "function nextBetId() view returns (uint256)",
    "event BetPlaced(uint256 indexed betId, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, provider);

    console.log("Searching for ALL BetPlaced events on", CONTRACT_ADDRESS);
    const nextId = await contract.nextBetId();
    console.log("Next Bet ID:", nextId.toString());

    // Search in chunks of 5000 blocks to avoid RPC limits
    const currentBlock = await provider.getBlockNumber();
    const startBlock = 20860000; // A bit before the current block I saw earlier

    // Actually, let's just go back 50000 blocks
    const fromBlock = currentBlock - 50000;

    console.log(`Querying from block ${fromBlock} to ${currentBlock}...`);
    const filter = contract.filters.BetPlaced();
    const events = await contract.queryFilter(filter, fromBlock, currentBlock);

    console.log(`Found ${events.length} events.`);
    events.forEach(e => {
        console.log(`Bet ID: ${e.args.betId}, User: ${e.args.user}, Time: ${new Date(Number(e.args.timestamp) * 1000).toLocaleString()}`);
    });
}

main().catch(console.error);

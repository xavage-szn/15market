
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const abi = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
];

async function scan() {
    const rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
    const provider = new ethers.JsonRpcProvider(rpc);
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS || "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
    const contract = new ethers.Contract(contractAddr, abi, provider);

    const currentBlock = await provider.getBlockNumber();
    console.log("Current Block:", currentBlock);

    // Scan only 10 blocks to be fast
    const filter = contract.filters.BetPlaced();
    try {
        const events = await contract.queryFilter(filter, currentBlock - 10, currentBlock);
        console.log(`Found ${events.length} BetPlaced events in last 10 blocks.`);
        for (const e of events) {
            console.log(`- Trade #${e.args.id} from ${e.args.user}`);
        }
    } catch (err) {
        console.error("Scan failed:", err.message);
    }
}

scan();

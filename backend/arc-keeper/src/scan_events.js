
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const abi = [
    "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
];

async function scan() {
    const rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
    const provider = new ethers.JsonRpcProvider(rpc);
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS || "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
    const contract = new ethers.Contract(contractAddr, abi, provider);

    console.log("Scanning last 100 blocks for BetSettled events...");
    const currentBlock = await provider.getBlockNumber();
    const filter = contract.filters.BetSettled();

    try {
        const events = await contract.queryFilter(filter, currentBlock - 100, currentBlock);
        console.log(`Found ${events.length} events.`);

        events.slice(-10).forEach(e => {
            const { id, user, settlementPrice, won, payout } = e.args;
            console.log(`- Bet #${id} | User: ${user} | Won: ${won} | Payout: ${ethers.formatUnits(payout, 18)} USDC | Hash: ${e.transactionHash}`);
        });
    } catch (err) {
        console.error("Scan failed:", err.message);
    }
}

scan();

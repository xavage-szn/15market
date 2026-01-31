const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.network";
const CONTRACT_ADDRESS = "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);

    console.log(`🔍 Checking recent activity for contract: ${CONTRACT_ADDRESS}`);

    // Get the latest block
    const latestBlock = await provider.getBlockNumber();
    console.log(`📦 Latest Block: ${latestBlock}`);

    // Check events
    const abi = ["event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

    const filter = contract.filters.BetSettled();
    const events = await contract.queryFilter(filter, latestBlock - 500); // Check last 500 blocks

    console.log(`📜 Found ${events.length} settlement events in last 500 blocks:`);
    events.forEach(event => {
        const { id, user, settlementPrice, won, payout } = event.args;
        console.log(`  - Bet ${id}: User ${user} | Won: ${won} | Payout: ${ethers.formatEther(payout)} USDC`);
        console.log(`    TX: ${event.transactionHash}`);
    });

}

main().catch(console.error);

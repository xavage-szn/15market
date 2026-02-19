const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function getSuccessfulBets() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
    ], provider);

    console.log("Fetching recent successful bets...");
    const filter = contract.filters.BetPlaced();
    const currentBlock = await provider.getBlockNumber();

    try {
        const events = await contract.queryFilter(filter, currentBlock - 5000, currentBlock);
        console.log(`Found ${events.length} successful bets.`);

        if (events.length > 0) {
            const last = events[events.length - 1];
            console.log("Last Successful Bet:");
            console.log(`  ID: ${last.args.id.toString()}`);
            console.log(`  Amount: ${ethers.formatEther(last.args.amount)}`);
            console.log(`  Direction: ${last.args.direction}`);
            console.log(`  Market ID: ${last.args.marketId}`);
        }
    } catch (e) {
        console.error("Error fetching events:", e.message);
    }
}

getSuccessfulBets();

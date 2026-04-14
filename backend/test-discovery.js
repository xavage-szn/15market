const { ethers } = require('ethers');
require('dotenv').config({ path: 'c:/Users/HP/Documents/15market/backend/.env' });

const ARC_RPC = process.env.ARC_RPC;
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const abi = [
        "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, provider);

    console.log("Fetching recent BetPlaced events...");
    const filter = contract.filters.BetPlaced();
    const events = await contract.queryFilter(filter, -1000); // last 1000 blocks

    console.log(`Found ${events.length} recent bets.`);

    for (let i = events.length - 1; i >= 0; i--) {
        const event = events[i];
        const betId = event.args.id;
        const bet = await contract.bets(betId);
        
        if (!bet.settled) {
            console.log(`--- Unsettled Bet Found ---`);
            console.log(`ID: ${betId.toString()}`);
            console.log(`User: ${bet.user}`);
            console.log(`Amount: ${ethers.formatEther(bet.amount)} ARC`);
            console.log(`Direction: ${bet.direction === 0 ? 'UP' : 'DOWN'}`);
            console.log(`Entry Price: ${bet.entryPrice.toString()}`);
            
            // We can try to settle this one!
            // But we need an exit price. Let's just use entry price + 100 for a test win/loss.
            return;
        }
    }
    console.log("No unsettled bets found in recent history.");
}

main().catch(console.error);

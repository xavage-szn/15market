const { ethers } = require('ethers');
require('dotenv').config();

const ARC_RPC = process.env.ARC_RPC || "https://rpc.quicknode.testnet.arc.network";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS;
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 direction, bool settled, bool userWon)",
    "function nextBetId() view returns (uint256)",
    "function settleBet(uint256 betId, int256 currentPrice) external",
    "event BetPlaced(uint256 indexed betId, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    console.log("--- Arc Exhaustive Check ---");
    const nextId = await contract.nextBetId();
    console.log("Next Bet ID (Count):", nextId.toString());

    // Check all bits up to nextId + 5 just in case
    for (let i = 0; i < Number(nextId) + 5; i++) {
        try {
            const bet = await contract.bets(i);
            if (bet.user === '0x0000000000000000000000000000000000000000') {
                if (i < Number(nextId)) console.log(`Bet ${i}: Empty/Not Found`);
                continue;
            }
            console.log(`\nBet ID: ${i}`);
            console.log(`  User: ${bet.user}`);
            console.log(`  Settled: ${bet.settled}`);
            if (!bet.settled) {
                const expiry = Number(bet.timestamp) + Number(bet.duration);
                console.log(`  Expiry: ${new Date(expiry * 1000).toLocaleString()}`);
                console.log(`  Direction: ${bet.direction === 1 ? "Bull" : "Bear"}`);

                const now = Math.floor(Date.now() / 1000);
                if (now > expiry) {
                    console.log("  >>> STUCK! Attempting resolution...");
                    const price = 96000 * 1000000;
                    const tx = await contract.settleBet(i, price);
                    console.log("  TX Sent:", tx.hash);
                    await tx.wait();
                    console.log("  RESOLVED.");
                } else {
                    console.log(`  PENDING (${expiry - now}s remaining)`);
                }
            }
        } catch (e) {
            if (i < Number(nextId)) console.log(`Bet ${i}: Error - ${e.message}`);
        }
    }

    console.log("\n--- Event Scrape ---");
    const filter = contract.filters.BetPlaced();
    const events = await contract.queryFilter(filter, -1000); // Last 1000 blocks
    console.log(`Found ${events.length} BetPlaced events in last 1000 blocks.`);
    events.forEach(e => {
        console.log(`Event ID: ${e.args.betId}, User: ${e.args.user}, Time: ${new Date(Number(e.args.timestamp) * 1000).toLocaleString()}`);
    });
}

main().catch(console.error);

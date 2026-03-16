const { JsonRpcProvider, Contract, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

const CONTRACT_ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';
const ABI = [
    "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
    "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
];

const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);

async function analyzeEvents() {
    try {
        const latestBlock = await provider.getBlockNumber();
        const startBlock = latestBlock - 50000; // Last 50k blocks

        console.log(`Analyzing events from block ${startBlock} to ${latestBlock}...`);

        const placedEvents = await contract.queryFilter("BetPlaced", startBlock, latestBlock);
        const settledEvents = await contract.queryFilter("BetSettled", startBlock, latestBlock);

        console.log(`Found ${placedEvents.length} BetPlaced events`);
        console.log(`Found ${settledEvents.length} BetSettled events`);

        const userWinnings = {};

        settledEvents.forEach(e => {
            const user = e.args.user;
            const payout = parseFloat(formatEther(e.args.payout));
            const won = e.args.won;

            if (!userWinnings[user]) {
                userWinnings[user] = { totalWon: 0, count: 0, wins: 0 };
            }

            userWinnings[user].totalWon += payout;
            userWinnings[user].count += 1;
            if (won) userWinnings[user].wins += 1;
        });

        const sortedUsers = Object.entries(userWinnings).sort((a, b) => b[1].totalWon - a[1].totalWon);

        console.log('\nTop Winners:');
        sortedUsers.forEach(([address, stats]) => {
            console.log(`${address}: ${stats.totalWon.toFixed(2)} USDC (${stats.wins}/${stats.count} wins)`);
        });

        // Also check BetPlaced to see total deposited
        let totalDeposited = 0;
        placedEvents.forEach(e => {
            totalDeposited += parseFloat(formatEther(e.args.amount));
        });
        console.log(`\nTotal Deposited in range: ${totalDeposited.toFixed(2)} USDC`);

    } catch (error) {
        console.error('Error analyzing events:', error);
    }
}

analyzeEvents();

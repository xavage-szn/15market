require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const { ethers } = require('ethers');

async function main() {
    const rpcUrl = `https://5042002.rpc.thirdweb.com/${process.env.THIRDWEB_CLIENT_ID}`;
    const fetchReq = new ethers.FetchRequest(rpcUrl);
    fetchReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
    
    const provider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
    
    const contractAddress = process.env.ARC_CONTRACT_ADDRESS;
    console.log("Contract Address:", contractAddress);
    
    // Check contract balance
    const balance = await provider.getBalance(contractAddress);
    console.log("Contract Native Balance:", ethers.formatEther(balance));

    const abi = [
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
        "function settleBet(uint256 _betId, uint256 _exitPrice) external",
        "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)"
    ];
    
    const contract = new ethers.Contract(contractAddress, abi, provider);
    
    // Get past BestPlaced events for user 0xdBB2F7c8C15FBA8088fc0439ff05F2Afe2598948
    const targetUser = "0xdBB2F7c8C15FBA8088fc0439ff05F2Afe2598948".toLowerCase();
    
    // Let's just find their latest bet that is not settled
    const currentBlock = await provider.getBlockNumber();
    console.log("Current block:", currentBlock);
    
    let allUserBets = [];
    // Go back 50k blocks, but in chunks of 1000
    for(let i = 0; i < 50; i++) {
        let toBlock = currentBlock - (i * 1000);
        let fromBlock = toBlock - 999;
        try {
            console.log(`Scanning ${fromBlock} to ${toBlock}...`);
            const events = await contract.queryFilter("BetPlaced", fromBlock, toBlock);
            const chunkUserBets = events.filter(e => e.args.user.toLowerCase() === targetUser);
            if (chunkUserBets.length > 0) {
                allUserBets.push(...chunkUserBets);
            }
        } catch(e) {
            console.log("Chunk error:", e.message);
        }
    }
    
    console.log(`Found ${allUserBets.length} Bets in last 50k blocks for user`);
    
    for (const e of allUserBets) {
        const betId = e.args.id;
        const betData = await contract.bets(betId);
        
        if (!betData.settled) {
            console.log(`Found UNSETTLED bet: ID ${betId}, Amount: ${ethers.formatEther(betData.amount)}, Direction: ${betData.direction}, Entry: ${betData.entryPrice}`);
            
            // What if we try to simulate settlement? Let's simulate a winning scenario.
            // If direction is 1 (UP), set exit > entry. If 0 (DOWN), set exit < entry.
            const exitPrice = betData.direction === 1n ? betData.entryPrice + 100n : betData.entryPrice - 100n;
            
            console.log(`Simulating settleBet(${betId}, ${exitPrice}) (Winning)...`);
            const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
            const contractWithSigner = contract.connect(wallet);
            
            try {
                await contractWithSigner.settleBet.staticCall(betId, exitPrice);
                console.log("Simulation successful. No revert!");
                
                // execute
                console.log("Executing transaction...");
                const tx = await contractWithSigner.settleBet(betId, exitPrice);
                console.log("Tx Hash:", tx.hash);
                await tx.wait();
                console.log("Tx Mined!");

            } catch (err) {
                console.log("Simulation Failed:", err.reason || err.message);
            }
        }
    }
}
main().catch(console.error);

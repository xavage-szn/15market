const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const BET_ID = "1771379933394";

async function checkBet() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
    ], provider);

    console.log(`Checking Bet ID: ${BET_ID}`);
    try {
        const bet = await contract.bets(BET_ID);
        console.log("Bet Details:");
        console.log(`  User: ${bet.user}`);
        console.log(`  Amount: ${ethers.formatEther(bet.amount)}`);
        console.log(`  Settled: ${bet.settled}`);

        if (bet.user !== "0x0000000000000000000000000000000000000000") {
            console.log("❌ ROOT CAUSE: Bet ID already exists!");
        } else {
            console.log("✅ Bet ID is empty.");
        }
    } catch (e) {
        console.error("Error checking bet:", e.message);
    }
}

checkBet();

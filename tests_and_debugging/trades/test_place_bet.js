const { ethers } = require('ethers');

const ARC_RPC = "https://5042002.rpc.thirdweb.com";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
if (!PRIVATE_KEY) {
  console.error('PRIVATE_KEY env var is required (no hardcoded key in the repo). Set it before running this script.');
  process.exit(1);
}

async function testPlaceBet() {
    console.log("Starting test bet placement...");
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, [
        "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
    ], wallet);

    const betId = Date.now() * 1000 + Math.floor(Math.random() * 1000000);
    const direction = 1;
    const duration = 15;
    const entryPrice = 2500000000n; // $25 (Example)
    const marketId = 5; // SOL
    const amount = ethers.parseEther("0.0001");

    console.log(`Placing bet ID: ${betId}...`);
    try {
        const tx = await contract.placeBet(betId, direction, duration, entryPrice, marketId, wallet.address, {
            value: amount,
            gasLimit: 600000
        });
        console.log("Transaction sent:", tx.hash);
        const receipt = await tx.wait();
        console.log("Transaction confirmed in block:", receipt.blockNumber);
        console.log("Gas Used:", receipt.gasUsed.toString());
        if (receipt.status === 1) {
            console.log("✅ Bet placed successfully!");
        } else {
            console.log("❌ Transaction reverted!");
        }
    } catch (e) {
        console.error("❌ FAILED:", e.message);
        if (e.data) console.log("Revert Data:", e.data);
    }
}

testPlaceBet();

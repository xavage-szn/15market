const { ethers } = require("ethers");
const { ARC_RPC, ARC_PK, ARC_CONTRACT } = require("./config");
const fs = require("fs");
const path = require("path");

// Load ABI from frontend (shared)
const abiPath = path.resolve(__dirname, "../../15market-ui/src/abi/ArcPrediction.json");
const abiRaw = JSON.parse(fs.readFileSync(abiPath, "utf8"));
const ABI = abiRaw.abi;

const provider = new ethers.JsonRpcProvider(ARC_RPC);

async function settleArcBet(betId, betInfo, currentPrice) {
    if (!ARC_PK) {
        console.warn("[ARC_SETTLER] ⚠️ No PRIVATE_KEY found, skipping Arc settlement.");
        return { success: false, error: "Missing PK" };
    }

    const wallet = new ethers.Wallet(ARC_PK, provider);
    const contract = new ethers.Contract(ARC_CONTRACT, ABI, wallet);

    console.log(`[ARC_SETTLER] Settling Arc bet ${betId} | Price: ${currentPrice}`);

    try {
        // Contract expects prices in 8 decimals (standard for Pyth-like feeds)
        // Entry price in contract is also likely 8 decimals.
        // Current price from arbiter is normal float, convert to 8 decimals.
        const priceBN = BigInt(Math.floor(currentPrice * 100000000));

        const userWon = (betInfo.direction === 1)
            ? (currentPrice >= betInfo.entryPrice)
            : (currentPrice <= betInfo.entryPrice);

        // Call settleBet(uint256 _betId, uint256 _exitPrice)
        const tx = await contract.settleBet(betId, priceBN);
        console.log(`[ARC_SETTLER] 🚀 TX Broadcasted: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`[ARC_SETTLER] ✅ Confirmed in block ${receipt.blockNumber}`);

        return { success: true, tx: tx.hash, userWon };
    } catch (e) {
        console.error(`[ARC_SETTING] ❌ Error settling Arc bet ${betId}:`, e.message);
        if (e.message.includes("already settled")) {
            return { success: true, info: "Already settled", userWon: true }; // Assume win for cleanup logs
        }
        return { success: false, error: e.message };
    }
}

module.exports = { settleArcBet };

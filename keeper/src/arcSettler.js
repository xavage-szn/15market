const { ethers } = require("ethers");
const { ARC_RPC_LIST, ARC_PK, ARC_CONTRACT } = require("./config");
const fs = require("fs");
const path = require("path");

// Load ABI from local folder (ensures safety in production deployments)
const abiPath = path.resolve(__dirname, "./abi/ArcPrediction.json");
const abiRaw = JSON.parse(fs.readFileSync(abiPath, "utf8"));
const ABI = abiRaw.abi;

async function settleArcBet(betId, betInfo, currentPrice) {
    if (!ARC_PK) {
        console.warn("[ARC_SETTLER] ⚠️ No PRIVATE_KEY found, skipping Arc settlement.");
        return { success: false, error: "Missing PK" };
    }

    let lastError = null;
    for (const rpcUrl of ARC_RPC_LIST) {
        try {
            console.log(`[ARC_SETTLER] 🔄 Attempting settlement via RPC: ${rpcUrl.slice(0, 40)}...`);
            const provider = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true });
            const wallet = new ethers.Wallet(ARC_PK, provider);
            const contract = new ethers.Contract(ARC_CONTRACT, ABI, wallet);

            console.log(`[ARC_SETTLER] Settling Arc bet ${betId} | Price: ${currentPrice}`);

            // Contract expects prices in 8 decimals
            const priceBN = BigInt(Math.floor(currentPrice * 100000000));

            const userWon = (betInfo.direction === 1)
                ? (currentPrice > betInfo.entryPrice)
                : (currentPrice < betInfo.entryPrice);

            // Call settleBet(uint256 _betId, uint256 _exitPrice) with timeout
            const txPromise = contract.settleBet(betId, priceBN);
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error("RPC_TIMEOUT")), 15000)
            );

            const tx = await Promise.race([txPromise, timeoutPromise]);
            console.log(`[ARC_SETTLER] 🚀 TX Broadcasted: ${tx.hash}`);

            const receipt = await tx.wait();
            console.log(`[ARC_SETTLER] ✅ Confirmed in block ${receipt.blockNumber}`);

            return { success: true, tx: tx.hash, userWon };
        } catch (e) {
            lastError = e.message;
            console.error(`[ARC_SETTING] ❌ RPC Error (${rpcUrl.slice(0, 30)}...):`, e.message);

            if (e.message.includes("already settled")) {
                const userWon = (betInfo.direction === 1)
                    ? (currentPrice > betInfo.entryPrice)
                    : (currentPrice < betInfo.entryPrice);
                return { success: true, info: "Already settled", userWon };
            }
            // Continue to next RPC
        }
    }

    return { success: false, error: `All RPCs failed. Last error: ${lastError}` };
}

module.exports = { settleArcBet };

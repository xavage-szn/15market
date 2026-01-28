require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');

const ARC_RPC = process.env.ARC_RPC || "https://rpc.quicknode.testnet.arc.network";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS || "0x43f36AC1Fd85E2BC15e4ebB39BCB61d2619d23bB";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

// V1 ABI (No marketId)
const ABI_V1 = [
    "function nextBetId() view returns (uint256)",
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint256 settlementPrice, bool settled, bool won)"
];

const ABI_V2 = [
    "function nextBetId() view returns (uint256)",
    "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`\nTesting Contract: ${CONTRACT_ADDRESS}`);

    const contractV1 = new ethers.Contract(CONTRACT_ADDRESS, ABI_V1, provider);
    const contractV2 = new ethers.Contract(CONTRACT_ADDRESS, ABI_V2, provider);

    try {
        const nextId = await contractV2.nextBetId();
        console.log(`NextBetId: ${nextId}`);
        const total = Number(nextId);

        if (total > 0) {
            console.log("Attempting V2 Read (with marketId)...");
            try {
                const b = await contractV2.bets(total - 1);
                console.log("SUCCESS: V2 Read Worked. MarketId:", b.marketId);
            } catch (e) {
                console.log("FAIL: V2 Read Failed.");

                console.log("Attempting V1 Read (NO marketId)...");
                const b1 = await contractV1.bets(total - 1);
                console.log("SUCCESS: V1 Read Worked.");
                console.log("Bet:", b1);
            }
        } else {
            console.log("No bets to check structure.");
        }

    } catch (e) {
        console.error("Error accessing contract:", e.message);
    }
}

main().catch(console.error);

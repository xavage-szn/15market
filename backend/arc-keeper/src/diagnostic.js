
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

async function diagnose() {
    const rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
    const provider = new ethers.JsonRpcProvider(rpc);

    const contractAddr = process.env.ARC_CONTRACT_ADDRESS || "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
    const keeperKey = process.env.PRIVATE_KEY;

    if (!keeperKey) {
        console.error("❌ PRIVATE_KEY is not defined in .env");
        return;
    }

    const wallet = new ethers.Wallet(keeperKey, provider);
    console.log("--- Arc Keeper Diagnostic ---");
    console.log("RPC:", rpc);
    console.log("Contract Address:", contractAddr);
    console.log("Keeper Address:", wallet.address);

    try {
        const keeperBal = await provider.getBalance(wallet.address);
        console.log("Keeper Balance:", ethers.formatUnits(keeperBal, 18), "ARC");

        const contractBal = await provider.getBalance(contractAddr);
        console.log("Contract Balance:", ethers.formatUnits(contractBal, 18), "ARC");

        if (parseFloat(ethers.formatUnits(contractBal, 18)) < 1.0) {
            console.warn("⚠️  CONTRACT BALANCE IS TOO LOW FOR PAYOUTS!");
        }

    } catch (err) {
        console.error("❌ Diagnostic failed:", err.message);
    }
}

diagnose();

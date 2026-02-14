
const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env') });

const abi = [
    "function owner() view returns (address)"
];

async function checkOwner() {
    const rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
    const provider = new ethers.JsonRpcProvider(rpc);
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS || "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
    const contract = new ethers.Contract(contractAddr, abi, provider);

    try {
        const owner = await contract.owner();
        console.log("Contract Address:", contractAddr);
        console.log("Contract Owner:", owner);

        const keeperKey = process.env.PRIVATE_KEY;
        if (keeperKey) {
            const wallet = new ethers.Wallet(keeperKey);
            console.log("Keeper Address  :", wallet.address);
            if (owner.toLowerCase() === wallet.address.toLowerCase()) {
                console.log("✅ Keeper IS the owner.");
            } else {
                console.log("❌ Keeper IS NOT the owner. settleBet will fail!");
            }
        }
    } catch (err) {
        console.error("Check failed:", err.message);
    }
}

checkOwner();

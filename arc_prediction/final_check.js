require('dotenv').config();
const { ethers } = require('ethers');

const ARC_RPC = "https://rpc.testnet.arc.network";
const CONTRACT_ADDRESS = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";

async function check() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const balance = await provider.getBalance(CONTRACT_ADDRESS);
    const code = await provider.getCode(CONTRACT_ADDRESS);

    console.log("Contract Address:", CONTRACT_ADDRESS);
    console.log("Balance (Wei):", balance.toString());
    console.log("Balance (ETH/18):", ethers.formatUnits(balance, 18));
    console.log("Balance (6 Dec):", ethers.formatUnits(balance, 6));
    console.log("Code Length:", code.length);

    const ownerABI = ["function owner() view returns (address)"];
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ownerABI, provider);
    try {
        const owner = await contract.owner();
        console.log("Owner:", owner);
    } catch (e) {
        console.log("Owner call failed:", e.message);
    }
}

check();

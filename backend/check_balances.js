const { ethers } = require('ethers');
require('dotenv').config();
async function main() {
    const provider = new ethers.JsonRpcProvider("https://rpc.testnet.arc.network");
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS;
    const balance = await provider.getBalance(contractAddr);
    const keeperBalance = await provider.getBalance(new ethers.Wallet(process.env.PRIVATE_KEY).address);
    console.log(`CONTRACT_BAL=${ethers.formatEther(balance)} KEEPER_BAL=${ethers.formatEther(keeperBalance)}`);
}
main().catch(console.error);

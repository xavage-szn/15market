const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

async function main() {
    const provider = new ethers.JsonRpcProvider("https://5042002.rpc.thirdweb.com");
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS;

    try {
        const balance = await provider.getBalance(contractAddr);
        const wallet = new ethers.Wallet(process.env.PRIVATE_KEY);
        const keeperBalance = await provider.getBalance(wallet.address);

        console.log(`CONTRACT_ADDR=${contractAddr}`);
        console.log(`KEEPER_ADDR=${wallet.address}`);
        console.log(`CONTRACT_BAL=${ethers.formatEther(balance)} USDC`);
        console.log(`KEEPER_BAL=${ethers.formatEther(keeperBalance)} USDC`);

        const network = await provider.getNetwork();
        console.log(`NET_CHAIN_ID=${network.chainId}`);
    } catch (e) {
        console.error("Error:", e.message);
    }
}
main().catch(console.error);

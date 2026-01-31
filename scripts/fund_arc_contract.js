const { ethers } = require("ethers");
require("dotenv").config();

const ARC_RPC = "https://rpc.testnet.arc.network";
const CONTRACT_ADDRESS = "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    // Check contract balance
    const contractBalance = await provider.getBalance(CONTRACT_ADDRESS);
    console.log(`📊 Contract Balance: ${ethers.formatEther(contractBalance)} ARC`);

    // Check wallet balance
    const walletBalance = await provider.getBalance(wallet.address);
    console.log(`💰 Wallet Balance: ${ethers.formatEther(walletBalance)} ARC`);

    if (contractBalance < ethers.parseEther("1")) {
        console.log("\n⚠️  Contract balance is low. Funding with 10 ARC...");

        const tx = await wallet.sendTransaction({
            to: CONTRACT_ADDRESS,
            value: ethers.parseEther("10")
        });

        console.log(`📤 TX sent: ${tx.hash}`);
        await tx.wait();
        console.log(`✅ Contract funded successfully!`);

        const newBalance = await provider.getBalance(CONTRACT_ADDRESS);
        console.log(`📊 New Contract Balance: ${ethers.formatEther(newBalance)} ARC`);
    } else {
        console.log("\n✅ Contract has sufficient balance.");
    }
}

main().catch(console.error);

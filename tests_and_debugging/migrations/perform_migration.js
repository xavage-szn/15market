const { ethers } = require("ethers");
require("dotenv").config();

// Configuration
const ARC_RPC = "https://5042002.rpc.thirdweb.com"; // Use the one we know works
const OLD_CONTRACT = "0xd8F519179d16Fb4B791Cd12eF027bD29ABeBC71e";
const NEW_CONTRACT = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
const PRIVATE_KEY = process.env.PRIVATE_KEY;

const ABI = [
    "function withdraw(uint256 amount) external",
    "function owner() view returns (address)"
];

async function main() {
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

    console.log(`🚀 ARC TREASURY MIGRATION`);
    console.log(`--------------------------`);
    console.log(`SOURCE (Old): ${OLD_CONTRACT}`);
    console.log(`TARGET (New): ${NEW_CONTRACT}`);
    console.log(`WALLET      : ${wallet.address}`);

    try {
        // 1. Check Balances
        const oldBal = await provider.getBalance(OLD_CONTRACT);
        console.log(`\n📊 Old Treasury Balance: ${ethers.formatUnits(oldBal, 18)} ARC`);

        const newBal = await provider.getBalance(NEW_CONTRACT);
        console.log(`📊 New Treasury Balance: ${ethers.formatUnits(newBal, 18)} ARC`);

        if (oldBal === 0n) {
            console.log("\n❌ No funds found in the old treasury. Migration aborted.");
            return;
        }

        // 2. Withdraw from Old Contract
        const contract = new ethers.Contract(OLD_CONTRACT, ABI, wallet);
        console.log(`\n🔓 Withdrawing all funds from old treasury...`);

        // Use a 2% buffer/rounding room if needed, but contract should allow exact amount
        const tx1 = await contract.withdraw(oldBal);
        console.log(`📤 Withdrawal TX Sent: ${tx1.hash}`);
        await tx1.wait();
        console.log(`✅ Withdrawal confirmed.`);

        // 3. Check Wallet Balance
        const walletBal = await provider.getBalance(wallet.address);
        console.log(`💰 Current Wallet Balance: ${ethers.formatUnits(walletBal, 18)} ARC`);

        // 4. Deposit to New Treasury
        // We'll move the exactly withdrawn amount to be precise
        console.log(`\n📥 Depositing ${ethers.formatUnits(oldBal, 18)} ARC to new treasury...`);
        const tx2 = await wallet.sendTransaction({
            to: NEW_CONTRACT,
            value: oldBal
        });
        console.log(`📤 Deposit TX Sent: ${tx2.hash}`);
        await tx2.wait();
        console.log(`✅ Deposit confirmed.`);

        // 5. Final Verification
        const finalNewBal = await provider.getBalance(NEW_CONTRACT);
        console.log(`\n🎉 MIGRATION COMPLETE!`);
        console.log(`📊 New Treasury Final Balance: ${ethers.formatUnits(finalNewBal, 18)} ARC`);

    } catch (err) {
        console.error("\n❌ MIGRATION FAILED:");
        console.error(err.message);
        if (err.data) console.error("Error data:", err.data);
    }
}

main();

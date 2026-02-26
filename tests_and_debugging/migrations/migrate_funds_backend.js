const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpc = process.env.ARC_RPC;
    const pk = process.env.PRIVATE_KEY;
    const oldContractAddress = "0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8";
    const newContractAddress = process.env.ARC_CONTRACT_ADDRESS;

    if (!pk) {
        console.error("Missing PRIVATE_KEY in .env");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);

    console.log(`Using Wallet: ${wallet.address}`);
    console.log(`OLD Contract: ${oldContractAddress}`);
    console.log(`NEW Contract: ${newContractAddress}`);

    // Check old contract balance
    const oldBalance = await provider.getBalance(oldContractAddress);
    console.log(`OLD Contract Balance: ${ethers.formatEther(oldBalance)} ARC`);

    if (oldBalance === 0n) {
        console.log("OLD contract has 0 funds.");
        return;
    }

    // Since contracts don't typically have a generic "send funds" function unless implemented,
    // we need to check if we can withdraw from the old contract.
    // The ArcPrediction contract has a 'withdraw' function for owner!

    const owner = await wallet.getAddress();
    // Assuming the wallet IS the owner
    const contract = new ethers.Contract(oldContractAddress, [
        "function withdraw(uint256 _amount) external",
        "function owner() view returns (address)"
    ], wallet);

    try {
        const contractOwner = await contract.owner();
        console.log(`Contract Owner: ${contractOwner}`);

        if (contractOwner.toLowerCase() !== owner.toLowerCase()) {
            console.error("Wallet is NOT the owner of the old contract. Cannot withdraw.");
            return;
        }

        console.log("Withdrawing from OLD contract...");
        // Withdraw everything to owner wallet first
        const tx = await contract.withdraw(oldBalance);
        console.log(`Withdraw Tx: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Withdraw successful!");

        // Now send to new contract
        console.log(`Sending ${ethers.formatEther(oldBalance)} ARC to NEW contract...`);
        const tx2 = await wallet.sendTransaction({
            to: newContractAddress,
            value: oldBalance
        });
        console.log(`Transfer Tx: ${tx2.hash}`);
        await tx2.wait();
        console.log("✅ Funds transferred to new contract!");

    } catch (e) {
        console.error("Migration failed:", e);
    }
}

main();

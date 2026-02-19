const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const rpc = process.env.ARC_RPC;
    const pk = process.env.PRIVATE_KEY;
    const contractAddress = process.env.ARC_CONTRACT_ADDRESS;

    if (!pk || !contractAddress) {
        console.error("Missing PRIVATE_KEY or ARC_CONTRACT_ADDRESS in .env");
        process.exit(1);
    }

    const provider = new ethers.JsonRpcProvider(rpc);
    const wallet = new ethers.Wallet(pk, provider);

    console.log(`Using Wallet: ${wallet.address}`);
    console.log(`Target Contract: ${contractAddress}`);

    // Get Balance
    const balance = await provider.getBalance(wallet.address);
    console.log(`Wallet Balance: ${ethers.formatEther(balance)} ARC`);

    if (balance === 0n) {
        console.error("Wallet has 0 balance.");
        return;
    }

    // Leave minimal amount for gas (e.g. 0.05 ARC)
    const reserve = ethers.parseEther("0.05");
    if (balance <= reserve) {
        console.error("Balance too low to fund and pay gas.");
        return;
    }

    const amountToSend = balance - reserve;
    console.log(`Transferring ALL funds (${ethers.formatEther(amountToSend)} ARC) to contract...`);

    try {
        const tx = await wallet.sendTransaction({
            to: contractAddress,
            value: amountToSend,
            gasLimit: 21000 // Standard transfer gas
        });

        console.log(`Tx Sent: ${tx.hash}`);
        await tx.wait();
        console.log("✅ Fund Transfer Complete!");

        const newContractBal = await provider.getBalance(contractAddress);
        console.log(`New Contract Balance: ${ethers.formatEther(newContractBal)} ARC`);

    } catch (e) {
        console.error("Transfer failed:", e);
    }
}

main();

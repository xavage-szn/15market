const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const network = ethers.Network.from(5042002);
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC, network, {
        staticNetwork: true,
        batchMaxCount: 1
    });

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    const arcContractAddr = process.env.ARC_CONTRACT_ADDRESS;
    const arcRoundsAddr = process.env.ROUNDS_CONTRACT_ADDRESS;

    try {
        const keeperBal = await provider.getBalance(wallet.address);
        const arcBal = await provider.getBalance(arcContractAddr);
        const roundsBal = await provider.getBalance(arcRoundsAddr);

        console.log(`Keeper Wallet: ${ethers.formatEther(keeperBal)} USDC`);
        console.log(`ARC Contract Treasury (${arcContractAddr}): ${ethers.formatEther(arcBal)} USDC`);
        console.log(`Rounds Treasury (${arcRoundsAddr}): ${ethers.formatEther(roundsBal)} USDC`);
    } catch (e) {
        console.error("Error:", e);
    }
}

main();

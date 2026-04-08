const { ethers } = require("ethers");
require("dotenv").config();

async function main() {
    const network = ethers.Network.from(5042002);
    // Use ThirdWeb RPC due to Arc official timeout
    const rpcUrl = "https://5042002.rpc.thirdweb.com";
    const provider = new ethers.JsonRpcProvider(rpcUrl, network, {
        staticNetwork: true,
        batchMaxCount: 1
    });

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const arcContractAddr = process.env.ARC_CONTRACT_ADDRESS;
    const recipient = "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C";
    const amount = ethers.parseEther("200"); // 200 USDC (18 decimals for native token in ARC Testnet)

    const abi = ["function withdraw(uint256 _amount) external"];
    const contract = new ethers.Contract(arcContractAddr, abi, wallet);

    console.log("1. Withdrawing 200 USDC from Contract Treasury...");
    const tx1 = await contract.withdraw(amount);
    console.log(`Withdrawal TX Sent: ${tx1.hash}`);
    await tx1.wait();
    console.log("Withdrawal successfully verified on chain!");

    console.log(`2. Sending 200 USDC to ${recipient}...`);
    const tx2 = await wallet.sendTransaction({
        to: recipient,
        value: amount
    });
    console.log(`Transfer TX Sent: ${tx2.hash}`);
    await tx2.wait();
    console.log("Transfer successfully verified on chain!");
    
    console.log("Done.");
}

main().catch(console.error);

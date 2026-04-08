const { ethers } = require("ethers");
require("dotenv").config();
const { deriveUserWallet } = require("./src/services/walletDerivation");

async function main() {
    const network = ethers.Network.from(5042002);
    const provider = new ethers.JsonRpcProvider("https://5042002.rpc.thirdweb.com", network, {
        staticNetwork: true,
        batchMaxCount: 1
    });

    const userAddr = "0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C";
    const { wallet, address } = deriveUserWallet(userAddr);
    console.log("Session Wallet:", address);

    const connectedWallet = wallet.connect(provider);
    const balance = await provider.getBalance(address);
    console.log("Balance:", ethers.formatEther(balance));

    if (balance === 0n) {
        console.log("Need to fund the session wallet first.");
        // Fund it using main wallet
        const mainWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
        const tx = await mainWallet.sendTransaction({
            to: address,
            value: ethers.parseEther("0.1")
        });
        await tx.wait();
        console.log("Funded session wallet with 0.1 ARC.");
    }

    const abi = [
        "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable"
    ];
    const contract = new ethers.Contract(process.env.ARC_CONTRACT_ADDRESS, abi, connectedWallet);

    const id = Math.floor(Math.random() * 1000000);
    const amtWei = ethers.parseEther("0.001");
    const entryVal = BigInt(Math.floor(95000 * 1e8));

    try {
        console.log(`Placing bet: ID ${id}`);
        const txArgs = [
            BigInt(id),
            1, // UP
            15, // 15s
            entryVal,
            1, // marketId
            userAddr
        ];
        
        const tx = await contract.placeBet(...txArgs, {
            value: amtWei,
            gasLimit: 500000
        });
        console.log("TX Hash:", tx.hash);
        console.log("Done without waiting for receipt!");
    } catch (e) {
        console.error("Revert error:", e);
    }
}

main();

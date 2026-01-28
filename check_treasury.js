const { ethers } = require('ethers');

async function checkBalance() {
    const ARC_RPC = "https://rpc.testnet.arc.network";
    const ARC_CONTRACT = "0x041e80256b3C72a0e16d78753F28f14A40d78c08";
    const provider = new ethers.JsonRpcProvider(ARC_RPC);
    try {
        const bal = await provider.getBalance(ARC_CONTRACT);
        console.log(`Arc Treasury Balance: ${ethers.formatEther(bal)} USDC`);
    } catch (e) {
        console.error("Failed to fetch balance:", e.message);
    }
}

checkBalance();

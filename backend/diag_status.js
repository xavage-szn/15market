const { ethers } = require('ethers');
require('dotenv').config();

const rpcs = [
    "https://rpc.testnet.arc.network",
    "https://arc-testnet.alt.technology",
    "https://arc-testnet.drpc.org",
    "https://rpc.drpc.testnet.arc.network"
];

async function checkStatus() {
    console.log('--- 15Market Health Check ---');
    const contractAddr = process.env.ARC_CONTRACT_ADDRESS;
    const pk = process.env.PRIVATE_KEY;
    
    for (const rpc of rpcs) {
        try {
            console.log(`Trying RPC: ${rpc}...`);
            const provider = new ethers.JsonRpcProvider(rpc, null, { staticNetwork: true });
            
            // 3s timeout for the check
            const block = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
            ]);

            const wallet = new ethers.Wallet(pk, provider);
            const contractBal = await provider.getBalance(contractAddr);
            const walletBal = await provider.getBalance(wallet.address);

            console.log(`[SUCCESS] Connected to ${rpc} (Block: ${block})`);
            console.log(`Contract (${contractAddr}): ${ethers.formatEther(contractBal)} USDC/ARC`);
            console.log(`Keeper Wallet (${wallet.address}): ${ethers.formatEther(walletBal)} USDC/ARC`);
            return;
        } catch (e) {
            console.warn(`[FAILED] ${rpc}: ${e.message}`);
        }
    }
    console.error("All RPCs failed.");
}

checkStatus();

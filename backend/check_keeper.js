const { ethers } = require('ethers');
require('dotenv').config();

async function checkKeeper() {
    const RPC_ENDPOINTS = [
        "https://rpc.testnet.arc.network",
        "https://5042002.rpc.thirdweb.com",
        "https://rpc-test-1.arc.market",
        "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
    ];

    let provider;
    for (const rpc of RPC_ENDPOINTS) {
        try {
            console.log(`Trying RPC: ${rpc}`);
            provider = new ethers.JsonRpcProvider(rpc, null, { staticNetwork: true });
            await provider.getBlockNumber();
            console.log(`Connected to ${rpc}`);
            break;
        } catch (e) {
            console.log(`Failed to connect to ${rpc}: ${e.message}`);
        }
    }

    if (!provider) {
        console.error("All RPCs failed");
        process.exit(1);
    }

    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`Keeper Address: ${wallet.address}`);
    const balance = await provider.getBalance(wallet.address);
    console.log(`Keeper Balance: ${ethers.formatEther(balance)} USDC/Native`);

    const nonce = await provider.getTransactionCount(wallet.address);
    console.log(`Next Nonce: ${nonce}`);

    const contractAddress = process.env.ARC_CONTRACT_ADDRESS;
    console.log(`Contract Address: ${contractAddress}`);
    const contractBalance = await provider.getBalance(contractAddress);
    console.log(`Contract Balance: ${ethers.formatEther(contractBalance)} USDC/Native`);

    process.exit(0);
}

checkKeeper().catch(err => {
    console.error(err);
    process.exit(1);
});

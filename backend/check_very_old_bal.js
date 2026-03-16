const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);
const ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function checkOldBalance() {
    const latest = await provider.getBlockNumber();
    const blocksBack = (latest - 30000000); // 30M is a safe old block

    // We'll jump in 1M block increments
    for (let b = 32000000; b >= 30000000; b -= 200000) {
        try {
            const bal = await provider.getBalance(ADDRESS, b);
            const block = await provider.getBlock(b);
            if (block) {
                console.log(`Block ${b} (${new Date(block.timestamp * 1000).toISOString()}): ${formatEther(bal)} USDC`);
            }
        } catch (e) {
            // console.log(`Block ${b} pruned`);
        }
    }
}

checkOldBalance();

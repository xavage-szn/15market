const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);
const ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function traceHistory() {
    const latest = await provider.getBlockNumber();
    const blocksPerDay = 24 * 60 * 60 / 2; // Assuming 2s block time
    const daysToCheck = 7;

    console.log(`Current Block: ${latest}`);

    for (let i = 0; i <= daysToCheck * 2; i++) {
        const block = latest - Math.floor(i * blocksPerDay / 2);
        if (block < 0) break;

        try {
            const bal = await provider.getBalance(ADDRESS, block);
            const time = (await provider.getBlock(block)).timestamp;
            console.log(`Block ${block} (${new Date(time * 1000).toISOString()}): ${formatEther(bal)} USDC`);
        } catch (e) {
            console.log(`Block ${block}: Error fetching balance`);
        }
    }
}

traceHistory();

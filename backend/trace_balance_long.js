const { JsonRpcProvider, formatEther } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);
const ADDRESS = '0x345014899b42bF9034D9475760609e64B1433A6a';

async function traceHistory() {
    const latest = await provider.getBlockNumber();
    const blocksPerDay = 43200; // 2s blocks

    console.log(`Current Block: ${latest}`);

    for (let day = 1; day <= 10; day++) {
        const block = latest - (day * blocksPerDay);
        if (block < 0) break;

        try {
            const bal = await provider.getBalance(ADDRESS, block);
            const b = await provider.getBlock(block);
            if (!b) {
                console.log(`Block ${block}: Not found`);
                continue;
            }
            const time = b.timestamp;
            console.log(`Block ${block} (${new Date(time * 1000).toISOString()}): ${formatEther(bal)} USDC`);
        } catch (e) {
            console.log(`Block ${block}: Error fetching balance: ${e.message}`);
        }
    }
}

traceHistory();

const { JsonRpcProvider } = require('ethers');

const RPC = 'https://rpc.testnet.arc.network';
const provider = new JsonRpcProvider(RPC);

async function scanBlocks() {
    for (let b = 31402160; b <= 31402170; b++) {
        console.log(`Block ${b}:`);
        try {
            const block = await provider.getBlock(b, true); // true to get full tx objects
            if (!block) continue;
            console.log(`  Txs: ${block.transactions.length}`);
            for (const tx of block.transactions) {
                if (tx.to && tx.to.toLowerCase() === '0x345014899b42bf9034d9475760609e64b1433a6a'.toLowerCase()) {
                    console.log(`    To Contract: ${tx.hash}`);
                    console.log(`    Value: ${tx.value.toString()}`);
                    console.log(`    From: ${tx.from}`);
                    console.log(`    Data: ${tx.data.slice(0, 10)}...`);
                }
            }
        } catch (e) {
            console.log(`    Error: ${e.message}`);
        }
    }
}

scanBlocks();

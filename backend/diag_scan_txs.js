const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

async function scan() {
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    const currentBlock = await blockchain.provider.getBlockNumber();
    const startBlock = currentBlock - 1000; // Scan last 1000 blocks
    
    console.log(`Scanning last 1000 blocks for txs from ${userAddr}...`);
    
    for (let i = currentBlock; i >= startBlock; i--) {
        const block = await blockchain.provider.getBlock(i, true);
        if (!block) continue;
        for (const tx of block.prefetchedTransactions) {
            if (tx.from?.toLowerCase() === userAddr.toLowerCase()) {
                console.log(`Found TX in block ${i}:`);
                console.log(`  To: ${tx.to}`);
                console.log(`  Value: ${ethers.formatEther(tx.value)} ARC`);
                console.log(`  Hash: ${tx.hash}`);
            }
        }
    }
    console.log('Scan complete.');
}

scan().then(() => process.exit(0));

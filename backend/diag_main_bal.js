const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

async function check() {
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
        const bal = await blockchain.getNativeBalance(userAddr);
        console.log(`Main Wallet: ${userAddr}`);
        console.log(`Balance (Native/USDC): ${ethers.formatEther(bal)}`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check().then(() => process.exit(0));

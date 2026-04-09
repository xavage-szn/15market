const blockchain = require('./src/services/blockchain');
const { ethers } = require('ethers');

async function test() {
    const address = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    console.log(`Testing balanced check with hardened logic for ${address}...`);
    
    try {
        await blockchain.ensureReady();
        const start = Date.now();
        const balance = await blockchain.getNativeBalance(address);
        const end = Date.now();
        console.log(`Success! Balance: ${ethers.formatEther(balance)} ARC. Time: ${end-start}ms`);
    } catch (e) {
        console.error('Final Failure:', e.message);
    }
}
test().then(() => process.exit(0));

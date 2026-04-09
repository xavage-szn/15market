const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');

const DEFAULT_SALT = "15market_universal_session_salt_v1";

function deriveUserWallet(userAddress) {
    const addr = userAddress.toLowerCase();
    const salt = ethers.id(`${DEFAULT_SALT}:${addr}`);
    const wallet = new ethers.Wallet(salt);
    return { address: wallet.address };
}

async function check() {
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    const { address: sessionAddr } = deriveUserWallet(userAddr);
    console.log(`Main Wallet: ${userAddr}`);
    console.log(`Derived (Default Salt): ${sessionAddr}`);
    
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
        const bal = await blockchain.getNativeBalance(sessionAddr);
        console.log(`Balance: ${ethers.formatEther(bal)} ARC`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check().then(() => process.exit(0));

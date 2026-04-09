const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_universal_session_salt_v1";

function deriveUserWallet(userAddress) {
    if (!userAddress) throw new Error("Target address required");
    const addr = userAddress.toLowerCase();
    const salt = ethers.id(`${SESSION_MASTER_SECRET}:${addr}`);
    const wallet = new ethers.Wallet(salt);
    return {
        address: wallet.address,
        privateKey: wallet.privateKey,
        wallet: wallet
    };
}

async function check() {
    console.log(`Using Secret: ${SESSION_MASTER_SECRET}`);
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    const { address: sessionAddr } = deriveUserWallet(userAddr);
    console.log(`Main Wallet: ${userAddr}`);
    console.log(`Derived Session Wallet: ${sessionAddr}`);
    
    // Wait for provider
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
        const balance = await blockchain.getNativeBalance(sessionAddr);
        console.log(`Session Balance (Native): ${ethers.formatEther(balance)} ARC`);
    } catch (e) {
        console.error('Error fetching balance:', e.message);
    }
}

check().then(() => process.exit(0));

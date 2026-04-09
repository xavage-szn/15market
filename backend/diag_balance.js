const { ethers } = require('ethers');
const crypto = require('crypto');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

const MASTER_SECRET = process.env.SESSION_MASTER_SECRET || '15market_super_secure_master_secret_key_v1';

function deriveUserWallet(userAddress) {
    const salt = crypto.createHmac('sha256', MASTER_SECRET)
        .update(userAddress.toLowerCase())
        .digest('hex');
    const privateKey = '0x' + salt;
    const wallet = new ethers.Wallet(privateKey);
    return { wallet, address: wallet.address };
}

async function check() {
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
    
    // Check if the user sent it to the WRONG session wallet (maybe salt changed?)
    // Or maybe they sent it to the main wallet?
}

check().then(() => process.exit(0));

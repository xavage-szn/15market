const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

const SESSION_MASTER_SECRET = process.env.SESSION_MASTER_SECRET || "15market_universal_session_salt_v1";
const USDC_ADDR = process.env.USDC_ADDRESS || "0x3600000000000000000000000000000000000000";

const ERC20_ABI = [
    "function balanceWith(address account) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "function decimals() view returns (uint8)"
];

function deriveUserWallet(userAddress) {
    const addr = userAddress.toLowerCase();
    const salt = ethers.id(`${SESSION_MASTER_SECRET}:${addr}`);
    const wallet = new ethers.Wallet(salt);
    return { address: wallet.address };
}

async function check() {
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    const { address: sessionAddr } = deriveUserWallet(userAddr);
    console.log(`Main Wallet: ${userAddr}`);
    console.log(`Derived Session Wallet: ${sessionAddr}`);
    
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
        const nativeBal = await blockchain.getNativeBalance(sessionAddr);
        console.log(`Native Balance: ${ethers.formatEther(nativeBal)} ARC`);
        
        const usdcContract = new ethers.Contract(USDC_ADDR, ERC20_ABI, blockchain.provider);
        try {
            const dec = await usdcContract.decimals();
            const bal = await usdcContract.balanceOf(sessionAddr);
            console.log(`USDC (ERC20) Balance: ${ethers.formatUnits(bal, dec)} USDC`);
        } catch (e) {
            console.log(`USDC check failed (maybe not ERC20): ${e.message}`);
        }
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check().then(() => process.exit(0));

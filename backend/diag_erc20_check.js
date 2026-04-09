const { ethers } = require('ethers');
const blockchain = require('./src/services/blockchain');
require('dotenv').config();

const USDC_ADDR = "0x3600000000000000000000000000000000000000";
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"];

async function check() {
    const userAddr = '0x4c8C0fb7333E3ab1594e69c0F5F751150502C28C';
    
    for(let i=0; i<10; i++) {
        if (blockchain.providerReady) break;
        await new Promise(r => setTimeout(r, 1000));
    }
    
    try {
        const contract = new ethers.Contract(USDC_ADDR, ERC20_ABI, blockchain.provider);
        const dec = await contract.decimals();
        const bal = await contract.balanceOf(userAddr);
        console.log(`Main Wallet: ${userAddr}`);
        console.log(`ERC20 USDC Balance: ${ethers.formatUnits(bal, dec)}`);
    } catch (e) {
        console.error('Error:', e.message);
    }
}

check().then(() => process.exit(0));

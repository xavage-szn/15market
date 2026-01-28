require('dotenv').config();
const { ethers } = require('ethers');
const p = new ethers.JsonRpcProvider('https://rpc.quicknode.testnet.arc.network');
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, p);
p.getBalance(wallet.address)
    .then(b => console.log('KEEPER ADDRESS:', wallet.address, '\nBALANCE:', ethers.formatEther(b), 'ARC/USDC'))
    .catch(console.error);

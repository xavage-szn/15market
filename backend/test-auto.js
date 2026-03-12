const { ethers } = require('ethers');
require('dotenv').config();

async function check() {
    const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network', 5042002, { staticNetwork: true });
    const w = new ethers.Wallet(process.env.PRIVATE_KEY);
    const addr = w.address.toLowerCase();

    const entropy = ethers.toUtf8Bytes(process.env.SESSION_MASTER_SECRET + addr);
    const sk = ethers.keccak256(entropy);
    const sw = new ethers.Wallet(sk, provider);

    const bal = await provider.getBalance(sw.address);
    console.log(`Main Address: ${w.address}`);
    console.log(`Session Address: ${sw.address}`);
    console.log(`Session Balance: ${ethers.formatEther(bal)}`);
}

check().catch(console.error);

const { ethers } = require('ethers');
require('dotenv').config();

async function main() {
    const provider = new ethers.JsonRpcProvider("https://5042002.rpc.thirdweb.com");
    const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const balance = await provider.getBalance(wallet.address);
    console.log(`KEEPER_ADDRESS=${wallet.address}`);
    console.log(`KEEPER_BALANCE=${ethers.formatEther(balance)} USDC`);
}
main().catch(err => console.error(err));

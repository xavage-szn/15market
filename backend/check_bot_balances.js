const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function check() {
    const provider = new ethers.JsonRpcProvider(process.env.ARC_RPC || 'https://rpc.testnet.arc.network');

    // Check main wallets
    const keeperWallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
    const keeperBal = await provider.getBalance(keeperWallet.address);
    console.log(`\nMain Keeper (${keeperWallet.address}): ${ethers.formatEther(keeperBal)} USDC`);

    const ROUNDS_CONTRACT = process.env.ROUNDS_CONTRACT_ADDRESS;
    if (ROUNDS_CONTRACT) {
        const contractBal = await provider.getBalance(ROUNDS_CONTRACT);
        console.log(`Rounds Contract (${ROUNDS_CONTRACT}): ${ethers.formatEther(contractBal)} USDC`);
    }

    // Check bots
    const botFile = path.join(__dirname, 'bot_wallets.json');
    if (fs.existsSync(botFile)) {
        const pks = JSON.parse(fs.readFileSync(botFile, 'utf8'));
        console.log(`\nChecking ${pks.length} Bots:`);
        for (let i = 0; i < pks.length; i++) {
            const bot = new ethers.Wallet(pks[i], provider);
            const bal = await provider.getBalance(bot.address);
            console.log(`Bot ${i} (${bot.address.slice(0, 8)}...): ${ethers.formatEther(bal)} USDC`);
        }
    } else {
        console.log('\nNo bot_wallets.json found.');
    }
}

check().catch(console.error);

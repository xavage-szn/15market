const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

async function fund() {
    const provider = new ethers.JsonRpcProvider('https://rpc.testnet.arc.network');
    const treasury = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

    console.log(`\nTreasury Wallet: ${treasury.address}`);
    let balance = await provider.getBalance(treasury.address);
    console.log(`Balance: ${ethers.formatEther(balance)} USDC`);

    const botFile = path.join(__dirname, 'bot_wallets.json');
    if (!fs.existsSync(botFile)) {
        console.log('No bot Wallets found.');
        return;
    }

    const pks = JSON.parse(fs.readFileSync(botFile, 'utf8'));

    for (let i = 0; i < pks.length; i++) {
        const bot = new ethers.Wallet(pks[i], provider);
        const bal = await provider.getBalance(bot.address);

        if (parseFloat(ethers.formatEther(bal)) < 2.0) {
            console.log(`Funding Bot ${i} (${bot.address.slice(0, 8)})...`);
            try {
                const tx = await treasury.sendTransaction({
                    to: bot.address,
                    value: ethers.parseEther("5.0"),
                    gasLimit: 300000
                });
                console.log(`TX sent: ${tx.hash}. Waiting for confirmation...`);
                await tx.wait(1);
                console.log(`Bot ${i} funded.`);
            } catch (e) {
                console.error(`Failed to fund bot ${i}:`, e.message);
                if (e.message.includes('timeout') || e.message.includes('busy')) {
                    i--; // retry
                    await new Promise(r => setTimeout(r, 5000));
                }
            }
        } else {
            console.log(`Bot ${i} already funded (${ethers.formatEther(bal)} USDC).`);
        }
    }
}

fund().catch(console.error);

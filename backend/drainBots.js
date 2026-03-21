const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const BOT_DATA_FILE = path.join(__dirname, 'bot_wallets.json');
const RPC = "https://rpc.testnet.arc.network";
const TREASURY_ADDRESS = "0x094604E6bA1E98756b0de29a9E2285Ead0c443Fd"; // Derived from the PRIVATE_KEY in .env

async function drain() {
    console.log('--- 🤖 15Market Bot Draining Procedure ---');
    if (!fs.existsSync(BOT_DATA_FILE)) {
        console.error('❌ bot_wallets.json not found.');
        return;
    }

    const provider = new ethers.JsonRpcProvider(RPC);
    const pks = JSON.parse(fs.readFileSync(BOT_DATA_FILE, 'utf8'));
    console.log(`[Drain] Loaded ${pks.length} bots. Target: ${TREASURY_ADDRESS}`);

    for (let i = 0; i < pks.length; i++) {
        const bot = new ethers.Wallet(pks[i], provider);
        try {
            const balance = await provider.getBalance(bot.address);
            if (balance === 0n) continue;

            const feeData = await provider.getFeeData();
            const gasPrice = feeData.gasPrice * 2n; // Aggressive
            const gasLimit = 21000n;
            const cost = gasPrice * gasLimit;

            if (balance <= cost) {
                console.log(`[Drain] Bot ${bot.address.slice(0, 6)} balance too low to send: ${ethers.formatEther(balance)}`);
                continue;
            }

            const amountToSend = balance - cost;
            console.log(`[Drain] Draining ${ethers.formatEther(amountToSend)} from ${bot.address.slice(0, 6)}...`);

            const tx = await bot.sendTransaction({
                to: TREASURY_ADDRESS,
                value: amountToSend,
                gasLimit: gasLimit,
                gasPrice: gasPrice
            });

            console.log(`[Drain] ✅ Success: ${tx.hash}`);
            await new Promise(r => setTimeout(r, 2000));
        } catch (e) {
            console.error(`[Drain] ❌ Failed ${bot.address.slice(0, 6)}: ${e.message}`);
        }
    }
}

drain();

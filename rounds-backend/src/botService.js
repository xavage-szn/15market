const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const redis = require('./redis');
const pricing = require('./pricing');
const blockchain = require('./blockchain');

const BOT_DATA_FILE = path.join(__dirname, '..', 'bot_wallets.json');

class BotService {
    constructor() {
        this.bots = [];
        this.contractAddress = null;
        this.abi = ["function enterRound(uint256 _roundId, uint8 _direction) external payable"];
        
        // Settings
        this.minBots = 10;
        this.stakeMin = 1.0;
        this.stakeMax = 5.0;
    }

    async init() {
        console.log('[BotService] 🤖 Initializing Bot Protocol for Rounds...');
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS;
        await this.loadOrGenerateBots();
        this.checkAndFundBots(); // Background execution
    }

    async loadOrGenerateBots() {
        try {
            if (fs.existsSync(BOT_DATA_FILE)) {
                const data = JSON.parse(fs.readFileSync(BOT_DATA_FILE, 'utf8'));
                this.bots = data.map(pk => new ethers.Wallet(pk, blockchain.provider));
                console.log(`[BotService] Loaded ${this.bots.length} existing bot wallets.`);
            } else {
                console.log(`[BotService] Generating ${this.minBots} new bot wallets...`);
                const pks = [];
                for (let i = 0; i < this.minBots; i++) {
                    const wallet = ethers.Wallet.createRandom();
                    this.bots.push(wallet.connect(blockchain.provider));
                    pks.push(wallet.privateKey);
                }
                fs.writeFileSync(BOT_DATA_FILE, JSON.stringify(pks, null, 2));
                console.log('[BotService] Wallets generated and saved to bot_wallets.json');
            }
        } catch (e) {
            console.error('[BotService] ❌ Failed to load/generate bots:', e.message);
        }
    }

    async checkAndFundBots() {
        console.log('[BotService] Checking bot balances for Rounds...');
        if (!blockchain.wallet) return;

        for (const bot of this.bots) {
            try {
                const balance = await blockchain.provider.getBalance(bot.address);
                const balanceUSDC = parseFloat(ethers.formatEther(balance));

                if (balanceUSDC < 2.0) {
                    console.log(`[BotService] Funding bot ${bot.address.slice(0, 6)}... (Current: ${balanceUSDC.toFixed(2)})`);
                    const tx = await blockchain.wallet.sendTransaction({
                        to: bot.address,
                        value: ethers.parseEther("5.0")
                    });
                    console.log(`[BotService] Funding TX: ${tx.hash}`);
                    await new Promise(r => setTimeout(r, 2000));
                }
            } catch (e) {
                console.error(`[BotService] ❌ Funding failed for ${bot.address.slice(0, 6)}:`, e.message);
            }
        }
    }

    async act(assetId, roundId, currentParticipants) {
        console.log(`[BotService] 🤖 Round Pulse: ${assetId} | ID: ${roundId} | Players: ${currentParticipants}`);

        let botsToEnter = 0;
        const roll = Math.random();

        if (currentParticipants <= 2) {
            if (roll < 0.8) botsToEnter = Math.floor(Math.random() * 2) + 1;
        } else if (currentParticipants <= 5) {
            if (roll < 0.4) botsToEnter = 1;
        }

        if (botsToEnter === 0) return;

        console.log(`[BotService] 🚀 Triggering ${botsToEnter} bot(s) for ${assetId}...`);
        const shuffledBots = [...this.bots].sort(() => 0.5 - Math.random());
        const selected = shuffledBots.slice(0, botsToEnter);

        for (const bot of selected) {
            try {
                const bal = await blockchain.provider.getBalance(bot.address);
                if (parseFloat(ethers.formatEther(bal)) < 1.0) continue;

                const direction = Math.random() > 0.5 ? 1 : 0; // 1 = UP, 0 = DOWN (matching ABI contract logic)
                const amount = (Math.random() * (this.stakeMax - this.stakeMin) + this.stakeMin).toFixed(2);

                const contract = new ethers.Contract(this.contractAddress, this.abi, bot);
                const val = ethers.parseEther(amount);

                console.log(`[BotService] Bot ${bot.address.slice(0, 6)} entering ${direction === 1 ? 'UP' : 'DOWN'} for ${amount} USDC...`);

                const tx = await contract.enterRound(roundId, direction, {
                    value: val,
                    gasLimit: 500000
                });

                console.log(`[BotService] ✅ Bot TX: ${tx.hash}`);

                // Optimistic state update in Redis
                const state = await redis.getRound(`${assetId}_state`);
                if (state && state.next && state.next.id === roundId) {
                    const side = direction === 1 ? 'long' : 'short';
                    if (!state.next.pools) state.next.pools = { long: 0, short: 0, participants: 0 };
                    state.next.pools[side] = (state.next.pools[side] || 0) + parseFloat(amount);
                    state.next.pools.participants = (state.next.pools.participants || 0) + 1;
                    await redis.setRound(`${assetId}_state`, state);
                }

                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                console.error(`[BotService] ❌ Bot failed:`, e.message);
            }
        }
    }
}

module.exports = new BotService();

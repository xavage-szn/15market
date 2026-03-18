const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const redis = require('./redis');
const pricing = require('./pricing');

const BOT_DATA_FILE = path.join(__dirname, '..', '..', 'bot_wallets.json');

class BotService {
    constructor() {
        const rpc = `https://5042002.rpc.thirdweb.com/${process.env.THIRDWEB_CLIENT_ID}`;
        const fetchReq = new ethers.FetchRequest(rpc);
        if (process.env.THIRDWEB_SECRET_KEY) {
            fetchReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
        }
        this.provider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
        this.treasuryWallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.bots = [];
        this.contractAddress = null;
        this.abi = ["function enterRound(uint256 _roundId, uint8 _direction) external payable"];

        // Settings
        this.minBots = 10;
        this.maxBots = 15;
        this.stakeMin = 1.0;
        this.stakeMax = 5.0;
    }

    async init() {
        console.log('[BotService] 🤖 Initializing Bot Protocol...');
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS;
        console.log(`[BotService] Using contract: ${this.contractAddress}`);
        await this.loadOrGenerateBots();
        this.checkAndFundBots(); // Run in background to not block startup
    }

    async loadOrGenerateBots() {
        if (fs.existsSync(BOT_DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(BOT_DATA_FILE, 'utf8'));
            this.bots = data.map(pk => new ethers.Wallet(pk, this.provider));
            console.log(`[BotService] Loaded ${this.bots.length} existing bot wallets.`);
        } else {
            console.log(`[BotService] Generating ${this.minBots} new bot wallets...`);
            const pks = [];
            for (let i = 0; i < this.minBots; i++) {
                const wallet = ethers.Wallet.createRandom();
                this.bots.push(wallet.connect(this.provider));
                pks.push(wallet.privateKey);
            }
            fs.writeFileSync(BOT_DATA_FILE, JSON.stringify(pks, null, 2));
            console.log('[BotService] Wallets generated and saved.');
        }
    }

    async checkAndFundBots() {
        console.log('[BotService] Checking bot balances...');
        for (const bot of this.bots) {
            const balance = await this.provider.getBalance(bot.address);
            const balanceUSDC = parseFloat(ethers.formatEther(balance));

            if (balanceUSDC < 2.0) { // If less than 2 USDC, top up to 5
                console.log(`[BotService] Funding bot ${bot.address.slice(0, 6)}... (Current: ${balanceUSDC.toFixed(2)})`);
                try {
                    const tx = await this.treasuryWallet.sendTransaction({
                        to: bot.address,
                        value: ethers.parseEther("5.0")
                    });
                    console.log(`[BotService] Funding TX broadcasted for ${bot.address.slice(0, 6)}: ${tx.hash}`);
                    // Optionally wait for one to ensure nonce doesn't clash if treasury used elsewhere, 
                    // but treasury should be dedicated or use nonceManager.
                    await new Promise(r => setTimeout(r, 2000));
                } catch (e) {
                    console.error(`[BotService] ❌ Funding failed for ${bot.address.slice(0, 6)}:`, e.message);
                }
            }
        }
    }

    /**
     * Trigger bot entries for a specific asset and round.
     * Logic: Higher probability if participants are low.
     */
    async act(assetId, roundId, currentParticipants) {
        console.log(`[BotService] 🤖 Pulse for ${assetId} | Round: ${roundId} | Current Players: ${currentParticipants}`);

        let botsToEnter = 0;
        const roll = Math.random();

        if (currentParticipants <= 2) {
            if (roll < 0.9) botsToEnter = Math.floor(Math.random() * 3) + 2;
        } else if (currentParticipants <= 5) {
            if (roll < 0.5) botsToEnter = Math.floor(Math.random() * 2) + 1;
        } else if (currentParticipants < 10) {
            if (roll < 0.2) botsToEnter = 1;
        }

        if (botsToEnter === 0) {
            console.log(`[BotService] Roll (${roll.toFixed(2)}) resulted in 0 bots for this pulse.`);
            return;
        }

        console.log(`[BotService] 🚀 Triggering ${botsToEnter} bots for ${assetId}...`);

        const shuffledBots = [...this.bots].sort(() => 0.5 - Math.random());
        const selected = shuffledBots.slice(0, botsToEnter);

        for (const bot of selected) {
            try {
                const bal = await this.provider.getBalance(bot.address);
                const balNum = parseFloat(ethers.formatEther(bal));

                if (balNum < 1.0) {
                    console.log(`[BotService] ⚠️ Bot ${bot.address.slice(0, 6)} has low balance (${balNum.toFixed(2)}), skipping.`);
                    continue;
                }

                // Random Direction: 0 = DOWN, 1 = UP
                const direction = Math.random() > 0.5 ? 1 : 0;
                const amount = (Math.random() * (this.stakeMax - this.stakeMin) + this.stakeMin).toFixed(2);

                if (!this.contractAddress) {
                    console.error('[BotService] ❌ CRITICAL: ROUNDS_CONTRACT_ADDRESS not found in environment.');
                    return;
                }

                console.log(`[BotService] Bot ${bot.address.slice(0, 6)} entering ${direction === 1 ? 'UP' : 'DOWN'} for ${amount} USDC...`);

                const contract = new ethers.Contract(this.contractAddress, this.abi, bot);
                const val = ethers.parseEther(amount);

                // Entry with retry
                let success = false;
                for (let attempt = 1; attempt <= 3; attempt++) {
                    try {
                        const tx = await contract.enterRound(roundId, direction, {
                            value: val,
                            gasLimit: 500000
                        });
                        console.log(`[BotService] ✅ TX Sent (Attempt ${attempt}): ${tx.hash}`);
                        success = true;
                        
                        // Optimistic state update
                        const state = await redis.getRound(`${assetId}_state`);
                        if (state && state.next && state.next.id === roundId) {
                           const side = direction === 1 ? 'long' : 'short';
                           if (!state.next.pools) state.next.pools = { long: 0, short: 0, participants: 0 };
                           state.next.pools[side] = (state.next.pools[side] || 0) + parseFloat(amount);
                           state.next.pools.participants = (state.next.pools.participants || 0) + 1;
                           await redis.setRound(`${assetId}_state`, state);
                           console.log(`[BotService] 📊 Updated Redis: ${assetId} ${side} pool +${amount}`);
                        }
                        break;
                    } catch (txErr) {
                        console.warn(`[BotService] ⚠️ Attempt ${attempt} failed for ${bot.address.slice(0,6)}: ${txErr.message.slice(0, 50)}`);
                        if (attempt < 3) await new Promise(r => setTimeout(r, 1000 * attempt));
                        else throw txErr;
                    }
                }

            } catch (e) {
                console.error(`[BotService] ❌ Bot ${bot.address.slice(0,6)} failed after retries:`, e.message.slice(0, 100));
            }

            await new Promise(r => setTimeout(r, 1000));
        }
    }
}

module.exports = new BotService();

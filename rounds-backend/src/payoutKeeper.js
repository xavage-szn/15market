const { ethers } = require('ethers');
const blockchain = require('./blockchain');
const redis = require('./redis');

/**
 * PayoutKeeper: Robust automated payout system for Rounds.
 * It periodically scans for winners who haven't been paid on-chain and retries.
 */
class PayoutKeeper {
    constructor() {
        this.interval = null;
        this.assets = ['ETHUSDT', 'BTCUSDT', 'SOLUSDT'];
        this.isProcessing = false;
        
        // Extended ABI for payouts and presence checks
        this.abi = [
            "function distributePayoutsBatch(uint256 _roundId, address[] calldata _users) external",
            "function participants(uint256 roundId, uint256 index) external view returns (address)",
            "function entries(uint256 roundId, address user) external view returns (address userAddress, uint256 amount, uint8 direction, bool claimed)"
        ];
    }

    start() {
        console.log('[PayoutKeeper] Starting automated payout retry loop (1m)...');
        // Check every minute
        this.interval = setInterval(() => this.process(), 60 * 1000);
        // Initial run
        setTimeout(() => this.process(), 10000);
    }

    async process() {
        if (this.isProcessing) return;
        this.isProcessing = true;

        try {
            console.log(`[PayoutKeeper] Scanning assets: ${this.assets.join(', ')}`);
            for (const asset of this.assets) {
                await this.processAsset(asset);
            }
        } catch (e) {
            console.error(`[PayoutKeeper] Error during loop:`, e.message);
        } finally {
            this.isProcessing = false;
        }
    }

    async processAsset(asset) {
        // Get the current state to know which round is latest
        const state = await redis.getRound(`${asset}_state`);
        if (!state || !state.live || !state.live.id) return;

        const latestRoundId = Number(state.live.id);
        
        // Scan last 5 rounds for missed payouts (deemed "settled")
        for (let i = 1; i <= 5; i++) {
            const rid = latestRoundId - i;
            if (rid < 0) break;

            try {
                await this.checkMissedPayouts(rid);
            } catch (err) {
                console.warn(`[PayoutKeeper] Failed check for Round ${rid}:`, err.message);
            }
        }
    }

    async checkMissedPayouts(roundId) {
        if (!blockchain.provider) return;
        const contract = new ethers.Contract(process.env.ROUNDS_CONTRACT_ADDRESS, this.abi, blockchain.wallet);
        
        const missedUsers = [];
        let index = 0;
        let finished = false;

        // Fetch users from the contract's participants mapping
        while (!finished && index < 50) { // Limit scan per round to save RPC
            try {
                const userAddr = await contract.participants(roundId, index);
                if (!userAddr || userAddr === ethers.ZeroAddress) { finished = true; continue; }
                
                // Now check if this user is a winner and UNCLAIMED
                const entry = await contract.entries(roundId, userAddr);
                if (entry && !entry.claimed) {
                    missedUsers.push(userAddr);
                }
                index++;
            } catch (e) {
                finished = true; // No more participants at this index
            }
        }

        if (missedUsers.length > 0) {
            console.log(`[PayoutKeeper] Round ${roundId}: Found ${missedUsers.length} potential missed payouts. Retrying...`);
            
            try {
                // Execute batch payout using distributePayoutsBatch (Owner-only non-blocking)
                const tx = await contract.distributePayoutsBatch(roundId, missedUsers, {
                    gasLimit: 3000000 // High limit as batch can be expensive
                });
                
                console.log(`[PayoutKeeper] Retry TX broadcasted for Round ${roundId}: ${tx.hash}`);
                const receipt = await tx.wait(); // Confirm success
                console.log(`[PayoutKeeper] Round ${roundId} payouts confirmed successfully in block ${receipt.blockNumber}.`);
            } catch (txErr) {
                console.error(`[PayoutKeeper] Transaction failed for Round ${roundId}:`, txErr.message);
            }
        }
    }
}

module.exports = new PayoutKeeper();

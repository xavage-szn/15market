const { ethers, FetchRequest } = require('ethers');
const blockchain = require('../services/blockchain'); // Reuse the main blockchain service for provider/wallet

class RoundsBlockchain {
    constructor() {
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS;
        this.abi = [
            "function lockRound(uint256 _roundId, uint256 _price) external",
            "function settleRound(uint256 _roundId, uint256 _price) external",
            "function enterRound(uint256 _roundId, uint8 _direction) external payable"
        ];
        this.contract = null;
        this.settleContract = null;
        this.blockchain = blockchain; // Expose the main blockchain service
    }

    async ensureReady() {
        if (this.contract) return;
        
        // Wait for the main blockchain service to be ready
        let attempts = 0;
        while (!blockchain.providerReady && attempts < 20) {
            await new Promise(r => setTimeout(r, 500));
            attempts++;
        }

        if (!blockchain.providerReady) {
            throw new Error("[RoundsBlockchain] Main blockchain service failed to initialize.");
        }

        this.contract = new ethers.Contract(this.contractAddress, this.abi, blockchain.wallet);
        
        // Reuse the settlement isolated provider if available
        if (blockchain.settleWallet) {
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, blockchain.settleWallet);
            console.log("[RoundsBlockchain] Settlement provider ready.");
        }
        
        console.log(`[RoundsBlockchain] Initialized for contract: ${this.contractAddress}`);
    }

    async lockRound(roundId, price) {
        await this.ensureReady();
        const c = this.settleContract || this.contract;
        return await c.lockRound(roundId, price);
    }

    async settleRound(roundId, price) {
        await this.ensureReady();
        const c = this.settleContract || this.contract;
        return await c.settleRound(roundId, price);
    }

    async enterRound(roundId, direction, value, wallet) {
        await this.ensureReady();
        const contract = new ethers.Contract(this.contractAddress, this.abi, wallet);
        return await contract.enterRound(roundId, direction, { value });
    }
}

module.exports = new RoundsBlockchain();

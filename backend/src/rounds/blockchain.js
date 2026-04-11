const { ethers } = require('ethers');
const blockchain = require('../services/blockchain'); // Reuse the main blockchain service for provider/wallet
const nonceManager = require('../services/nonceManager');

class RoundsBlockchain {
    constructor() {
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS;
        this.abi = [
            "function lockRound(uint256 _roundId, uint256 _price) external",
            "function settleRound(uint256 _roundId, uint256 _price) external",
            "function enterRound(uint256 _roundId, uint8 _direction, address _payoutAddress) external payable"
        ];
        this.contract = null;
        this.highSpeedContract = null;
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
        
        if (blockchain.highSpeedProvider) {
            this.highSpeedContract = new ethers.Contract(this.contractAddress, this.abi, blockchain.wallet.connect(blockchain.highSpeedProvider));
            console.log("[RoundsBlockchain] High-speed provider ready.");
        }

        // Reuse the settlement isolated provider if available
        if (blockchain.settleWallet) {
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, blockchain.settleWallet);
        }
    }

    async lockRound(roundId, price, options = {}) {
        await this.ensureReady();
        const fees = await blockchain._getGasPrice();
        const c = this.highSpeedContract || this.settleContract || this.contract;
        const nonce = await nonceManager.getNonce(blockchain.wallet.address, blockchain.highSpeedProvider || blockchain.provider);
        
        return await c.lockRound(roundId, price, {
            ...options,
            nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            type: 2,
            chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });
    }

    async settleRound(roundId, price, options = {}) {
        await this.ensureReady();
        const fees = await blockchain._getGasPrice();
        const c = this.highSpeedContract || this.settleContract || this.contract;
        const nonce = await nonceManager.getNonce(blockchain.wallet.address, blockchain.highSpeedProvider || blockchain.provider);

        return await c.settleRound(roundId, price, {
            ...options,
            nonce,
             maxFeePerGas: fees.maxFeePerGas,
             maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
             type: 2,
             chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });
    }

    async enterRound(roundId, direction, value, wallet, payoutAddress, addressOverride = null) {
        await this.ensureReady();
        const target = addressOverride || this.contractAddress;
        
        // Use high speed provider for gas and nonce
        const fees = await blockchain._getGasPrice();
        const provider = blockchain.highSpeedProvider || blockchain.provider;
        const nonce = await nonceManager.getNonce(wallet.address, provider);

        const contract = new ethers.Contract(target, this.abi, wallet.connect(provider));
        return await contract.enterRound(roundId, direction, payoutAddress, { 
            value, 
            nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit: 800000 
        });
    }
}

module.exports = new RoundsBlockchain();

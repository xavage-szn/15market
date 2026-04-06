const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nonceManager = require('./nonceManager');

class BlockchainService {
    constructor() {
        this.providerReady = false;
        this.rpc = "https://rpc.testnet.arc.network";
        this.contractAddress = process.env.ARC_CONTRACT_ADDRESS;
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        
        this.abi = [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function isBetSettled(uint256 _betId) view returns (bool)",
            "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];

        this._init();
    }

    async _init() {
        try {
            console.log(`[Blockchain] Connecting to: ${this.rpc}`);
            const network = ethers.Network.from(5042002);
            this.provider = new ethers.JsonRpcProvider(this.rpc, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            const pk = process.env.PRIVATE_KEY;
            if (!pk) throw new Error('PRIVATE_KEY is missing in .env');

            this.wallet = new ethers.Wallet(pk, this.provider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
            
            // Basic connection check
            await this.provider.getBlockNumber();
            this.providerReady = true;
            console.log(`[Blockchain] Core Ready. Wallet: ${this.wallet.address}`);
        } catch (e) {
            console.error('[Blockchain] Initialization Critical Failure:', e.message);
            // Retry in 5s
            setTimeout(() => this._init(), 5000);
        }
    }

    async getNativeBalance(address) {
        if (!this.providerReady || !this.provider) throw new Error("Blockchain service not ready");
        try {
            return await this.provider.getBalance(address);
        } catch (e) {
            console.error(`[Blockchain] Balance check failed for ${address}:`, e.message);
            throw new Error(`Blockchain connection timed out while checking balance for ${address}`);
        }
    }

    async isBetSettled(betId) {
        try {
            const bet = await this.contract.bets(betId);
            return bet.settled;
        } catch (e) { return false; }
    }

    async _getGasPrice() {
        try {
            const feed = await this.provider.getFeeData();
            // Reasonable Arc Testnet gas pricing
            const floor = ethers.parseUnits("5", "gwei");
            let maxFee = feed.maxFeePerGas || floor;
            if (maxFee < floor) maxFee = floor;
            
            // 1.5x safety multiplier (was 4x — that was draining session wallets)
            maxFee = (maxFee * 15n) / 10n;
            const priority = ethers.parseUnits("2", "gwei");

            return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priority };
        } catch (e) {
            return { 
                maxFeePerGas: ethers.parseUnits("10", "gwei"), 
                maxPriorityFeePerGas: ethers.parseUnits("2", "gwei") 
            };
        }
    }

    // Direct event listeners for high reliability
    onBetPlaced(callback) {
        if (!this.contract) return;
        this.contract.on("BetPlaced", (...args) => {
            const event = args[args.length - 1];
            callback({
                id: event.args.id.toString(),
                user: event.args.user,
                amount: ethers.formatEther(event.args.amount),
                direction: Number(event.args.direction),
                entryPrice: (Number(event.args.entryPrice) / 1e8).toString(),
                duration: Number(event.args.duration),
                timestamp: Number(event.args.timestamp),
                marketId: Number(event.args.marketId)
            });
        });
    }

    onTxConfirmed(callback) {
        // Platform level confirmation tracking (optional but required by processor)
        this.provider?.on('block', async () => {
            // Logic to scan for confirmed TXs if needed
        });
    }

    onTxFailed(callback) {
        // Logic to scan for failed TXs if needed
    }

    async settleBet(betId, exitPrice, retryCount = 0) {
        try {
            const fees = await this._getGasPrice();
            const nonce = await nonceManager.getNonce(this.wallet.address, this.provider);
            const priceFixed = BigInt(Math.floor(exitPrice * 1e8));

            return await this.contract.settleBet(betId, priceFixed, {
                nonce,
                maxFeePerGas: fees.maxFeePerGas,
                maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
                gasLimit: 1500000
            });
        } catch (e) {
            console.error(`[Blockchain] Settlement failed for ${betId}:`, e.message);
            return null;
        }
    }
}

module.exports = new BlockchainService();

const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nonceManager = require('./nonceManager');

class BlockchainService {
    constructor() {
        this.providerReady = false;
        
        // --- 1. Define RPCs ---
        this.rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
        this.backupRpc = process.env.ARC_RPC_BACKUP || "https://arc-testnet.drpc.org";
        this.rpcs = [
            this.rpc, 
            this.backupRpc,
            "https://rpc.drpc.testnet.arc.network"
        ].filter(Boolean);
        this.currentRpcIndex = 0;
        
        const twClientId = process.env.THIRDWEB_CLIENT_ID;
        const twSecret = process.env.THIRDWEB_SECRET_KEY;
        this.twRpc = twClientId 
            ? `https://5042002.rpc.thirdweb.com/${twClientId}` 
            : "https://5042002.rpc.thirdweb.com";
        this.twSecret = twSecret;

        this.contractAddress = process.env.ARC_CONTRACT_ADDRESS;
        this.provider = null;         // Standard Provider (Main Balances)
        this.highSpeedProvider = null; // High-Speed Provider (Trades/Settlements/Events)
        this.wallet = null;
        this.contract = null;
        this.highSpeedContract = null;
        
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
        const targetRpc = this.rpcs[this.currentRpcIndex];
        const network = ethers.Network.from(5042002);

        try {
            console.log(`[Blockchain] Init: Main=${targetRpc} | HighSpeed=${this.twRpc}`);
            
            const pk = process.env.PRIVATE_KEY;
            if (!pk) throw new Error('PRIVATE_KEY is missing');

            // --- 1. Setup High-Speed Provider (Thirdweb) ---
            // We use this for CRITICAL connectivity and trade detection because Arc public RPCs are unstable
            const twFetch = new ethers.FetchRequest(this.twRpc);
            if (this.twSecret) twFetch.setHeader("x-secret-key", this.twSecret);
            
            this.highSpeedProvider = new ethers.JsonRpcProvider(twFetch, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            // Verify Thirdweb connectivity first (Since it's our stable baseline)
            await this.highSpeedProvider.getBlockNumber();
            console.log(`[Blockchain] High-Speed Path Verified.`);

            // --- 2. Setup Standard Provider (Standard Arc) ---
            this.provider = new ethers.JsonRpcProvider(targetRpc, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            // --- 3. Initialize Wallets & Contracts ---
            this.wallet = new ethers.Wallet(pk, this.provider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
            
            // High Speed instance (Attached to Thirdweb)
            this.highSpeedContract = new ethers.Contract(this.contractAddress, this.abi, this.wallet.connect(this.highSpeedProvider));

            this.providerReady = true;
            console.log(`[Blockchain] Core Ready. Wallet: ${this.wallet.address}`);

            // Nonce sync using the STABLE provider (HighSpeed) to avoid init hangs
            await nonceManager.syncWithChain(this.wallet.address, this.highSpeedProvider, true);

        } catch (e) {
            console.error(`[Blockchain] Init Error:`, e.message);
            // Cycle to next standard RPC for the fallback provider
            this.currentRpcIndex = (this.currentRpcIndex + 1) % this.rpcs.length;
            setTimeout(() => this._init(), 5000);
        }
    }

    async ensureReady() {
        if (this.providerReady) return;
        let attempts = 0;
        while (!this.providerReady && attempts < 10) {
            await new Promise(r => setTimeout(r, 1000));
            attempts++;
        }
    }

    // STRICT: Uses ONLY the standard provider for Main Balances as per instructions
    async getNativeBalance(address, retries = 2) {
        if (!this.provider) return 0n;
        
        for (let i = 0; i < retries; i++) {
            try {
                // Use standard provider for Main Balances as requested
                const balancePromise = this.provider.getBalance(address);
                const timeoutPromise = new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Timeout")), 10000)
                );
                return await Promise.race([balancePromise, timeoutPromise]);
            } catch (e) {
                if (i === retries - 1) return 0n;
                await new Promise(r => setTimeout(r, 500));
            }
        }
    }

    // NEW: High-speed balance check for the Trading Account (Session Wallet)
    // We use Thirdweb here because this check is on the critical trade-execution path.
    async getSessionBalance(address) {
        if (!this.highSpeedProvider) return await this.getNativeBalance(address);
        try {
            return await Promise.race([
                this.highSpeedProvider.getBalance(address),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Thirdweb Timeout")), 10000))
            ]);
        } catch (e) {
            return await this.getNativeBalance(address); // Fallback
        }
    }

    async isBetSettled(betId) {
        // Use high speed for checks too
        try {
            return await this.highSpeedContract.isBetSettled(betId);
        } catch (e) { return false; }
    }

    async _getGasPrice() {
        try {
            // Use high speed for fee data (More accurate/responsive)
            const feed = await this.highSpeedProvider.getFeeData();
            const floor = ethers.parseUnits("5", "gwei");
            let maxFee = feed.maxFeePerGas || floor;
            if (maxFee < floor) maxFee = floor;
            maxFee = (maxFee * 15n) / 10n;
            return { maxFeePerGas: maxFee, maxPriorityFeePerGas: ethers.parseUnits("2", "gwei") };
        } catch (e) {
            return { maxFeePerGas: ethers.parseUnits("10", "gwei"), maxPriorityFeePerGas: ethers.parseUnits("2", "gwei") };
        }
    }

    onBetPlaced(callback) {
        // Connect event listener to HIGH SPEED provider for reliable detection
        if (!this.highSpeedContract) return;
        this.highSpeedContract.on("BetPlaced", (...args) => {
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

    onTxConfirmed(callback) {}
    onTxFailed(callback) {}

    async getPastEvents(eventName, fromBlock, toBlock) {
        if (!this.highSpeedContract) return [];
        try {
            const filter = this.highSpeedContract.filters[eventName]();
            // Use high speed for history fetching as well
            return await this.highSpeedContract.queryFilter(filter, fromBlock, toBlock);
        } catch (e) {
            return [];
        }
    }

    async settleBet(betId, exitPrice) {
        try {
            const fees = await this._getGasPrice();
            const nonce = await nonceManager.getNonce(this.wallet.address, this.highSpeedProvider);
            const priceFixed = BigInt(Math.floor(exitPrice * 1e8));

            return await this.highSpeedContract.settleBet(betId, priceFixed, {
                nonce,
                maxFeePerGas: fees.maxFeePerGas,
                maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
                gasLimit: 500000
            });
        } catch (e) {
            console.error(`[Blockchain] Settle Error ${betId}:`, e.message);
            return null;
        }
    }
}

module.exports = new BlockchainService();

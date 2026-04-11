const { ethers } = require('ethers');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nonceManager = require('./nonceManager');

class BlockchainService {
    constructor() {
        this.providerReady = false;
        
        // --- 1. Identify Credentials & Chain (MUST happen first) ---
        const twClientId = process.env.THIRDWEB_CLIENT_ID;
        const twSecret = process.env.THIRDWEB_SECRET_KEY;
        const chainId = process.env.ARC_CHAIN_ID || "5042002";

        this.twRpc = process.env.THIRDWEB_RPC_URL || (twClientId 
            ? `https://${chainId}.rpc.thirdweb.com/${twClientId}` 
            : `https://${chainId}.rpc.thirdweb.com`);
        this.twSecret = twSecret;

        // --- 2. Define RPC Priority ---
        this.rpc = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
        this.backupRpc = process.env.ARC_RPC_BACKUP || "https://arc-testnet.drpc.org";
        this.rpcs = [
            this.twRpc, // High-speed Thirdweb first
            this.rpc,   // Public Arc
            this.backupRpc,
            "https://rpc-drpc.testnet.arc.network"
        ].filter(Boolean);
        this.currentRpcIndex = 0;

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
        const network = ethers.Network.from(Number(process.env.ARC_CHAIN_ID || 5042002));

        try {
            console.log(`[Blockchain] Init: Main=${targetRpc} | HighSpeed=${this.twRpc}`);
            
            const pk = process.env.PRIVATE_KEY;
            if (!pk) throw new Error('PRIVATE_KEY is missing');

            // --- 1. Setup High-Speed Provider (Thirdweb) ---
            const twFetch = new ethers.FetchRequest(this.twRpc);
            if (this.twSecret) twFetch.setHeader("x-secret-key", this.twSecret);
            
            this.highSpeedProvider = new ethers.JsonRpcProvider(twFetch, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            // Verify Thirdweb connectivity first
            await this.highSpeedProvider.getBlockNumber();
            console.log(`[Blockchain] High-Speed Path Verified.`);

            // --- 2. Setup Standard Provider (Now prioritizing High-Speed) ---
            let standardFetch = targetRpc;
            if (targetRpc === this.twRpc) {
                const req = new ethers.FetchRequest(this.twRpc);
                if (this.twSecret) req.setHeader("x-secret-key", this.twSecret);
                standardFetch = req;
            }

            this.provider = new ethers.JsonRpcProvider(standardFetch, network, {
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
            
            // Failover logic
            if (this.currentRpcIndex < this.rpcs.length - 1) {
                this.currentRpcIndex++;
                console.log(`[Blockchain] Retrying with next RPC: ${this.rpcs[this.currentRpcIndex]}`);
                setTimeout(() => this._init(), 2000);
            } else {
                console.error("[Blockchain] All RPCs failed. Standing by...");
                setTimeout(() => {
                    this.currentRpcIndex = 0;
                    this._init();
                }, 10000);
            }
        }
    }

    async _getGasPrice() {
        try {
            const provider = this.highSpeedProvider || this.provider;
            const feeData = await provider.getFeeData();
            
            let maxFee = feeData.maxFeePerGas || ethers.parseUnits("30", "gwei");
            let priorityFee = feeData.maxPriorityFeePerGas || ethers.parseUnits("1.5", "gwei");

            // Aggressive bump for testnet stability
            maxFee = (maxFee * 15n) / 10n; // 1.5x
            priorityFee = (priorityFee * 12n) / 10n; // 1.2x

            return { maxFeePerGas: maxFee, maxPriorityFeePerGas: priorityFee };
        } catch (e) {
            return {
                maxFeePerGas: ethers.parseUnits("50", "gwei"),
                maxPriorityFeePerGas: ethers.parseUnits("2", "gwei")
            };
        }
    }

    async getNativeBalance(address, retries = 2) {
        if (!this.provider) return 0n;
        
        for (let i = 0; i < retries; i++) {
            try {
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
        try {
            const contract = this.highSpeedContract || this.contract;
            return await contract.isBetSettled(betId);
        } catch (e) {
            return false;
        }
    }

    async settleBet(betId, exitPrice) {
        const fees = await this._getGasPrice();
        const nonce = await nonceManager.getNonce(this.wallet.address, this.highSpeedProvider || this.provider);

        const contract = this.highSpeedContract || this.contract;

        return await contract.settleBet(betId, exitPrice, {
            nonce,
            maxFeePerGas: fees.maxFeePerGas,
            maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
            gasLimit: 300000,
            chainId: Number(process.env.ARC_CHAIN_ID || 5042002)
        });
    }

    onBetPlaced(callback) {
        const contract = this.highSpeedContract || this.contract;
        if (!contract) return;
        contract.on("BetPlaced", (id, user, amount, direction, price, duration, timestamp, marketId) => {
            callback({
                id: id.toString(),
                user,
                amount: ethers.formatEther(amount),
                direction: direction === 1 ? "UP" : "DOWN",
                entryPrice: price.toString(),
                duration: duration.toString(),
                timestamp: Number(timestamp) * 1000,
                marketId: Number(marketId)
            });
        });
    }
}

module.exports = new BlockchainService();

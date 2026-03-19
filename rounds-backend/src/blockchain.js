const { ethers, FetchRequest } = require('ethers');
const path = require('path');
require('dotenv').config();

const getRpcEndpoints = () => {
    // Official ARC RPCs first to save Thirdweb limits for settlements
    return [
        "https://rpc.testnet.arc.network",
        "https://rpc.arc.network",
        "https://arc-testnet.alt.technology",
        "https://arc-testnet.drpc.org",
        "https://rpc.drpc.testnet.arc.network",
        `https://5042002.rpc.thirdweb.com/${process.env.THIRDWEB_CLIENT_ID}`
    ];
};

async function createProvider() {
    const endpoints = getRpcEndpoints();
    for (const rpc of endpoints) {
        try {
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 30000;
            if (rpc.includes('thirdweb.com') && process.env.THIRDWEB_SECRET_KEY) {
                fetchReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
            }
            const provider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            await provider.getBlockNumber();
            return provider;
        } catch (e) {
            console.warn(`[Blockchain] ⚠️ RPC failed: ${rpc} - ${e.message}`);
        }
    }
    return new ethers.JsonRpcProvider(endpoints[0]);
}

class BlockchainService {
    constructor() {
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractAddress = process.env.ROUNDS_CONTRACT_ADDRESS;
        this.abi = [
            "function lockRound(uint256 _roundId, uint256 _price) external",
            "function settleRound(uint256 _roundId, uint256 _price) external"
        ];
        this._init();
    }

    async _init() {
        this.provider = await createProvider();
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);

        // --- DEDICATED SETTLEMENT PROVIDER (Thirdweb Only) ---
        try {
            const twRpc = `https://5042002.rpc.thirdweb.com/${process.env.THIRDWEB_CLIENT_ID}`;
            const fetchReq = new FetchRequest(twRpc);
            if (process.env.THIRDWEB_SECRET_KEY) fetchReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
            this.settleProvider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            this.settleWallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.settleProvider);
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, this.settleWallet);
            console.log(`[Blockchain] ⚡ High-priority Settlement isolated to ThirdWeb RPC.`);
        } catch (e) {
            console.warn(`[Blockchain] Could not isolate settlement provider: ${e.message}`);
        }

        console.log(`[Blockchain] Rounds Service Initialized. Wallet: ${this.wallet.address}`);
    }

    async getNativeBalance(address) {
        if (!this.provider) return 0n;
        return await this.provider.getBalance(address);
    }

    // Methods for Rounds Processor to call
    async lockRound(roundId, price) {
        const c = this.settleContract || this.contract;
        return await c.lockRound(roundId, price);
    }

    async settleRound(roundId, price) {
        const c = this.settleContract || this.contract;
        return await c.settleRound(roundId, price);
    }
}

module.exports = new BlockchainService();

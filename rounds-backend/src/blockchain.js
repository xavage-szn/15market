const { ethers, FetchRequest } = require('ethers');
const vault = require('./vault');
const path = require('path');
require('dotenv').config();


const getRpcEndpoints = () => {
    // Official ARC RPCs
    return [
        "https://rpc.testnet.arc.network",
        "https://arc-testnet.alt.technology",
        "https://arc-testnet.drpc.org",
        "https://rpc.drpc.testnet.arc.network"
    ];
};

async function createProvider() {
    const endpoints = getRpcEndpoints();
    for (const rpc of endpoints) {
        try {
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 30000;
            const provider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            await provider.getBlockNumber();
            return provider;
        } catch (e) {
            console.warn(`[Blockchain] RPC failed: ${rpc} - ${e.message}`);
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
        const pk = vault.get('PRIVATE_KEY');
        this.wallet = new ethers.Wallet(pk, this.provider);
        this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);


        // --- DEDICATED SETTLEMENT PROVIDER (High Performance) ---
        try {
            const bestRpc = getRpcEndpoints()[0]; // Use top official RPC
            const fetchReq = new FetchRequest(bestRpc);
            this.settleProvider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            const sPk = vault.get('PRIVATE_KEY');
            this.settleWallet = new ethers.Wallet(sPk, this.settleProvider);
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, this.settleWallet);

            console.log(`[Blockchain] Settlement provider: ${bestRpc}`);
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
    async lockRound(roundId, price, options = {}) {
        const c = this.settleContract || this.contract;
        return await c.lockRound(roundId, price, options);
    }

    async settleRound(roundId, price, options = {}) {
        const c = this.settleContract || this.contract;
        return await c.settleRound(roundId, price, options);
    }
}

module.exports = new BlockchainService();

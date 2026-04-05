const { ethers, FetchRequest } = require('ethers');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nonceManager = require('./nonceManager');

const fs = require('fs');
const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}

const getRpcEndpoints = () => {
    return [
        "https://rpc.testnet.arc.network"
    ];
};

async function createProvider(blockchainService) {
    const endpoints = getRpcEndpoints();
    let currentRpcs = endpoints;

    if (currentRpcs.length > 1 && blockchainService?.lastGoodRpc) {
        const others = endpoints.filter(r => r !== blockchainService.lastGoodRpc);
        currentRpcs = [...others, blockchainService.lastGoodRpc];
    }

    console.log(`[Blockchain] Initializing provider with ${currentRpcs.length} endpoints...`);
    for (const rpc of currentRpcs) {
        try {
            console.log(`[Blockchain] Trying RPC: ${rpc}...`);
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 8000; // 8s per RPC
            
            const network = ethers.Network.from(5042002);
            const provider = new ethers.JsonRpcProvider(fetchReq, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            const block = await Promise.race([
                provider.getBlockNumber().catch(() => null),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
            ]);

            if (block !== null) {
                console.log(`[Blockchain] Connected: ${rpc} (Block: ${block})`);
                if (blockchainService) {
                    blockchainService.lastGoodRpc = rpc;
                    blockchainService.providerReady = true;
                }
                return provider;
            }
        } catch (e) {
            console.warn(`[Blockchain] RPC failed: ${rpc} - ${e.message}`);
        }
    }

    console.error("[Blockchain] CRITICAL: All RPC endpoints are OFFLINE. Entering degraded mode...");
    if (blockchainService) blockchainService.providerReady = false;
    
    // Fallback to a "dead" provider that we will swap later via background retry
    return new ethers.JsonRpcProvider(endpoints[0], 5042002, { staticNetwork: true });
}

class BlockchainService {
    constructor() {
        this.providerReady = false;
        this.isRotating = false;
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractAddress = process.env.ARC_CONTRACT_ADDRESS;
        this.lastGoodRpc = null;
        this.lastGasUpdate = 0;
        this.cachedGasPrice = null;
        this.GAS_CACHE_TTL = 5000;
        this.gasRefreshPromise = null;
        this.pendingTxs = new Map();
        this.confirmedTxs = new Set();

        this.abi = [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
            "function owner() view returns (address)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];

        this._init().catch(e => {
            console.error('[Blockchain] Init error:', e.message);
        });
    }

    async _init() {
        try {
            this.provider = await createProvider(this);
            const pk = process.env.PRIVATE_KEY;
            if (!pk) throw new Error('PRIVATE_KEY missing in .env');
            
            this.wallet = new ethers.Wallet(pk, this.provider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);

            const bestRpc = this.lastGoodRpc || getRpcEndpoints()[0];
            const fetchReq = new FetchRequest(bestRpc);
            this.settleProvider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            
            this.settleWallet = new ethers.Wallet(pk, this.settleProvider);
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, this.settleWallet);

            this.providerReady = true;
            console.log(`[Blockchain] Ready. Wallet: ${this.wallet.address}`);
        } catch (e) {
            console.error('[Blockchain] Initialization FAILED:', e.message);
            this.providerReady = false; 
        }

        this._refreshGasPrice();
        this._setupListeners();
        this._startConfirmationTracker();
    }

    async _startEventPolling() {
        if (!this.contract) return;
        let lastLoggedBlock = await this.provider.getBlockNumber();
        console.log(`[Blockchain] Starting event polling from block ${lastLoggedBlock}`);

        setInterval(async () => {
            try {
                const currentBlock = await this.provider.getBlockNumber();
                if (currentBlock <= lastLoggedBlock) return;
                const events = await this.contract.queryFilter("BetPlaced", lastLoggedBlock + 1, currentBlock);
                for (const event of events) {
                    try {
                        const [id, user, amount, direction, entryPrice, duration, timestamp, marketId] = event.args;
                        if (this.onBetPlacedCallback) {
                            let normalizedEntry = Number(entryPrice);
                            if (normalizedEntry > 100000000) normalizedEntry /= 1e8;
                            this.onBetPlacedCallback({
                                id: id.toString(), user, amount: ethers.formatEther(amount),
                                direction: Number(direction), entryPrice: normalizedEntry.toFixed(8),
                                duration: Number(duration), timestamp: Number(timestamp),
                                marketId: Number(marketId), transactionHash: event.transactionHash
                            }).catch(() => {});
                        }
                    } catch (inner) {}
                }
                lastLoggedBlock = currentBlock;
            } catch (e) {}
        }, 5000);
    }

    _setupListeners() { this._startEventPolling(); }

    async _ensureReady() {
        if (this.providerReady) return;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (this.providerReady) return;
        }
        throw new Error('Blockchain provider not ready');
    }

    async _resetNonce() {
        try { await nonceManager.syncWithChain(this.wallet.address, this.provider); } catch (e) { }
    }

    async _refreshGasPrice() {
        if (!this.provider) return;
        try {
            const endpoints = getRpcEndpoints();
            const queries = endpoints.slice(0, 3).map(url => {
                const prov = new ethers.JsonRpcProvider(url, 5042002, { staticNetwork: true });
                return Promise.race([
                    prov.getFeeData(),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
                ]);
            });
            const feeData = await Promise.any(queries).catch(() => ({
                maxFeePerGas: 400000000000n, maxPriorityFeePerGas: 200000000000n, gasPrice: 400000000000n
            }));
            this.cachedGasPrice = feeData.gasPrice;
            this.cachedPriorityFee = feeData.maxPriorityFeePerGas || feeData.maxFeePerGas;
            this.lastGasUpdate = Date.now();
        } catch (e) {
            console.warn('[Blockchain] Gas price fetch failed:', e.message);
        }
    }

    async _getGasPrice(options = {}) {
        const now = Date.now();
        if (options.force || !this.cachedGasPrice || (now - this.lastGasUpdate > this.GAS_CACHE_TTL)) {
            if (!this.gasRefreshPromise) {
                this.gasRefreshPromise = this._refreshGasPrice().finally(() => { this.gasRefreshPromise = null; });
            }
            await this.gasRefreshPromise;
        }
        const GAS_FLOOR = ethers.parseUnits("100", "gwei");
        let baseGas = this.cachedGasPrice || GAS_FLOOR;
        if (baseGas < GAS_FLOOR) baseGas = GAS_FLOOR;
        const priorityFee = this.cachedPriorityFee || ethers.parseUnits("100", "gwei");
        let maxFee = (baseGas * 45n / 10n) + (priorityFee * 15n / 10n);
        if (options.retryCount > 0) {
            maxFee = (maxFee * (100n + BigInt(options.retryCount * 25))) / 100n;
        }
        return { gasPrice: maxFee, maxFeePerGas: maxFee, maxPriorityFeePerGas: priorityFee };
    }

    async rotateRpc(failedRpc = null) {
        if (this.isRotating) return;
        this.isRotating = true;
        try {
            const newProvider = await createProvider(this);
            const pk = process.env.PRIVATE_KEY;
            this.provider = newProvider;
            this.wallet = new ethers.Wallet(pk, newProvider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
            this.providerReady = true;
            await this._resetNonce();
        } catch (e) { } finally { this.isRotating = false; }
    }

    _startConfirmationTracker() {
        setInterval(async () => {
            if (this.pendingTxs.size === 0) return;
            const staleThreshold = Date.now() - 60000;
            for (const [txHash, info] of this.pendingTxs) {
                if (info.sentAt < staleThreshold) {
                    this.pendingTxs.delete(txHash);
                    if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId);
                    continue;
                }
                try {
                    const receipt = await this.provider.getTransactionReceipt(txHash);
                    if (receipt) {
                        if (receipt.status === 1) {
                            this.confirmedTxs.add(info.betId);
                            if (this.onTxConfirmedCallback) this.onTxConfirmedCallback(info.betId);
                        } else {
                            if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId);
                        }
                        this.pendingTxs.delete(txHash);
                    }
                } catch (e) { }
            }
        }, 3000);
    }

    async settleBet(betId, exitPrice, retryCount = 0) {
        await this._ensureReady();
        const nonce = await nonceManager.getNonce(this.wallet.address, this.provider);
        const fees = await this._getGasPrice({ retryCount });
        try {
            const useContract = this.settleContract || this.contract;
            const settlementPriceBigInt = ethers.parseUnits(parseFloat(exitPrice).toFixed(8), 8);
            const tx = await Promise.race([
                useContract.settleBet(betId, settlementPriceBigInt, {
                    nonce, maxFeePerGas: fees.maxFeePerGas, maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
                    gasLimit: 800000n, type: 2, chainId: 5042002
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 45000))
            ]);
            this.pendingTxs.set(tx.hash, { betId: betId.toString(), sentAt: Date.now() });
            return { hash: tx.hash, status: 1 };
        } catch (e) {
            const msg = (e.message || "").toLowerCase();
            if (msg.includes('nonce') || msg.includes('underpriced') || msg.includes('already') || msg.includes('limit')) {
                await this._getGasPrice({ force: true });
                await this._resetNonce();
                await this.rotateRpc();
            }
            if (msg.includes('already settled')) return { status: 1, alreadySettled: true };
            throw e;
        }
    }

    onBetPlaced(cb) { this.onBetPlacedCallback = cb; }
    onTxConfirmed(cb) { this.onTxConfirmedCallback = cb; }
    onTxFailed(cb) { this.onTxFailedCallback = cb; }

    async getPastEvents(eventName, fromBlock, toBlock = null) {
        await this._ensureReady();
        try {
            const currentBlock = toBlock || await this.provider.getBlockNumber();
            let allEvents = [];
            let startBlock = fromBlock;
            while (startBlock <= currentBlock) {
                const endBlock = Math.min(startBlock + 999, currentBlock);
                try {
                    const events = await this.contract.queryFilter(eventName, startBlock, endBlock);
                    allEvents = allEvents.concat(events);
                } catch (e) {
                    await this.rotateRpc();
                    const events = await this.contract.queryFilter(eventName, startBlock, endBlock);
                    allEvents = allEvents.concat(events);
                }
                startBlock += 1000;
            }
            return allEvents;
        } catch (e) { return []; }
    }

    async getNativeBalance(address) {
        const endpoints = getRpcEndpoints();
        const queries = endpoints.map(async (url) => {
            try {
                const p = new ethers.JsonRpcProvider(url, 5042002, { staticNetwork: true });
                const b = await Promise.race([
                    p.getBalance(address),
                    new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 8000))
                ]);
                return BigInt(b);
            } catch (e) {
                return 0n;
            }
        });

        const results = await Promise.all(queries);
        const maxBalance = results.reduce((max, curr) => (curr > max ? curr : max), 0n);
        
        const logData = results.map((b, i) => `${endpoints[i].split('.')[1] || 'rpc'}: ${ethers.formatEther(b)}`).join(' | ');
        console.log(`[Blockchain] Balance Audit for ${address.slice(0,8)}: ${logData} (Adopted Max: ${ethers.formatEther(maxBalance)})`);

        // Final fallback to the primary provider if all racing queries were somehow zero but the main node might know better
        if (maxBalance === 0n) {
            return await this.provider.getBalance(address).catch(() => 0n);
        }
        return maxBalance;
    }
}

module.exports = new BlockchainService();

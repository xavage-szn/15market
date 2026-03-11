const { ethers, FetchRequest } = require('ethers');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const nonceManager = require('./nonceManager');

// DNS: Using system DNS resolution (no hardcoded IP overrides)
// The previous static IP patch (64.130.40.38) was causing 502 Bad Gateway on Railway
// because the Arc RPC node IPs rotate. Let the OS resolve DNS dynamically.

// Local logToFile for settlement confirmation tracking
const fs = require('fs');
const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}
const getRpcEndpoints = () => {
    const clientId = process.env.THIRDWEB_CLIENT_ID;
    const thirdwebUrl = clientId
        ? `https://5042002.rpc.thirdweb.com/${clientId}`
        : "https://5042002.rpc.thirdweb.com";

    return [
        thirdwebUrl,
        "https://rpc.testnet.arc.network"
    ];
};

async function createProvider(blockchainService) {
    const endpoints = getRpcEndpoints();
    const currentRpcs = blockchainService?.lastGoodRpc
        ? [blockchainService.lastGoodRpc, ...endpoints.filter(r => r !== blockchainService.lastGoodRpc)]
        : endpoints;

    console.log(`[Blockchain] Initializing provider with ${currentRpcs.length} endpoints...`);
    for (const rpc of currentRpcs) {
        try {
            console.log(`[Blockchain] Trying RPC: ${rpc}...`);
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 7000;

            if (rpc.includes('thirdweb.com')) {
                if (process.env.THIRDWEB_SECRET_KEY) {
                    fetchReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
                }
                if (process.env.THIRDWEB_CLIENT_ID) {
                    fetchReq.setHeader("x-client-id", process.env.THIRDWEB_CLIENT_ID);
                }
            }

            const network = ethers.Network.from(5042002);
            const provider = new ethers.JsonRpcProvider(fetchReq, network, { staticNetwork: true });

            // Race getBlockNumber against a 5s timeout
            const block = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 5000))
            ]);

            console.log(`[Blockchain] ✅ Connected to RPC: ${rpc} (Block: ${block})`);
            if (blockchainService) blockchainService.lastGoodRpc = rpc;
            return provider;
        } catch (e) {
            console.warn(`[Blockchain] ⚠️ RPC failed: ${rpc} — ${e.message}`);
        }
    }
    const fallbackReq = new FetchRequest(endpoints[0]);
    if (endpoints[0].includes('thirdweb.com')) {
        if (process.env.THIRDWEB_SECRET_KEY) fallbackReq.setHeader("x-secret-key", process.env.THIRDWEB_SECRET_KEY);
        if (process.env.THIRDWEB_CLIENT_ID) fallbackReq.setHeader("x-client-id", process.env.THIRDWEB_CLIENT_ID);
    }
    fallbackReq.timeout = 15000;
    return new ethers.JsonRpcProvider(fallbackReq, ethers.Network.from(5042002), { staticNetwork: true });
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

        // ===== GAS CACHE & DEDUP =====
        this.lastGasUpdate = 0;
        this.cachedGasPrice = null;
        this.GAS_CACHE_TTL = 5000;
        this.gasRefreshPromise = null;

        // ===== TX CONFIRMATION TRACKING =====
        this.pendingTxs = new Map();
        this.confirmedTxs = new Set();

        this.abi = [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function bets(uint256) view returns (address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 settlementPrice, uint256 duration, uint256 timestamp, uint8 marketId, bool settled)",
            "function owner() view returns (address)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];

        this._init().catch(e => {
            console.error('[Blockchain] ❌ Critical Initialization Error:', e.message);
        });
    }

    async _init() {
        this.provider = await createProvider(this);
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
        this.providerReady = true;

        this._refreshGasPrice();
        this._setupListeners();
        this._startConfirmationTracker();

        console.log(`[Blockchain] Ready. Wallet: ${this.wallet.address}`);
    }

    async _startEventPolling() {
        if (!this.contract) return;
        let lastLoggedBlock = await this.provider.getBlockNumber();
        console.log(`[Blockchain] 🛰️ Starting robust event polling from block ${lastLoggedBlock}...`);

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
                            if (normalizedEntry > 100000000) {
                                normalizedEntry = normalizedEntry / 1e8;
                            }

                            this.onBetPlacedCallback({
                                id: id.toString(),
                                user: user,
                                amount: ethers.formatEther(amount),
                                direction: Number(direction),
                                entryPrice: normalizedEntry.toFixed(4),
                                duration: Number(duration),
                                timestamp: Number(timestamp),
                                marketId: Number(marketId),
                                transactionHash: event.transactionHash
                            });
                        }
                    } catch (innerError) {
                        console.error('[Blockchain] Event processing error:', innerError.message);
                    }
                }

                lastLoggedBlock = currentBlock;
            } catch (e) {
                if (e.message && !e.message.toLowerCase().includes("timeout")) {
                    console.warn('[Blockchain] Event poll warning:', e.message);
                }
            }
        }, 5000);
    }

    _setupListeners() {
        this._startEventPolling();
    }

    async _ensureReady() {
        if (this.providerReady) return;
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (this.providerReady) return;
        }
        throw new Error('Blockchain provider not ready');
    }

    async _resetNonce() {
        console.warn('[Blockchain] ⚠️ Resetting nonce from chain...');
        try {
            await nonceManager.syncWithChain(this.wallet.address, this.provider);
        } catch (e) {
            console.error('[Blockchain] Failed to reset nonce:', e.message);
        }
    }

    async _refreshGasPrice() {
        try {
            const feeData = await this.provider.getFeeData();
            this.cachedGasPrice = feeData.gasPrice;
            this.cachedPriorityFee = feeData.maxPriorityFeePerGas;
            this.lastGasUpdate = Date.now();
        } catch (e) {
            console.warn('[Blockchain] Gas price fetch failed:', e.message);
        }
    }

    async _getGasPrice() {
        const now = Date.now();
        if (!this.cachedGasPrice || (now - this.lastGasUpdate > this.GAS_CACHE_TTL)) {
            // Dedup concurrent requests
            if (!this.gasRefreshPromise) {
                this.gasRefreshPromise = this._refreshGasPrice().finally(() => {
                    this.gasRefreshPromise = null;
                });
            }
            await this.gasRefreshPromise;
        }

        const baseGas = this.cachedGasPrice || ethers.parseUnits("10", "gwei");
        const priorityFee = this.cachedPriorityFee || ethers.parseUnits("150", "gwei");

        // Aggressive Strategy: 3.5x base + higher priority to ensure inclusion on Arc Testnet
        const maxFee = (baseGas * 35n / 10n) + priorityFee;
        const minGasFee = ethers.parseUnits("200", "gwei"); // Increased floor for reliability

        const finalGasPrice = maxFee > minGasFee ? maxFee : minGasFee;

        return {
            gasPrice: finalGasPrice,
            maxFeePerGas: finalGasPrice,
            maxPriorityFeePerGas: priorityFee
        };
    }

    async rotateRpc() {
        if (this.isRotating) return;
        this.isRotating = true;

        try {
            console.warn('[Blockchain] 🔄 Congestion detected. Background rotating RPC endpoints...');
            const newProvider = await createProvider(this);
            const newWallet = new ethers.Wallet(process.env.PRIVATE_KEY, newProvider);
            const newContract = new ethers.Contract(this.contractAddress, this.abi, newWallet);

            // Atomic swap to avoid race conditions or provider becoming null
            this.provider = newProvider;
            this.wallet = newWallet;
            this.contract = newContract;

            console.log(`[Blockchain] ✅ RPC rotated and service updated.`);
            await this._resetNonce();
        } catch (e) {
            console.error(`[Blockchain] ❌ RPC rotation failed: ${e.message}`);
        } finally {
            this.isRotating = false;
        }
    }

    _startConfirmationTracker() {
        setInterval(async () => {
            if (this.pendingTxs.size === 0) return;

            const staleThreshold = Date.now() - 60000;
            for (const [txHash, info] of this.pendingTxs) {
                if (info.sentAt < staleThreshold) {
                    console.warn(`[Blockchain] ⏰ TX ${txHash} (bet ${info.betId}) timed out after 60s`);
                    this.pendingTxs.delete(txHash);
                    if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId.toString());
                    continue;
                }

                try {
                    const receipt = await this.provider.getTransactionReceipt(txHash);
                    if (receipt) {
                        if (receipt.status === 1) {
                            console.log(`[Blockchain] ✅ Background confirmed: ${txHash} for bet ${info.betId}`);
                            logToFile(`[Blockchain] ✅ Background confirmed: ${txHash} for bet ${info.betId}. Block ${receipt.blockNumber}, GasUsed: ${receipt.gasUsed?.toString()}`);
                            this.confirmedTxs.add(info.betId.toString());
                            if (this.onTxConfirmedCallback) this.onTxConfirmedCallback(info.betId.toString());
                        } else {
                            console.warn(`[Blockchain] ❌ TX reverted on-chain: ${txHash} for bet ${info.betId}`);
                            logToFile(`[Blockchain] ❌ TX reverted on-chain: ${txHash} for bet ${info.betId}. Possible gas issues or logic fail.`);
                            if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId.toString());
                        }
                        this.pendingTxs.delete(txHash);
                    }
                } catch (e) { }
            }
        }, 3000);
    }

    async settleBet(betId, exitPrice) {
        await this._ensureReady();

        const nonce = await nonceManager.getNonce(this.wallet.address, this.provider);
        const fees = await this._getGasPrice();

        console.log(`[Blockchain] ⚡ Sending (Nonce: ${nonce}, Gas: ${ethers.formatUnits(fees.gasPrice, 'gwei')} gwei) - Bet ${betId}`);

        try {
            // SCALE FIX: Entry price is stored at 10^8 precision. Exit price must match.
            const settlementPriceBigInt = ethers.parseUnits(parseFloat(exitPrice).toFixed(8), 8);

            const tx = await this.contract.settleBet(betId, settlementPriceBigInt, {
                nonce: nonce,
                maxFeePerGas: fees.maxFeePerGas,
                maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
                gasLimit: 800000n, // Increased back for complex settlements with multiple payouts
                type: 2, // EIP-1559
                chainId: 5042002
            });

            console.log(`[Blockchain] 🚀 TX Sent: ${tx.hash} for bet ${betId}`);
            this.pendingTxs.set(tx.hash, { betId: betId.toString(), sentAt: Date.now() });
            return { hash: tx.hash, status: 1 };

        } catch (e) {
            console.error(`[Blockchain] ❌ SettleBet Error for ${betId}:`, e.message);
            const msg = (e.message || "").toLowerCase();
            const fullError = JSON.stringify(e).toLowerCase();

            if (msg.includes('nonce') || msg.includes('underpriced') || msg.includes('already been used') || msg.includes('replacement') || msg.includes('too low')) {
                await this._resetNonce();
            }

            if (msg.includes('txpool is full') || msg.includes('timeout') || msg.includes('limit reached') ||
                msg.includes('too many requests') || msg.includes('429') ||
                fullError.includes('txpool is full') || fullError.includes('timeout') || fullError.includes('rate limit')) {
                console.warn(`[Blockchain] ⏳ RPC Overloaded or Rate Limited for bet ${betId}. Rotating nodes...`);
                // Force rotation to a fresh node
                await this.rotateRpc();
            }

            if (msg.includes('already settled')) {
                console.log(`[Blockchain] ℹ️ Bet ${betId} was already settled. Treating as success.`);
                return { status: 1, alreadySettled: true };
            }

            throw e;
        }
    }

    async getNativeBalance(address) {
        await this._ensureReady();
        return await this.provider.getBalance(address);
    }

    onBetPlaced(callback) {
        this.onBetPlacedCallback = callback;
    }

    onTxConfirmed(callback) {
        this.onTxConfirmedCallback = callback;
    }

    onTxFailed(callback) {
        this.onTxFailedCallback = callback;
    }

    async getCurrentBlock() {
        await this._ensureReady();
        return await this.provider.getBlockNumber();
    }

    async getPastEvents(eventName, fromBlock, toBlock = null) {
        await this._ensureReady();
        try {
            const currentBlock = toBlock || await this.provider.getBlockNumber();
            console.log(`[Blockchain] 🔍 Scanning past events: ${eventName} from block ${fromBlock} to ${currentBlock}`);
            let allEvents = [];
            let startBlock = fromBlock;
            const chunk = 5000; // Smaller chunk for stability

            while (startBlock <= currentBlock) {
                const endBlock = Math.min(startBlock + chunk - 1, currentBlock);
                let retries = 3;
                let success = false;

                while (retries > 0 && !success) {
                    try {
                        const events = await this.contract.queryFilter(eventName, startBlock, endBlock);
                        allEvents = allEvents.concat(events);
                        success = true;
                    } catch (e) {
                        retries--;
                        console.warn(`[Blockchain] ⚠️ Chunk fetch failed for ${eventName} [${startBlock}-${endBlock}]. Retries left: ${retries}. Error: ${e.message}`);
                        if (retries === 0) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                startBlock += chunk;
            }
            return allEvents;
        } catch (e) {
            console.error(`[Blockchain] ❌ Error querying past events ${eventName}:`, e.message);
            return [];
        }
    }

    async isBetSettled(betId) {
        try {
            const onChainBet = await this.contract.bets(betId);
            return onChainBet.settled;
        } catch (e) {
            return false;
        }
    }
}

module.exports = new BlockchainService();

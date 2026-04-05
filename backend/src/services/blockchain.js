const { ethers, FetchRequest } = require('ethers');
const dns = require('dns');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env') });
const vault = require('./vault');
const nonceManager = require('./nonceManager');

// DNS: Using system DNS resolution (no hardcoded IP overrides)
// The previous static IP patch (64.130.40.38) was causing 502 Bad Gateway
// because the Arc RPC node IPs rotate. Let the OS resolve DNS dynamically.

// Local logToFile for settlement confirmation tracking
const fs = require('fs');
const LOG_FILE = path.join(__dirname, '..', '..', 'settlement_activity.log');
function logToFile(msg) {
    const entry = `[${new Date().toISOString()}] ${msg}\n`;
    fs.appendFile(LOG_FILE, entry, () => { });
}
const getRpcEndpoints = () => {
    // Official ARC RPCs as they proved most reliable
    return [
        "https://rpc.testnet.arc.network",
        "https://arc-testnet.alt.technology",
        "https://arc-testnet.drpc.org",
        "https://rpc.drpc.testnet.arc.network"
    ];
};

async function createProvider(blockchainService) {
    const endpoints = getRpcEndpoints();
    let currentRpcs = endpoints;

    if (currentRpcs.length > 1 && blockchainService?.lastGoodRpc) {
        // When rotating, we move the last good rpc to the END
        const others = endpoints.filter(r => r !== blockchainService.lastGoodRpc);
        currentRpcs = [...others, blockchainService.lastGoodRpc];
    }

    console.log(`[Blockchain] Initializing provider with ${currentRpcs.length} endpoints...`);
    for (const rpc of currentRpcs) {
        try {
            console.log(`[Blockchain] Trying RPC: ${rpc}...`);
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 10000; // Faster timeout for rotation
            
            const network = ethers.Network.from(5042002);
            const provider = new ethers.JsonRpcProvider(fetchReq, network, {
                staticNetwork: true,
                batchMaxCount: 1
            });

            // Race getBlockNumber against a 3s timeout for faster rotation
            const block = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
            ]);

            console.log(`[Blockchain] Connected: ${rpc} (Block: ${block})`);
            if (blockchainService) blockchainService.lastGoodRpc = rpc;
            return provider;
        } catch (e) {
            console.warn(`[Blockchain] RPC failed: ${rpc} - ${e.message}`);
            if (currentRpcs.length === 1) {
                console.log("[Blockchain] Only one RPC available, waiting 2s...");
                await new Promise(r => setTimeout(r, 2000));
            }
        }
    }

    // Last ditch effort: use the first endpoint
    const fallbackReq = new FetchRequest(endpoints[0]);
    fallbackReq.timeout = 30000;
    return new ethers.JsonRpcProvider(fallbackReq, ethers.Network.from(5042002), { staticNetwork: true, batchMaxCount: 1 });
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
            "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
            "function owner() view returns (address)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];

        this._init().catch(e => {
            console.error('[Blockchain] Init error:', e.message);
        });
    }

        try {
            this.provider = await createProvider(this);
            const pk = vault.get('PRIVATE_KEY');
            if (!pk) {
                console.error('================================================================');
                console.error('[Vault] CRITICAL: PRIVATE_KEY decryption FAILED.');
                console.error('[Vault] This usually means your SYSTEM_PASSPHRASE or Machine Seed');
                console.error('[Vault] (from Render.com or Local MAC) does not match the one used');
                console.error('[Vault] to encrypt the key in your .env file.');
                console.error('================================================================');
                throw new Error('Vault Decryption Failure');
            }
            
            this.wallet = new ethers.Wallet(pk, this.provider);
            this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);

            const bestRpc = this.lastGoodRpc || getRpcEndpoints()[0];
            const fetchReq = new FetchRequest(bestRpc);
            this.settleProvider = new ethers.JsonRpcProvider(fetchReq, ethers.Network.from(5042002), { staticNetwork: true });
            
            const settlePk = vault.get('PRIVATE_KEY');
            this.settleWallet = new ethers.Wallet(settlePk, this.settleProvider);
            this.settleContract = new ethers.Contract(this.contractAddress, this.abi, this.settleWallet);

            this.providerReady = true;
            console.log(`[Blockchain] Ready. Wallet: ${this.wallet.address}`);
        } catch (e) {
            console.error('[Blockchain] Initialization FAILED:', e.message);
            // We set providerReady to false explicitly to ensure the app stays in safe mode
            this.providerReady = false; 
        }

        this._refreshGasPrice();
        this._setupListeners();
        this._startConfirmationTracker();

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
                            if (normalizedEntry > 100000000) {
                                normalizedEntry = normalizedEntry / 1e8;
                            }

                            this.onBetPlacedCallback({
                                id: id.toString(),
                                user: user,
                                amount: ethers.formatEther(amount),
                                direction: Number(direction),
                                entryPrice: normalizedEntry.toFixed(8),
                                duration: Number(duration),
                                timestamp: Number(timestamp),
                                marketId: Number(marketId),
                                transactionHash: event.transactionHash
                            }).catch(err => {
                                console.error(`[Blockchain] Callback error for bet ${id}:`, err.message);
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
        console.warn('[Blockchain] Resetting nonce...');
        try {
            await nonceManager.syncWithChain(this.wallet.address, this.provider);
        } catch (e) {
            console.error('[Blockchain] Failed to reset nonce:', e.message);
        }
    }

    async _refreshGasPrice() {
        if (!this.provider) return;
        try {
            const feeData = await Promise.race([
                this.provider.getFeeData(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Gas Fetch Timeout")), 5000))
            ]);
            this.cachedGasPrice = feeData.gasPrice;
            this.cachedPriorityFee = feeData.maxPriorityFeePerGas;
            this.lastGasUpdate = Date.now();
        } catch (e) {
            console.warn('[Blockchain] Gas price fetch failed:', e.message);
        }
    }

    async _getGasPrice(options = {}) {
        const now = Date.now();
        const force = options.force === true;

        if (force || !this.cachedGasPrice || (now - this.lastGasUpdate > this.GAS_CACHE_TTL)) {
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

        // Aggressive Strategy: 4x base + higher priority to ensure inclusion on Arc Testnet
        let maxFee = (baseGas * 40n / 10n) + (priorityFee * 12n / 10n);
        const minGasFee = ethers.parseUnits("50", "gwei"); // Lowered floor to prevent gas exhaustion

        // RETRY SCALING: If this is a retry, bump gas aggressively (+20% per attempt)
        if (options.retryCount > 0) {
            const bumpFactor = 100n + BigInt(options.retryCount * 20);
            maxFee = (maxFee * bumpFactor) / 100n;
            console.log(`[Blockchain] Gas bump retry ${options.retryCount}: ${ethers.formatUnits(maxFee, 'gwei')} gwei`);
        }

        const finalGasPrice = maxFee > minGasFee ? maxFee : minGasFee;

        return {
            gasPrice: finalGasPrice,
            maxFeePerGas: finalGasPrice,
            maxPriorityFeePerGas: priorityFee > (finalGasPrice / 2n) ? finalGasPrice / 2n : priorityFee
        };
    }

    async rotateRpc(failedRpc = null) {
        if (this.isRotating) return;
        this.isRotating = true;

        if (!failedRpc && this.lastGoodRpc) {
            failedRpc = this.lastGoodRpc;
        }

        try {
            console.warn(`[Blockchain] Rotating RPC from ${failedRpc || 'current'}...`);
            // If we have a failed RPC, we should ensure the next provider attempt doesn't prioritize it
            const newProvider = await createProvider(this);
            const pk = vault.get('PRIVATE_KEY');
            const newWallet = new ethers.Wallet(pk, newProvider);
            const newContract = new ethers.Contract(this.contractAddress, this.abi, newWallet);


            this.provider = newProvider;
            this.wallet = newWallet;
            this.contract = newContract;
            this.providerReady = true;

            console.log(`[Blockchain] RPC rotated to: ${this.lastGoodRpc}`);
            logToFile(`RPC switched to: ${this.lastGoodRpc}`);
            await this._resetNonce();
        } catch (e) {
            console.error(`[Blockchain] RPC rotation failed: ${e.message}`);
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
                    console.warn(`[Blockchain] TX ${txHash} (bet ${info.betId}) timed out`);
                    this.pendingTxs.delete(txHash);
                    if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId.toString());
                    continue;
                }

                try {
                    const receipt = await this.provider.getTransactionReceipt(txHash);
                    if (receipt) {
                        if (receipt.status === 1) {
                            console.log(`[Blockchain] Confirmed: ${txHash} bet ${info.betId}`);
                            logToFile(`Confirmed: ${txHash} bet ${info.betId} Block ${receipt.blockNumber}`);
                            this.confirmedTxs.add(info.betId.toString());
                            if (this.onTxConfirmedCallback) this.onTxConfirmedCallback(info.betId.toString());
                        } else {
                            console.warn(`[Blockchain] TX reverted: ${txHash} bet ${info.betId}`);
                            logToFile(`TX reverted: ${txHash} bet ${info.betId}`);
                            if (this.onTxFailedCallback) this.onTxFailedCallback(info.betId.toString());
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
            console.log(`[Blockchain] Sending (Nonce: ${nonce}, Gas: ${ethers.formatUnits(fees.gasPrice, 'gwei')} gwei) Bet ${betId}`);

            const useContract = this.settleContract || this.contract;
            const settlementPriceBigInt = ethers.parseUnits(parseFloat(exitPrice).toFixed(8), 8);

            const tx = await Promise.race([
                useContract.settleBet(betId, settlementPriceBigInt, {
                    nonce: nonce,
                    maxFeePerGas: fees.maxFeePerGas,
                    maxPriorityFeePerGas: fees.maxPriorityFeePerGas,
                    gasLimit: 800000n,
                    type: 2, // EIP-1559
                    chainId: 5042002
                }),
                new Promise((_, reject) => setTimeout(() => reject(new Error("RPC Broadcast TIMEOUT (45s)")), 45000))
            ]);

            console.log(`[Blockchain] TX sent: ${tx.hash} bet ${betId}`);
            this.pendingTxs.set(tx.hash, { betId: betId.toString(), sentAt: Date.now() });
            return { hash: tx.hash, status: 1 };

        } catch (e) {
            console.error(`[Blockchain] SettleBet error for ${betId}:`, e.message);
            const msg = (e.message || "").toLowerCase();
            const fullError = JSON.stringify(e).toLowerCase();

            // REPLACEMENT_UNDERPRICED or Nonce issues
            if (msg.includes('nonce') || msg.includes('underpriced') || msg.includes('already been used') || msg.includes('replacement') || msg.includes('too low') || msg.includes('txpool is full') || fullError.includes('txpool is full')) {
                // Force a clean state refresh for the next attempt
                await this._getGasPrice({ force: true });
                await this._resetNonce();
            }

            if (msg.includes('txpool is full') || msg.includes('timeout') || msg.includes('limit reached') ||
                msg.includes('too many requests') || msg.includes('429') ||
                fullError.includes('txpool is full') || fullError.includes('timeout') || fullError.includes('rate limit')) {
                const rotationMsg = (getRpcEndpoints().length > 1) ? ". Rotating nodes..." : ". Waiting for congestion to clear...";
                console.warn(`[Blockchain] RPC overloaded for bet ${betId}${rotationMsg}`);
                // Force rotation to a fresh node, explicitly deprioritizing the one that just failed
                await this.rotateRpc(this.lastGoodRpc);
            }

            if (msg.includes('already settled')) {
                console.log(`[Blockchain] Bet ${betId} already settled.`);
                return { status: 1, alreadySettled: true };
            }

            throw e;
        }
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
            console.log(`[Blockchain] Scanning: ${eventName} ${fromBlock}-${currentBlock}`);
            let allEvents = [];
            let startBlock = fromBlock;
            const chunk = 1000; // Even smaller chunk for unstable Arc nodes

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
                        console.warn(`[Blockchain] Chunk fetch failed ${eventName} [${startBlock}-${endBlock}]. Retries: ${retries}`);
                        if (retries === 0) throw e;
                        await new Promise(r => setTimeout(r, 1000));
                    }
                }
                startBlock += chunk;
            }
            return allEvents;
        } catch (e) {
            console.error(`[Blockchain] Event query error ${eventName}:`, e.message);
            // AUTO RECOVERY: If a scan fails, rotate RPC to ensure next scan has a fresh node
            if (e.message.includes('timeout') || e.message.includes('retry') || e.message.includes('limit')) {
                this.rotateRpc(this.lastGoodRpc);
            }
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

    async getNativeBalance(address) {
        try {
            await this._ensureReady();
            const balance = await Promise.race([
                this.provider.getBalance(address),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Balance Fetch Timeout")), 5000))
            ]);
            return balance;
        } catch (e) {
            console.warn(`[Blockchain] Balance check failed for ${address}: ${e.message}`);
            if (e.message.includes('Timeout')) {
                this.rotateRpc();
            }
            return 0n;
        }
    }
}

module.exports = new BlockchainService();

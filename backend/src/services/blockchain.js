const { ethers, FetchRequest } = require('ethers');
const dns = require('dns');
require('dotenv').config();

// Apply DNS Patch for Arc RPC resolution issues
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'rpc.testnet.arc.network' || hostname === 'rpc-test-1.arc.market') {
        const ip = '64.130.40.38';
        if (options && options.all) {
            return callback(null, [{ address: ip, family: 4 }]);
        }
        return callback(null, ip, 4);
    }
    return originalLookup(hostname, options, callback);
};

const RPC_ENDPOINTS = [
    "https://5042002.rpc.thirdweb.com",      // Thirdweb (most reliable)
    "https://rpc.testnet.arc.network",
    "https://rpc-test-1.arc.market",
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
];

async function createProvider() {
    console.log(`[Blockchain] Initializing provider with ${RPC_ENDPOINTS.length} endpoints...`);
    for (const rpc of RPC_ENDPOINTS) {
        try {
            console.log(`[Blockchain] Trying RPC: ${rpc}...`);
            const fetchReq = new FetchRequest(rpc);
            fetchReq.timeout = 15000; // 15 second timeout

            const network = ethers.Network.from(5042002);
            const provider = new ethers.JsonRpcProvider(fetchReq, network, { staticNetwork: true });

            // Race getBlockNumber against a 10s timeout
            const block = await Promise.race([
                provider.getBlockNumber(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 10000))
            ]);

            console.log(`[Blockchain] ✅ Connected to RPC: ${rpc} (Block: ${block})`);
            return provider;
        } catch (e) {
            console.warn(`[Blockchain] ⚠️ RPC failed: ${rpc} — ${e.message}`);
        }
    }
    // Fall back to first endpoint and let it retry
    console.warn('[Blockchain] ❌ All RPCs failed, using first as fallback');
    const fallbackReq = new FetchRequest(RPC_ENDPOINTS[0]);
    fallbackReq.timeout = 15000;
    const networkFallback = ethers.Network.from(5042002);
    return new ethers.JsonRpcProvider(fallbackReq, networkFallback, { staticNetwork: true });
}

class BlockchainService {
    constructor() {
        this.providerReady = false;
        this.provider = null;
        this.wallet = null;
        this.contract = null;
        this.contractAddress = process.env.ARC_CONTRACT_ADDRESS;
        this.currentNonce = null;
        this.nonceLock = false;
        this.lastGasUpdate = 0;
        this.cachedGasPrice = null;

        this.abi = [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function bets(uint256) view returns (address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 settlementPrice, uint256 duration, uint256 timestamp, uint8 marketId, bool settled)",
            "function owner() view returns (address)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];

        // Initialize async - handle errors to prevent process crash
        this._init().catch(e => {
            console.error('[Blockchain] ❌ Critical Initialization Error:', e.message);
        });
    }

    async _init() {
        this.provider = await createProvider();
        this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(this.contractAddress, this.abi, this.wallet);
        this.providerReady = true;

        // Auto-setup listeners once contract is ready
        this._setupListeners();

        console.log(`[Blockchain] Ready. Wallet: ${this.wallet.address}`);
    }

    _setupListeners() {
        if (!this.contract) return;
        console.log('[Blockchain] 🛰️ Subscribing to on-chain BetPlaced events...');

        // Ethers v6: (betId, user, amount, direction, ...)
        this.contract.on("BetPlaced", async (id, user, amount, direction, entryPrice, duration, timestamp, marketId, event) => {
            try {
                if (this.onBetPlacedCallback) {
                    let normalizedEntry = Number(entryPrice);
                    if (normalizedEntry > 100000000) {
                        normalizedEntry = normalizedEntry / 1e8;
                    }

                    this.onBetPlacedCallback({
                        id: id.toString(),
                        user: user,
                        amount: ethers.formatEther(amount), // Convert Wei to Ether
                        direction: Number(direction), // 1 or 0
                        entryPrice: normalizedEntry.toFixed(4),
                        duration: Number(duration),
                        timestamp: Number(timestamp),
                        marketId: Number(marketId),
                        transactionHash: event.log.transactionHash
                    });
                }
            } catch (e) {
                console.error('[Blockchain] Event listener error:', e.message);
            }
        });
    }

    async _ensureReady() {
        if (this.providerReady) return;
        // Wait up to 10s for init
        for (let i = 0; i < 20; i++) {
            await new Promise(r => setTimeout(r, 500));
            if (this.providerReady) return;
        }
        throw new Error('Blockchain provider not ready');
    }

    async getNativeBalance(address) {
        await this._ensureReady();
        return await this.provider.getBalance(address);
    }

    async settleBet(betId, exitPrice) {
        await this._ensureReady();

        // Manual Nonce Management with locking
        if (this.currentNonce === null) {
            if (this.nonceLock) {
                // Wait for existing lock
                while (this.nonceLock) await new Promise(r => setTimeout(r, 50));
            } else {
                this.nonceLock = true;
                try {
                    this.currentNonce = await this.provider.getTransactionCount(this.wallet.address, 'pending');
                    console.log(`[Blockchain] Initialized nonce at ${this.currentNonce}`);
                } finally {
                    this.nonceLock = false;
                }
            }
        }

        const nonce = this.currentNonce++;

        try {
            // Gas caching for high-speed batches (1s TTL)
            const now = Date.now();
            if (!this.cachedGasPrice || (now - this.lastGasUpdate > 1000)) {
                const feeData = await this.provider.getFeeData();
                this.cachedGasPrice = feeData.gasPrice;
                this.lastGasUpdate = now;
            }
            const baseGas = this.cachedGasPrice || 1000000000n; // 1 Gwei fallback
            const gasPrice = (baseGas * BigInt(125)) / BigInt(100); // 25% priority for high speed

            console.log(`[Blockchain] ⚡ Parallel Sending (Nonce: ${nonce}, Gas: ${gasPrice ? ethers.formatUnits(gasPrice, 'gwei') : 'auto'} gwei) - Bet ${betId}`);

            const tx = await this.contract.settleBet(betId, ethers.parseUnits(exitPrice.toString(), 0), {
                nonce: nonce,
                gasPrice: gasPrice,
                gasLimit: 1000000n // Increased limit for complex settlements
            });

            console.log(`[Blockchain] 🚀 TX Sent: ${tx.hash} for bet ${betId}`);

            // Wait for confirmation with a 30s timeout (High performance expectation)
            const receipt = await Promise.race([
                tx.wait(),
                new Promise((_, reject) => setTimeout(() => reject(new Error("Confirmation Timeout")), 30000))
            ]);

            if (!receipt || receipt.status === 0) {
                // If the transaction reverted, we check the reason
                throw new Error(`Transaction reverted on-chain for bet ${betId}. Status: ${receipt?.status}`);
            }

            console.log(`[Blockchain] ✅ Confirmed: ${receipt.hash} (Status: ${receipt.status})`);
            return receipt;
        } catch (e) {
            // If we get a nonce-related error, we reset the nonce cache for the next attempt
            if (e.message.includes('nonce') || e.message.includes('underpriced') || e.message.includes('already been used')) {
                console.warn(`[Blockchain] ️ Nonce/Gas error detected. Resetting nonce cache. Error: ${e.message}`);
                this.currentNonce = null;
            }

            // Re-throw if it's not a "Already settled" error (which is technically a success from the keeper's perspective)
            if (e.message.includes('already settled')) {
                console.log(`[Blockchain] ℹ️ Bet ${betId} was already settled. Treating as success.`);
                return { status: 1, alreadySettled: true };
            }

            throw e;
        }
    }

    onBetPlaced(callback) {
        this.onBetPlacedCallback = callback;
    }

    async getCurrentBlock() {
        await this._ensureReady();
        return await this.provider.getBlockNumber();
    }

    async getPastEvents(eventName, fromBlock) {
        await this._ensureReady();
        try {
            console.log(`[Blockchain] 🔍 Scanning past events: ${eventName} from block ${fromBlock}`);
            const events = await this.contract.queryFilter(eventName, fromBlock);
            return events;
        } catch (e) {
            console.error(`[Blockchain] ❌ Error querying past events ${eventName}:`, e.message);
            return [];
        }
    }
}

module.exports = new BlockchainService();

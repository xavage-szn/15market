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
    "https://5042002.rpc.thirdweb.com",
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

        this.abi = [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId, address _payoutAddress) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
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
                    this.onBetPlacedCallback({
                        id: id.toString(),
                        user: user,
                        amount: amount.toString(),
                        direction: Number(direction), // 1 or 0
                        entryPrice: entryPrice.toString(),
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
        try {
            const tx = await this.contract.settleBet(betId, ethers.parseUnits(exitPrice.toString(), 0));
            console.log(`[Blockchain] Settling bet ${betId} at price ${exitPrice}. TX: ${tx.hash}`);
            const receipt = await tx.wait();

            // CRITICAL: ethers v6 tx.wait() can return a receipt with status=0 (reverted)
            // without throwing. We MUST check this explicitly, otherwise the processor
            // will think the settlement succeeded and delete the trade from Redis,
            // causing users to never receive their winnings.
            if (!receipt || receipt.status === 0) {
                throw new Error(`Transaction reverted on-chain for bet ${betId}. TX: ${tx.hash}`);
            }

            console.log(`[Blockchain] ✅ TX confirmed on-chain for bet ${betId}. Status: ${receipt.status}`);
            return receipt;
        } catch (e) {
            console.error(`[Blockchain] Failed to settle bet ${betId}:`, e.message);
            throw e;
        }
    }

    onBetPlaced(callback) {
        this.onBetPlacedCallback = callback;
    }
}

module.exports = new BlockchainService();

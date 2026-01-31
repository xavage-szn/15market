require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const aiArbiter = require('./ai_arbiter');

// ==========================================
// 🚨 DNS FIX: Monkey Patch for Arc RPC
// ==========================================
const dns = require('dns');
const originalLookup = dns.lookup;
dns.lookup = (hostname, options, callback) => {
    if (typeof options === 'function') {
        callback = options;
        options = {};
    }
    if (hostname === 'rpc.testnet.arc.network') {
        if (options && options.all) return callback(null, [{ address: '64.130.40.38', family: 4 }]);
        return callback(null, '64.130.40.38', 4);
    }
    return originalLookup(hostname, options, callback);
};

// ==========================================
// CONSTANTS & CONFIG
// ==========================================
const ARC_RPC_LIST = [
    process.env.ARC_RPC || "https://rpc.testnet.arc.network",
    "https://arc-testnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1"
];
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS || "0x2E8DC6aBd23fC5CCB75940C8D389D9DDB21eDb31";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const BRIDGE_PORT = process.env.BRIDGE_PORT || 3005;

const ASSET_MAP = {
    0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL', 6: 'LINK', 7: 'PEPE'
};

// ==========================================
// KEEPER CORE
// ==========================================
class ArcKeeper {
    constructor() {
        this.currentRpcIdx = 0;
        this.initProvider();

        this.activeBets = new Map();
        this.settlementQueue = [];
        this.lastCheckedBlock = 0;
        this.nonce = -1;
        this.isSettling = false;
        this.isRateLimited = false;

        this.startLogBridge();
    }

    initProvider() {
        const rpc = ARC_RPC_LIST[this.currentRpcIdx];
        this.provider = new ethers.JsonRpcProvider(rpc, undefined, { staticNetwork: true });
        this.wallet = new ethers.Wallet(PRIVATE_KEY, this.provider);
        this.contract = new ethers.Contract(CONTRACT_ADDRESS, this.getAbi(), this.wallet);
    }

    rotateRpc() {
        this.currentRpcIdx = (this.currentRpcIdx + 1) % ARC_RPC_LIST.length;
        this.log(`🔄 [NETWORK] Rotating Arc RPC to: ${ARC_RPC_LIST[this.currentRpcIdx]}`);
        this.initProvider();
    }

    getAbi() {
        return [
            "function placeBet(uint256 _betId, uint8 _direction, uint256 _duration, uint256 _entryPrice, uint8 _marketId) external payable",
            "function settleBet(uint256 _betId, uint256 _exitPrice) external",
            "function bets(uint256) view returns (uint256 id, address user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 timestamp, uint256 duration, uint8 marketId, uint256 settlementPrice, bool settled, bool won)",
            "event BetPlaced(uint256 indexed id, address indexed user, uint256 amount, uint8 direction, uint256 entryPrice, uint256 duration, uint256 timestamp, uint8 marketId)",
            "event BetSettled(uint256 indexed id, address indexed user, uint256 settlementPrice, bool won, uint256 payout)"
        ];
    }

    // --- RPC RESILIENCE WRAPPER ---
    async callWithRetry(fn, label = "RPC", retries = 5, delay = 2000) {
        for (let i = 0; i < retries; i++) {
            try {
                if (this.isRateLimited) await new Promise(r => setTimeout(r, 5000));
                return await fn();
            } catch (err) {
                const isLimit = err.message.includes("limit reached") || err.code === -32007 || err.code === -32005;
                const isQuota = err.message.includes("daily request limit") || err.code === -32003;

                if (isQuota) {
                    this.log(`🚨 [QUOTA_EXHAUSTED] Current RPC quota hit. Rotating...`);
                    this.rotateRpc();
                    continue; // Immediately retry with the new RPC
                }

                if (isLimit) {
                    this.isRateLimited = true;
                    this.log(`⚠️ [RATE_LIMIT] hit limit on current RPC. Cooling down... (Attempt ${i + 1}/${retries})`);
                    await new Promise(r => setTimeout(r, delay * (i + 1)));
                    continue;
                }
                if (i === retries - 1) throw err;
                await new Promise(r => setTimeout(r, delay));
            }
        }
    }

    startLogBridge() {
        const http = require('http');
        const server = http.createServer((req, res) => {
            res.setHeader('Access-Control-Allow-Origin', '*');
            if (req.url === '/logs') {
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify(global.logBuffer || []));
            } else {
                res.end();
            }
        });
        server.listen(BRIDGE_PORT, '0.0.0.0', () => this.log(`📡 Log Bridge active on port ${BRIDGE_PORT}`));
    }

    log(msg) {
        const entry = { time: new Date().toLocaleTimeString(), msg };
        console.log(`[${entry.time}] ${msg}`);
        if (!global.logBuffer) global.logBuffer = [];
        global.logBuffer.push(entry);
        if (global.logBuffer.length > 100) global.logBuffer.shift();
    }

    async init() {
        this.log("🚀 Initializing Frugal Arc Keeper v2.1...");

        try {
            const network = await this.callWithRetry(() => this.provider.getNetwork(), "INIT_NETWORK");
            this.log(`✅ Connected to Chain ID: ${network.chainId}`);

            this.nonce = await this.callWithRetry(() => this.wallet.getNonce(), "INIT_NONCE");
            this.log(`🔢 Initial Nonce: ${this.nonce}`);

            await this.discoverActiveBets();

            // Loop 1: Relaxed Event Polling (Every 10s)
            setInterval(() => this.pollEvents(), 10000);

            // Loop 2: Settlement Evaluator (Every 3s)
            setInterval(() => this.evaluateBets(), 3000);

            // Loop 3: Queue Processor (Every 2s)
            setInterval(() => this.processSettlementQueue(), 2000);

            // Loop 4: Background Price Warmer (Every 15s)
            setInterval(() => this.refreshPrices(), 15000);

            // Heartbeat for logs
            setInterval(() => this.log(`💓 [HEARTBEAT] Arc Keeper is alive | Tracking: ${this.activeBets.size} | Queue: ${this.settlementQueue.length}`), 30000);

            // Clear Rate Limit Flag Periodically
            setInterval(() => { this.isRateLimited = false; }, 30000);

        } catch (err) {
            this.log(`❌ Critical Init Failure: ${err.message}`);
            setTimeout(() => process.exit(1), 5000);
        }
    }

    async reportToMonolith(data) {
        try {
            // Internal reporting to the main keeper's API
            await axios.post('http://127.0.0.1:8080/report-arc-trade', data, { timeout: 5000 });
        } catch (e) {
            // Backup reporting if internal fails
            try { await axios.post('https://admin.15market.online/report-arc-trade', data, { timeout: 5000 }); } catch (err) { }
        }
    }

    async refreshPrices() {
        // Only warm major assets to save API credits/bandwidth
        const warmList = ['BTC', 'ETH', 'SOL'];
        warmList.forEach(symbol => aiArbiter.confirmPrice(symbol));
    }

    async discoverActiveBets() {
        const currentBlock = await this.callWithRetry(() => this.provider.getBlockNumber(), "GET_BLOCK");
        const LOOKBACK = 10000; // Reduced lookback to be RPC-frugal
        const fromBlock = Math.max(0, currentBlock - LOOKBACK);

        this.log(`🔍 Scanning last ${LOOKBACK} blocks for active trades...`);

        try {
            const filter = this.contract.filters.BetPlaced();
            const events = await this.callWithRetry(() => this.contract.queryFilter(filter, fromBlock, currentBlock), "DISCOVERY_QUERY");

            this.log(`📊 Found ${events.length} historical events. Ingesting with throttling...`);

            for (const e of events) {
                await this.ingestBet(e, true);
                // Throttle ingestion to stay under 20 req/sec limit (100ms delay = 10 req/sec)
                await new Promise(r => setTimeout(r, 150));
            }
        } catch (err) {
            this.log(`⚠️ Discovery Query Failed: ${err.message}`);
        }

        this.lastCheckedBlock = currentBlock;
        this.log(`✅ Inventory check complete. Tracking ${this.activeBets.size} active bets.`);
    }

    async pollEvents() {
        try {
            const currentBlock = await this.callWithRetry(() => this.provider.getBlockNumber(), "POLL_BLOCK");
            if (currentBlock <= this.lastCheckedBlock) return;

            const filter = this.contract.filters.BetPlaced();
            const events = await this.callWithRetry(() => this.contract.queryFilter(filter, this.lastCheckedBlock + 1, currentBlock), "POLL_QUERY");

            for (const e of events) await this.ingestBet(e, false);

            this.lastCheckedBlock = currentBlock;
        } catch (err) {
            // Silently fail to keep logs clean
        }
    }

    async ingestBet(event, isHistorical = false) {
        const { id, user, amount, direction, entryPrice, duration, timestamp, marketId } = event.args;
        const betId = id.toString();

        if (this.activeBets.has(betId)) return;

        const expiry = Number(timestamp) + Number(duration);
        if (Date.now() / 1000 > expiry + 1800) return; // Ignore if expired > 30 mins ago

        try {
            const betStruct = await this.callWithRetry(() => this.contract.bets(id), `CHECK_BET_${betId}`, 2, 1000);
            if (betStruct.settled) return;

            const symbol = ASSET_MAP[marketId] || 'SOL';
            this.activeBets.set(betId, {
                id, user, symbol, duration: Number(duration),
                amount: ethers.formatEther(amount),
                direction: Number(direction),
                entryPrice: Number(entryPrice) / 100000000,
                expiry,
                processing: false
            });

            this.log(`📥 Tracked Bet #${betId} (${symbol}) [Expires: ${new Date(expiry * 1000).toLocaleTimeString()}]`);
        } catch (e) {
            // If we can't check status, skip for now. Polling will pick it up next time.
        }
    }

    async evaluateBets() {
        const now = Date.now() / 1000;
        let count = 0;
        for (const [id, bet] of this.activeBets) {
            if (bet.processing) continue;
            if (now >= bet.expiry) {
                bet.processing = true;
                this.settlementQueue.push(bet);
                count++;
            }
        }
        if (count > 0) this.log(`📋 Added ${count} expired bets to settlement queue.`);
    }

    async processSettlementQueue() {
        if (this.isSettling || this.settlementQueue.length === 0) return;
        this.isSettling = true;

        try {
            const batch = this.settlementQueue.splice(0, 5); // Reduced batch size for rate limit safety
            this.log(`⚡ Settling batch of ${batch.length}...`);

            const uniqueSymbols = [...new Set(batch.map(b => b.symbol))];
            const priceMap = {};

            await Promise.all(uniqueSymbols.map(async s => {
                const verdict = await aiArbiter.getResultVerdict(0, s);
                priceMap[s] = verdict.price;
            }));

            const txPromises = batch.map(async (bet) => {
                const exitPrice = priceMap[bet.symbol];
                if (!exitPrice) {
                    bet.processing = false;
                    this.settlementQueue.push(bet);
                    return;
                }

                const isWin = (bet.direction === 1 && exitPrice > bet.entryPrice) ||
                    (bet.direction === 0 && exitPrice < bet.entryPrice);

                try {
                    const priceParam = BigInt(Math.floor(exitPrice * 100000000));
                    const useNonce = this.nonce++;

                    // Use callWithRetry for the actual transaction send
                    const tx = await this.callWithRetry(() =>
                        this.contract.settleBet(bet.id, priceParam, {
                            nonce: useNonce,
                            gasLimit: 600000
                        }), `SEND_TX_${bet.id}`
                    );

                    this.log(`📤 [SENT] #${bet.id} (${isWin ? 'WIN' : 'LOSS'}) | TX: ${tx.hash.slice(0, 10)}...`);

                    tx.wait().then((receipt) => {
                        if (receipt.status === 1) {
                            this.log(`✅ [CONFIRMED] Bet #${bet.id}`);
                            this.activeBets.delete(bet.id.toString());

                            // Report to Monolith for UI update
                            this.reportToMonolith({
                                id: bet.id.toString(),
                                user: bet.user,
                                amount: bet.amount,
                                direction: bet.direction,
                                strike: bet.entryPrice,
                                final: exitPrice,
                                timestamp: bet.expiry,
                                won: isWin,
                                payout: isWin ? (parseFloat(bet.amount) * 1.98) : 0 // Simplified payout for reporting
                            });
                        }
                    }).catch(e => this.log(`❌ [FAILED] Bet #${bet.id} confirmation: ${e.message}`));

                } catch (txErr) {
                    this.log(`❌ [TX_ERROR] #${bet.id}: ${txErr.message}`);
                    bet.processing = false;
                    this.settlementQueue.push(bet);
                    // Resync nonce
                    this.nonce = await this.callWithRetry(() => this.wallet.getNonce(), "RESYNC_NONCE");
                }
            });

            await Promise.all(txPromises);
        } finally {
            this.isSettling = false;
        }
    }
}

new ArcKeeper().init();

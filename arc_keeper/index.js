require('dotenv').config();
const { ethers } = require('ethers');
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const aiArbiter = require('./ai_arbiter');
const logBridge = require('./log_bridge');

const DEBUG_LOG_PATH = path.join(__dirname, 'debug.log');
function logToFile(msg) {
    try { fs.appendFileSync(DEBUG_LOG_PATH, `[${new Date().toISOString()}] ${msg}\n`); } catch (e) { }
}

async function callWithRetry(fn, label = "RPC", retries = 5, delay = 2000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (e) {
            const isTimeout = e.code === 'TIMEOUT' || e.message?.toLowerCase().includes('timeout');
            if (i === retries - 1) throw e;
            console.warn(`⏳ [${label}] Retry ${i + 1}/${retries} after error: ${e.message}${isTimeout ? ' (TIMEOUT)' : ''}`);
            await new Promise(r => setTimeout(r, delay * Math.pow(2, i))); // Exponential backoff
        }
    }
}

// Configuration
const ARC_RPC = process.env.ARC_RPC || "https://rpc.testnet.arc.network";
const CONTRACT_ADDRESS = process.env.ARC_CONTRACT_ADDRESS || "0x041e80256b3C72a0e16d78753F28f14A40d78c08";
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const MIN_BET_ID = Number(process.env.MIN_BET_ID || 0);
const KEEPER_URL = "http://127.0.0.1:8080";
console.log(`🚀 Starting Arc Keeper with RPC: ${ARC_RPC} and Contract: ${CONTRACT_ADDRESS}`);

const ASSET_MAP = {
    0: 'BTC', 1: 'ETH', 2: 'MON', 3: 'JUP', 4: 'XRP', 5: 'SOL', 6: 'LINK', 7: 'PEPE'
};

// ABI
const artifactPath = path.join(__dirname, '../arc_prediction/artifacts/contracts/ArcPrediction.sol/ArcPrediction.json');
let ABI;
try {
    const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
    ABI = artifact.abi;
} catch (e) {
    console.error("Failed to load contract ABI");
    process.exit(1);
}

async function main() {
    if (!CONTRACT_ADDRESS || !PRIVATE_KEY || !ARC_RPC) {
        console.error("Missing config in .env");
        return;
    }

    const fetchRequest = new ethers.FetchRequest(ARC_RPC);
    fetchRequest.timeout = 150000; // Increased to 150 seconds for extreme testnet lag
    const arcNetwork = new ethers.Network("arc-testnet", 5042002);

    // Use robust provider - removed batchMaxCount: 1 to allow Ethers to optimize if possible
    const provider = new ethers.JsonRpcProvider(fetchRequest, arcNetwork, { staticNetwork: true });
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    let networkTime = Math.floor(Date.now() / 1000);
    async function syncNetworkTime() {
        try {
            const block = await callWithRetry(() => provider.getBlock('latest'), "SYNC_TIME", 3, 1000);
            if (block) networkTime = block.timestamp;
        } catch (e) { }
    }
    await syncNetworkTime();
    setInterval(syncNetworkTime, 10000); // Sync every 10s

    console.log("-----------------------------------------");
    console.log("Arc Keeper v4 (Multi-Asset) started...");
    console.log("Contract:", CONTRACT_ADDRESS);
    console.log("-----------------------------------------");

    const KEEPER_START_TIME = Math.floor(Date.now() / 1000);
    console.log(`🕒 [START_TIME] Monitoring bets placed after: ${new Date(KEEPER_START_TIME * 1000).toLocaleString()}`);

    let activeBets = new Map();
    let pendingWinningBets = new Map(); // Queue for winning bets awaiting funds
    let INITIAL_NEXT_BET_ID = 0; // Recorded at startup to ignore legacy bets
    let cachedArcMetrics = { totalVolume: 0, walletCount: 0 }; // Global scope for signal sharing
    let totalPlatformVolume = 0; // Cumulative Volume from Startup Scan
    let lastCheckedBlock;
    while (true) {
        try {
            console.log("⏳ Connecting to Arc RPC...");
            const [blockNum, nextId] = await Promise.all([
                callWithRetry(() => provider.getBlockNumber(), "CONNECT", 5, 2000),
                callWithRetry(() => contract.nextBetId(), "INIT_ID", 5, 2000)
            ]);
            lastCheckedBlock = blockNum;
            INITIAL_NEXT_BET_ID = Number(nextId);
            console.log(`✅ Connected. Current Block: ${lastCheckedBlock} | Starting from Bet ID: ${INITIAL_NEXT_BET_ID}`);
            break;
        } catch (e) {
            console.error(`❌ Connection failed: ${e.message}. Retrying in 5s...`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    async function performStartupVolumeScan() {
        try {
            const nextBetId = Number(await callWithRetry(() => contract.nextBetId(), "STARTUP_ID"));
            console.log(`📊 [STARTUP_SCAN] Calculating total volume across ${nextBetId} bets (background)...`);
            let volume = 0;
            const batchSize = 10; // Reduced from 25 to avoid timeouts
            const maxBatches = 10; // Limit to first 100 bets to prevent long delays
            let batchCount = 0;

            for (let i = MIN_BET_ID; i < nextBetId && batchCount < maxBatches; i += batchSize) {
                let attempts = 0;
                const maxAttempts = 3;
                while (attempts < maxAttempts) {
                    try {
                        const end = Math.min(i + batchSize, nextBetId);
                        const promises = [];
                        for (let j = i; j < end; j++) promises.push(contract.bets(j));

                        // Increased to 15-second timeout per batch
                        const timeoutPromise = new Promise((_, reject) =>
                            setTimeout(() => reject(new Error('Batch timeout')), 15000)
                        );

                        const results = await Promise.race([
                            Promise.all(promises),
                            timeoutPromise
                        ]);

                        results.forEach(b => {
                            if (b && b.amount != null) {
                                try {
                                    volume += parseFloat(ethers.formatEther(b.amount));
                                } catch (e) { }
                            }
                        });
                        batchCount++;
                        break; // Success!
                    } catch (batchErr) {
                        attempts++;
                        console.warn(`⚠️ [STARTUP_SCAN] Batch ${i}-${i + batchSize} attempt ${attempts}/${maxAttempts} failed: ${batchErr.message}`);
                        if (attempts >= maxAttempts) {
                            console.warn(`🛑 [STARTUP_SCAN] Batch ${i}-${i + batchSize} failed after ${maxAttempts} attempts, skipping.`);
                        }
                        await new Promise(r => setTimeout(r, 2000 * attempts)); // Backoff
                    }
                }
            }
            totalPlatformVolume = volume;
            console.log(`✅ [STARTUP_SCAN] Completed. Volume: ${totalPlatformVolume.toFixed(2)} USDC (${batchCount} batches)`);
        } catch (e) {
            console.warn(`⚠️ [STARTUP_SCAN] Global Fail: ${e.message}. Volume 0 until settlement.`);
            totalPlatformVolume = 0;
        }
    }

    // [MOVED] Startup scan is now called only once in the main flow below

    async function discoverUnsettledBets() {
        try {
            const nextBetId = await callWithRetry(() => contract.nextBetId(), "DISCOVER_ID");
            const totalBets = Number(nextBetId);
            // ONLY check bets starting from when the keeper started
            const startCheck = INITIAL_NEXT_BET_ID;
            if (startCheck >= totalBets) {
                if (Math.random() < 0.05) console.log(`🔍 [ARC_DISCOVERY] No new bets to check (Current ID: ${totalBets})`);
                return;
            }
            console.log(`🔍 [ARC_DISCOVERY] Checking NEW bets from ${startCheck} to ${totalBets}...`);
            let count = 0;
            for (let i = startCheck; i < totalBets; i++) {
                const bet = await callWithRetry(() => contract.bets(i), `BET_READ_${i}`, 3, 1000);
                if (bet && bet.id != null && !bet.settled) {
                    const betId = bet.id.toString();
                    const betTime = Number(bet.timestamp || 0);

                    if (betTime < KEEPER_START_TIME) {
                        // Legacy bet - report as DISPUTE
                        if (!activeBets.has(betId)) {
                            console.warn(`⚠️ [DISPUTE] Legacy bet found [ID: ${betId}] - Needs manual settlement`);
                            try {
                                await axios.post('http://127.0.0.1:8080/report-dispute', {
                                    id: betId,
                                    user: bet.user,
                                    amount: ethers.formatEther(bet.amount),
                                    timestamp: betTime,
                                    asset: ASSET_MAP[bet.marketId],
                                    reason: "KEEPER_NOT_RUNNING"
                                });
                            } catch (e) { }
                            activeBets.set(betId, { id: bet.id, settled: true, dispute: true }); // Prevent re-discovery
                        }
                        continue;
                    }

                    if (!activeBets.has(betId)) {
                        activeBets.set(betId, {
                            id: bet.id, user: bet.user, amount: bet.amount || 0n, direction: bet.direction,
                            entryPrice: bet.entryPrice, duration: bet.duration, timestamp: bet.timestamp,
                            marketId: bet.marketId, expiry: Number(bet.timestamp || 0) + Number(bet.duration || 0)
                        });
                        console.log(`📥 Recovered active bet [ID: ${betId}] Asset: ${ASSET_MAP[bet.marketId]}`);
                        console.log(`✨ [BET_DATA] ID:${betId} | AMT:${ethers.formatEther(bet.amount)} | EXP:${Number(bet.timestamp) + Number(bet.duration)} | NET:arc`);
                        count++;
                    }
                }
            }
            console.log(`✅ [ARC_DISCOVERY] Found ${count} unsettled bets.`);
            logToFile(`[ARC_DISCOVERY] Found ${count} unsettled bets.`);
        } catch (e) {
            logToFile(`[ARC_DISCOVERY_ERROR] ${e.message}`);
        }
    }

    async function pollForNewBets() {
        try {
            const currentBlock = await callWithRetry(() => provider.getBlockNumber(), "POLL_BLOCK", 3, 1000);
            // Always check at least the current block and the previous one to be safe
            const fromBlock = Math.max(0, currentBlock - 2);

            const filter = contract.filters.BetPlaced();
            const events = await callWithRetry(() => contract.queryFilter(filter, fromBlock, currentBlock), "QUERY_FILTER", 3, 1000);
            for (const event of events) {
                const [id, user, amount, direction, entryPrice, duration, timestamp, marketId] = event.args;
                const betId = id.toString();
                const betIdNum = Number(id);

                // IGNORE everything before keeper startup
                if (betIdNum < INITIAL_NEXT_BET_ID) continue;

                if (!activeBets.has(betId)) {
                    activeBets.set(betId, {
                        id, user, amount, direction, entryPrice, duration, timestamp, marketId,
                        expiry: Number(timestamp) + Number(duration)
                    });
                    console.log(`✨ [EVENT] New bet detected: ${betId} | Asset: ${ASSET_MAP[marketId]} | Exp: ${Number(timestamp) + Number(duration)}`);
                    console.log(`✨ [BET_DATA] ID:${betId} | AMT:${ethers.formatEther(amount)} | EXP:${Number(timestamp) + Number(duration)} | NET:arc`);
                    logToFile(`[EVENT] New bet: ${betId} Asset: ${ASSET_MAP[marketId]}`);
                    await logActiveExposure();
                }
            }
            lastCheckedBlock = currentBlock;
        } catch (e) { }
    }


    let isSyncingMetrics = false;
    async function logActiveExposure(force = false) {
        if (isSyncingMetrics) return;
        try {
            isSyncingMetrics = true;
            // Align Local Time with Network Time to prevent premature expiry due to clock skew
            const localNow = Math.floor(Date.now() / 1000);
            const offset = networkTime - localNow;
            const adjustedNow = localNow + offset;

            let activeStake = 0n;
            let activeCount = 0;
            let total = 0;
            let count = 0;

            // Global log throttle
            if (!global.logCycle) global.logCycle = 0;
            global.logCycle++;
            const shouldLogDetails = force || global.logCycle % 20 === 0;

            for (const bet of activeBets.values()) {
                if (!bet || bet.amount == null) continue;
                if (adjustedNow < bet.expiry) {
                    activeStake += BigInt(bet.amount);
                    activeCount++;
                }
                try {
                    total += Number(ethers.formatEther(bet.amount));
                } catch (e) { }
                count++;

                if (shouldLogDetails) {
                    console.log(`✨ [BET_DATA] ID:${bet.id} | AMT:${ethers.formatEther(bet.amount)} | EXP:${bet.expiry} | NET:arc`);
                }
            }
            const stakeEth = activeStake != null ? ethers.formatEther(activeStake) : "0";
            if (shouldLogDetails) {
                console.log(`📡 [SYNC] Arc Active: ${activeCount} Bets | Stake: ${stakeEth} USDC | Vol: ${totalPlatformVolume.toFixed(2)}`);

                // Sync with Admin Dashboard
                try {
                    let contractEth = "0";
                    let walletEth = "0";

                    try {
                        const [contractBal, walletBal] = await Promise.all([
                            callWithRetry(() => provider.getBalance(CONTRACT_ADDRESS), "METRIC_BAL_CONTRACT", 2, 500).catch(e => {
                                console.warn(`METRIC_BAL_CONTRACT failed: ${e.message}`);
                                return 0n;
                            }),
                            callWithRetry(() => provider.getBalance(wallet.address), "METRIC_BAL_KEEPER", 2, 500).catch(e => {
                                console.warn(`METRIC_BAL_KEEPER failed: ${e.message}`);
                                return 0n;
                            })
                        ]);
                        contractEth = ethers.formatEther(contractBal || 0n);
                        walletEth = ethers.formatEther(walletBal || 0n);
                    } catch (rpcErr) {
                        console.warn(`⏳ [RPC_LAG] Could not fetch balances: ${rpcErr.message}`);
                    }

                    const bridgeData = {
                        arc: {
                            stake: parseFloat(stakeEth),
                            count: activeCount,
                            totalVolume: totalPlatformVolume, // Use Scanned Volume
                            wallets: 0,
                            balance: parseFloat(contractEth),
                            keeperBalance: parseFloat(walletEth),
                            address: CONTRACT_ADDRESS,
                            keeperAddress: wallet.address
                        }
                    };
                    await axios.post('http://127.0.0.1:8080/escrow-stats', bridgeData, { timeout: 10000 });
                    if (shouldLogDetails) console.log(`📡 [BRIDGE_SYNC] Sent Arc stats to :8080 (Vol: ${totalPlatformVolume.toFixed(2)})`);
                } catch (bridgeErr) {
                    console.warn(`⚠️ [BRIDGE_FAIL] Metrics sync failed - ${bridgeErr.message}`);
                }
            }

            if (activeBets.size > 0 && activeCount === 0) {
                const firstBet = Array.from(activeBets.values())[0];
                console.log(`ℹ️ [DEBUG] Bet Exp: ${firstBet.expiry} < Now: ${adjustedNow}`);
            }

        } catch (e) {
            console.error("Log exposure error:", e.message);
        } finally {
            isSyncingMetrics = false;
        }
    }

    // Discovery and initial metrics
    await discoverUnsettledBets();
    await logActiveExposure();

    setInterval(async () => {
        const symbols = Object.values(ASSET_MAP);
        for (const s of symbols) await aiArbiter.confirmPrice(s);
    }, 250); // 250ms price refresh for INSTANT settlement decisions

    // Settlement helper function
    async function settleBetOnChain(id, bet, symbol, verdict, isWin, nonce) {
        const pricePyth = BigInt(Math.floor(verdict.price * 100000000));
        const entry = Number(bet.entryPrice) / 100000000;

        const feeData = await callWithRetry(() => provider.getFeeData(), "FEE_DATA", 3, 1000);
        const tx = await contract.settleBet(bet.id, pricePyth, {
            gasLimit: 300000,
            nonce: nonce,
            maxFeePerGas: feeData.maxFeePerGas ? (feeData.maxFeePerGas * 120n) / 100n : undefined,
            maxPriorityFeePerGas: feeData.maxPriorityFeePerGas ? (feeData.maxPriorityFeePerGas * 150n) / 100n : undefined
        });
        console.log(`🚀 [Pending] Bet ${id} | TX: ${tx.hash.slice(0, 10)}...`);
        logToFile(`[SETTLE_SEND] Bet ${id} TX: ${tx.hash} Result: ${isWin ? 'WIN' : 'LOSS'}`);

        const receipt = await tx.wait();
        if (receipt.status === 1) {
            console.log(`✅ [Settled] Bet ${id} | ${symbol} at $${verdict.price.toFixed(4)} | Result: ${isWin ? 'WON' : 'LOST'}`);
            logToFile(`[SETTLE_SUCCESS] Bet ${id} Result: ${isWin ? 'WON' : 'LOST'}`);

            // Report to Log Bridge
            try {
                let payoutVal = "0";
                if (isWin) {
                    let multiplier = 198;
                    if (bet.duration <= 5) multiplier = 698;
                    else if (bet.duration <= 10) multiplier = 498;
                    const winPayout = (BigInt(bet.amount) * BigInt(multiplier)) / 100n;
                    payoutVal = ethers.formatEther(winPayout);
                }

                await axios.post('http://127.0.0.1:8080/report-arc-trade', {
                    id: bet.id.toString(),
                    signature: tx.hash,
                    base: symbol,
                    amount: ethers.formatEther(bet.amount),
                    payout: payoutVal,
                    user: bet.user,
                    won: isWin,
                    strike: entry,
                    final: verdict.price,
                    timestamp: Math.floor(Date.now() / 1000)
                });
            } catch (bridgeErr) {
                console.warn(`⚠️ [BRIDGE_FAIL] Could not report trade ${id} - ${bridgeErr.message}`);
            }
            return true;
        } else {
            console.error(`❌ [Settle FAILED] Bet ${id} reverted on-chain`);
            logToFile(`[SETTLE_FAILED] Bet ${id} reverted`);
            return false;
        }
    }

    while (true) {
        try {
            await pollForNewBets();
            const localNow = Math.floor(Date.now() / 1000);
            const offset = networkTime - localNow;
            const adjustedNow = localNow + offset;

            const toSettle = [];
            for (const [id, bet] of activeBets.entries()) {
                // Aggressive retry - only 1s throttle for instant payouts
                if (bet.nextRetry && Date.now() < bet.nextRetry) continue;
                if (adjustedNow >= bet.expiry) toSettle.push({ id, bet });
            }

            if (toSettle.length > 0 || pendingWinningBets.size > 0) {
                if (Math.random() < 0.1) console.log(`\n🚀 [ARC_FAST_SETTLE] Analyzing ${toSettle.length} expired + ${pendingWinningBets.size} pending...`);

                let nonce = await callWithRetry(() => wallet.getNonce('pending'), "GET_NONCE");
                let contractBalance = await callWithRetry(() => provider.getBalance(CONTRACT_ADDRESS), "GET_BALANCE");

                const batchToProcess = [];

                // Process fresh expiries
                for (const { id, bet } of toSettle) {
                    if (bet.status === 'in-flight') continue;

                    try {
                        const symbol = ASSET_MAP[bet.marketId] || 'SOL';
                        const verdict = await aiArbiter.getResultVerdict(Number(bet.entryPrice) / 100000000, symbol);
                        if (verdict.price > 0) {
                            const entry = Number(bet.entryPrice) / 100000000;
                            const isWin = bet.direction == 1 ? (verdict.price > entry) : (verdict.price < entry);

                            let expectedPayout = 0n;
                            if (isWin) {
                                let multiplier = 198;
                                if (bet.duration <= 5) multiplier = 698;
                                else if (bet.duration <= 10) multiplier = 498;
                                expectedPayout = (BigInt(bet.amount) * BigInt(multiplier)) / 100n;
                            }

                            batchToProcess.push({ id, bet, symbol, verdict, isWin, expectedPayout });
                        } else {
                            bet.nextRetry = Date.now() + 1000;
                        }
                    } catch (e) {
                        console.error(`❌ [Verdict Error] Bet ${id}:`, e.message);
                        bet.nextRetry = Date.now() + 1000;
                    }
                }

                // Process pending wins
                for (const [id, winData] of pendingWinningBets.entries()) {
                    if (winData.bet.status === 'in-flight') continue;
                    if (winData.bet.nextRetry && Date.now() < winData.bet.nextRetry) continue;
                    batchToProcess.push(winData);
                }

                if (batchToProcess.length > 0) {
                    console.log(`⚡ [BURST] Sending ${batchToProcess.length} transactions to mempool...`);

                    for (const item of batchToProcess) {
                        const { id, bet, symbol, verdict, isWin, expectedPayout } = item;

                        // Funds check for winners
                        if (isWin && contractBalance < expectedPayout) {
                            const deficit = expectedPayout - contractBalance;
                            if (Math.random() < 0.2) console.warn(`⏳ [WAITING_FUNDS] Bet ${id} needs ${ethers.formatEther(deficit)} more ARC`);
                            bet.nextRetry = Date.now() + 1000;
                            pendingWinningBets.set(id, item); // Ensure it's in pending
                            continue;
                        }

                        // Mark as in-flight and increment used balance if winner
                        bet.status = 'in-flight';
                        if (isWin) {
                            contractBalance -= expectedPayout;
                            pendingWinningBets.delete(id); // Move from pending to active/in-flight
                        }

                        // Send transaction (Sync)
                        const currentNonce = nonce++;

                        (async () => {
                            try {
                                const pricePyth = BigInt(Math.floor(verdict.price * 100000000));
                                const entry = Number(bet.entryPrice) / 100000000;

                                // Optimization: Fetch fee data once for the batch if many
                                const tx = await contract.settleBet(bet.id, pricePyth, {
                                    gasLimit: 400000,
                                    nonce: currentNonce
                                });

                                console.log(`📤 [SENT] Bet ${id} | TX: ${tx.hash.slice(0, 10)}... | Nonce: ${currentNonce}`);

                                // Wait for confirmation (Async/Background)
                                const receipt = await tx.wait();
                                if (receipt.status === 1) {
                                    console.log(`✅ [CONFIRMED] Bet ${id} | ${isWin ? 'WIN' : 'LOSS'} | Done.`);

                                    // Log payout details for debugging
                                    if (isWin) {
                                        const payoutEth = ethers.formatEther(expectedPayout);
                                        console.log(`💰 [PAYOUT] User: ${bet.user} | Amount: ${payoutEth} ARC | TX: ${tx.hash}`);
                                        console.log(`📊 [BALANCE_CHECK] User should now have +${payoutEth} ARC in their wallet`);
                                    }

                                    activeBets.delete(id);

                                    // Report to bridge
                                    try {
                                        let payoutVal = isWin ? ethers.formatEther(expectedPayout) : "0";
                                        await axios.post('http://127.0.0.1:8080/report-arc-trade', {
                                            id: bet.id.toString(),
                                            signature: tx.hash,
                                            base: symbol,
                                            amount: ethers.formatEther(bet.amount),
                                            payout: payoutVal,
                                            user: bet.user,
                                            won: isWin,
                                            strike: entry,
                                            final: verdict.price,
                                            timestamp: Math.floor(Date.now() / 1000)
                                        });

                                        // FORCE IMMEDIATE BALANCE REFRESH after settlement
                                        await logActiveExposure(true);
                                    } catch (e) { }
                                } else {
                                    console.error(`❌ [REVERTED] Bet ${id}`);
                                    bet.status = 'error';
                                    bet.nextRetry = Date.now() + 2000;
                                }
                            } catch (e) {
                                console.error(`❌ [TX_FAIL] Bet ${id}:`, e.message);
                                bet.status = 'error';
                                bet.nextRetry = Date.now() + 2000;

                                if (e.message?.includes("already settled") || e.message?.includes("non-existent")) {
                                    activeBets.delete(id);
                                }
                            }
                        })();
                    }
                }
            } else {
                // Log status when idle
                if (activeBets.size > 0) {
                    const now = Math.floor(Date.now() / 1000);
                    const offset = networkTime - now;
                    const adjustedNow = now + offset;

                    // Find next expiring bet
                    let nextExpiry = Infinity;
                    for (const bet of activeBets.values()) {
                        if (bet.expiry > adjustedNow && bet.expiry < nextExpiry) {
                            nextExpiry = bet.expiry;
                        }
                    }

                    if (nextExpiry !== Infinity) {
                        const timeUntil = nextExpiry - adjustedNow;
                        if (global.idleLogCounter % 10 === 0) { // Log every 5 seconds
                            console.log(`⏳ [IDLE] ${activeBets.size} active bets. Next expires in ${timeUntil}s`);
                        }
                        global.idleLogCounter = (global.idleLogCounter || 0) + 1;
                    }
                }
            }

            // Run discovery every 10 cycles (~1 second) to find any missed bets
            const discoveryNow = Math.floor(Date.now() / 1000);
            if (discoveryNow % 10 === 0) {
                try { await discoverUnsettledBets(); } catch (e) { console.error("Discovery error:", e.message); }
            }
            logActiveExposure(); // Non-blocking metrics sync
            await new Promise(r => setTimeout(r, 100)); // 100ms loop for INSTANT reactivity
        } catch (err) {
            console.error("Main loop error:", err);
            await new Promise(r => setTimeout(r, 2000));
        }
    }
}

main().catch(console.error);

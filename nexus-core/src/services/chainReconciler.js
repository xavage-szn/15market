// ============================================================
// nexus-core/src/services/chainReconciler.js
//
// Reconciles the session (trading) wallet's ON-CHAIN native USDC balance
// against the platform's VIRTUAL trading ledger.
//
// Why this exists
// ---------------
// The trading balance the UI shows is a virtual ledger (profiles.balance).
// Historically nothing ever looked at the session EOA on-chain, and the
// ledger was only ever incremented by explicit endpoints (/session/deposit,
// /fund/confirm, CCTP settlement). So USDC transferred straight to the
// trading wallet address from an external wallet was never detected.
//
// Why the balance is not simply read from chain
// ---------------------------------------------
// _ensureSessionWalletFunded() tops the session EOA up with native USDC for
// gas before each trade. Reading the raw on-chain balance as the trading
// balance would hand that gas float back to the user on every refresh, which
// is exactly what the old comments in /session/init were guarding against.
//
// So instead we track a baseline and credit only the positive growth above
// it, after absorbing the inflow we ourselves caused (gas top-ups).
//
// Accounting rules
// ----------------
//   on-chain delta > 0  -> inbound. Absorb any recorded gas first, credit rest.
//   on-chain delta <= 0 -> outbound (stake sent to treasury, withdrawal, gas
//                          actually burned). The ledger already tracked these,
//                          so only advance the baseline; never touch balance.
//   baseline == NULL    -> first observation ever. Adopt the current on-chain
//                          balance and credit NOTHING, so a restart or a fresh
//                          deploy can never re-credit an already-counted sum.
//                          Pre-existing stuck deposits are recovered through
//                          POST /session/deposit, which verifies the transfer.
// ============================================================

const rpc = require('../rpc');
const cache = require('../cache');
const profiles = require('../profiles');

// Ignore sub-cent on-chain noise (rounding, gas dust).
const DEPOSIT_EPSILON = 0.005;
// One on-chain read per user per interval — this runs on the balance poll.
const RECONCILE_THROTTLE_MS = 8000;

const LAST_RUN = new Map();   // userAddr -> timestamp
const IN_FLIGHT = new Map();  // userAddr -> Promise

// Indirection so tests can inject doubles without patching Node's module
// loader. Production always uses the real singletons below.
const deps = {
    rpc: require('../rpc'),
    cache: require('../cache'),
    profiles: require('../profiles'),
    getFundingService: () => require('./fundingService'),
    getIo: () => require('../index').io
};

function __setDeps(overrides) {
    Object.assign(deps, overrides);
    LAST_RUN.clear();
    IN_FLIGHT.clear();
}

function __reset() {
    LAST_RUN.clear();
    IN_FLIGHT.clear();
}

function readState(addr) {
    const profile = deps.profiles.get(addr) || {};
    return {
        baseline: profile.chainBaseline != null ? Number(profile.chainBaseline) : null,
        gasOwed: Number(profile.chainGasOwed || 0)
    };
}

function writeState(addr, { baseline, gasOwed }) {
    const patch = {};
    if (baseline != null) patch.chainBaseline = Number(baseline);
    if (gasOwed != null) patch.chainGasOwed = Number(gasOwed);
    deps.profiles.upsert(addr, patch);

    // Mirror onto the hot session object so the common in-process path never
    // has to re-read the profile store.
    const session = deps.cache.sessions.get(addr);
    if (session) {
        if (baseline != null) session.chainBaseline = Number(baseline);
        if (gasOwed != null) session.chainGasOwed = Number(gasOwed);
    }
}

/**
 * Record that the platform is about to push `amountWei` of native USDC into a
 * session wallet for gas. This inflow must never be credited as a deposit.
 * Called by classic.js immediately before broadcasting the funding tx.
 */
function recordGasFunding(userAddr, amountWei) {
    const ethers = require('ethers');
    const addr = String(userAddr).toLowerCase();
    const amount = parseFloat(ethers.formatEther(amountWei));
    if (!isFinite(amount) || amount <= 0) return;
    const { gasOwed } = readState(addr);
    const next = Number((gasOwed + amount).toFixed(12));
    writeState(addr, { gasOwed: next });
    console.log(`[ChainReconciler] Gas funding recorded for ${addr}: +${amount} (owed ${next})`);
}

/**
 * Called after a deposit has ALREADY been credited through a verified,
 * explicit path (POST /session/deposit). Advance the baseline by that amount
 * so the reconciler does not see the same inflow a second time and
 * double-credit it.
 */
function advanceBaselineForCreditedDeposit(userAddr, amount) {
    const addr = String(userAddr).toLowerCase();
    const amt = Number(amount);
    if (!isFinite(amt) || amt <= 0) return;

    const { baseline } = readState(addr);
    if (baseline == null) {
        // Not reconciled yet. Leave it NULL on purpose: the first pass will
        // seed from the current on-chain balance (which includes this deposit)
        // and credit nothing, so there is nothing to double-count.
        return;
    }
    writeState(addr, { baseline: Number((baseline + amt).toFixed(12)) });
    console.log(`[ChainReconciler] Baseline advanced by ${amt} for verified deposit (${addr})`);
}

/**
 * Seed the baseline without crediting anything. Safe to call repeatedly.
 */
async function seedBaseline(userAddr, sessionAddress) {
    const addr = String(userAddr).toLowerCase();
    const { baseline } = readState(addr);
    if (baseline != null) return false;
    try {
        const onChain = parseFloat(await deps.rpc.getBalance(sessionAddress) || '0');
        if (!isFinite(onChain)) return false;
        writeState(addr, { baseline: onChain, gasOwed: 0 });
        console.log(`[ChainReconciler] Baseline seeded for ${addr}: ${onChain}`);
        return true;
    } catch (e) {
        console.warn('[ChainReconciler] Baseline seed failed:', e.message);
        return false;
    }
}

/**
 * Detect and credit USDC that arrived in the session wallet on-chain without
 * going through an explicit credit call.
 *
 * @returns {Promise<{credited:number, reason?:string, onChain?:number}>}
 */
async function reconcileSessionBalance(userAddr, sessionAddress, opts = {}) {
    const addr = String(userAddr).toLowerCase();
    if (!sessionAddress) return { credited: 0, reason: 'no-session-address' };

    const now = Date.now();
    if (!opts.force && now - (LAST_RUN.get(addr) || 0) < RECONCILE_THROTTLE_MS) {
        return { credited: 0, reason: 'throttled' };
    }
    if (IN_FLIGHT.has(addr)) return IN_FLIGHT.get(addr);
    LAST_RUN.set(addr, now);

    const task = (async () => {
        const onChain = parseFloat(await deps.rpc.getBalance(sessionAddress) || '0');
        if (!isFinite(onChain)) return { credited: 0, reason: 'rpc-failed' };

        const { baseline, gasOwed } = readState(addr);

        // ── First observation: adopt, never credit ──────────────────────
        if (baseline == null) {
            writeState(addr, { baseline: onChain, gasOwed: 0 });
            console.log(`[ChainReconciler] Baseline seeded for ${addr}: ${onChain} (no credit on first pass)`);
            return { credited: 0, reason: 'baseline-seeded', onChain };
        }

        let delta = onChain - baseline;
        let gasOwedRemaining = gasOwed;

        // Platform gas top-ups are inbound but are not deposits. Absorb them
        // before crediting. Only totals matter here: if a deposit and a gas
        // top-up land together the split between them is arbitrary, but the
        // total credited is always exactly the user's deposit.
        if (gasOwed > 0 && delta > 0) {
            const absorbed = Math.min(gasOwed, delta);
            gasOwedRemaining = Number((gasOwed - absorbed).toFixed(12));
            delta -= absorbed;
        }

        let credited = 0;
        if (delta > DEPOSIT_EPSILON) {
            credited = Number(delta.toFixed(6));
            const fundingService = deps.getFundingService();
            const result = await fundingService.creditTradingWallet(addr, credited, null);

            if (result && result.success) {
                console.log(`[ChainReconciler] Auto-credited ${credited} USDC on-chain deposit for ${addr} (on-chain ${onChain})`);

                deps.cache.pushHistory(addr, {
                    type: 'DEPOSIT',
                    amount: credited,
                    timestamp: Date.now(),
                    txHash: null,
                    status: 'CONFIRMED',
                    source: 'chain-reconcile'
                });

                // Real-time push so an open session updates without a reload.
                const io = deps.getIo();
                if (io) {
                    io.to(addr).emit('balance_update', {
                        balance: String(result.newBalance),
                        reason: 'DEPOSIT_DETECTED',
                        amount: credited
                    });
                }
            } else {
                console.warn(`[ChainReconciler] creditTradingWallet refused ${credited} for ${addr}`);
                credited = 0;
            }
        }

        // Always follow the chain, even when nothing was credited.
        writeState(addr, { baseline: onChain, gasOwed: gasOwedRemaining });
        return { credited, onChain, delta };
    })();

    IN_FLIGHT.set(addr, task);
    try {
        return await task;
    } catch (e) {
        console.warn(`[ChainReconciler] reconcile failed for ${addr}:`, e.message);
        return { credited: 0, reason: 'error' };
    } finally {
        IN_FLIGHT.delete(addr);
    }
}

module.exports = {
    reconcileSessionBalance,
    recordGasFunding,
    advanceBaselineForCreditedDeposit,
    seedBaseline,
    // Test seams. Not used by production code paths.
    __setDeps,
    __reset
};

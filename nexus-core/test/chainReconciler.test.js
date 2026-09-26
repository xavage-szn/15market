// Accounting tests for the session chain reconciler.
//
//   node test/chainReconciler.test.js
//
// These cover the rules that decide whether on-chain inflow becomes spendable
// trading balance. Plain node, no test framework, so it runs anywhere.
//
// Dependencies are injected through the reconciler's __setDeps seam so the
// real profile store, Redis and Supabase are never touched.

const assert = require('assert');

const USER = '0xabc0000000000000000000000000000000000001';
const SESSION = '0x55510000000000000000000000000000000000aa';

const profilesStore = {};
const sessionsStore = new Map();
const history = [];
let onChainBalance = '0';
let ledger = 0;

const doubles = {
    profiles: {
        get: (addr) => profilesStore[addr],
        upsert: (addr, data) => {
            profilesStore[addr] = { ...(profilesStore[addr] || {}), ...data, address: addr };
            return profilesStore[addr];
        }
    },
    cache: {
        sessions: sessionsStore,
        getOrCreateSession: (key, data) => {
            if (!sessionsStore.has(key)) sessionsStore.set(key, data);
            return sessionsStore.get(key);
        },
        pushHistory: (addr, rec) => history.push({ addr, rec })
    },
    rpc: { getBalance: async () => onChainBalance },
    getFundingService: () => ({
        creditTradingWallet: async (addr, amount) => {
            ledger += amount;
            const session = sessionsStore.get(addr);
            if (session) session.balance = (session.balance || 0) + amount;
            return { success: true, credited: amount, newBalance: ledger };
        }
    }),
    getIo: () => null
};

const reconciler = require('../src/services/chainReconciler');
reconciler.__setDeps(doubles);

let passed = 0;
let failed = 0;

function reset() {
    for (const k of Object.keys(profilesStore)) delete profilesStore[k];
    sessionsStore.clear();
    history.length = 0;
    onChainBalance = '0';
    ledger = 0;
    reconciler.__reset();
}

async function test(name, fn) {
    reset();
    try {
        await fn();
        passed++;
        console.log(`  ok   ${name}`);
    } catch (e) {
        failed++;
        console.error(`  FAIL ${name}\n         ${e.message}`);
    }
}

(async () => {
    console.log('\nchainReconciler accounting\n');

    await test('first pass adopts baseline without crediting', async () => {
        onChainBalance = '2'; // platform gas float sitting in the session wallet
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'must not credit on first pass');
        assert.strictEqual(profilesStore[USER].chainBaseline, 2, 'baseline seeded to 2');
    });

    await test('inbound transfer above baseline is credited', async () => {
        profilesStore[USER] = { chainBaseline: 2, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '12'; // +10 deposit
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 10, 'should credit the 10 USDC delta');
        assert.strictEqual(profilesStore[USER].chainBaseline, 12, 'baseline follows the chain');
        assert.strictEqual(sessionsStore.get(USER).balance, 10, 'ledger received the credit');
    });

    await test('gas top-up is absorbed, not credited', async () => {
        profilesStore[USER] = { chainBaseline: 0.1, chainGasOwed: 2 };
        onChainBalance = '2.1';
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'gas must not be credited');
        assert.strictEqual(profilesStore[USER].chainGasOwed, 0, 'gas debt cleared');
    });

    await test('deposit + gas together credits only the deposit', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 2 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '7'; // 2 gas + 5 deposit
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 5, 'only the 5 USDC deposit is credited');
    });

    await test('outbound spend only advances the baseline', async () => {
        profilesStore[USER] = { chainBaseline: 10, chainGasOwed: 0 };
        onChainBalance = '4'; // 6 staked on-chain
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'spend must not credit');
        assert.strictEqual(profilesStore[USER].chainBaseline, 4, 'baseline follows the chain down');
    });

    await test('verified deposit advances baseline to avoid double credit', async () => {
        profilesStore[USER] = { chainBaseline: 2, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 10 });
        reconciler.advanceBaselineForCreditedDeposit(USER, 10);
        assert.strictEqual(profilesStore[USER].chainBaseline, 12, 'baseline includes the credit');

        onChainBalance = '12';
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'must not re-credit an already-credited deposit');
    });

    await test('verified deposit before first reconcile leaves baseline null', async () => {
        reconciler.advanceBaselineForCreditedDeposit(USER, 10);
        assert.strictEqual(profilesStore[USER], undefined, 'no state should be written');
    });

    await test('gas absorbed correctly regardless of arrival order', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 2 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '5'; // deposit lands first
        const first = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        onChainBalance = '7'; // then 2 of gas
        const second = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(first.credited + second.credited, 5, 'total credited equals the deposit');
    });

    await test('sub-epsilon inflow is ignored', async () => {
        profilesStore[USER] = { chainBaseline: 10, chainGasOwed: 0 };
        onChainBalance = '10.0001';
        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'dust must not be credited');
    });

    await test('repeat poll credits nothing new', async () => {
        profilesStore[USER] = { chainBaseline: 2, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '12';
        await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        const second = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(second.credited, 0, 'second poll must credit nothing');
    });

    await test('throttle blocks a second rpc read inside the window', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '5';
        const first = await reconciler.reconcileSessionBalance(USER, SESSION); // no force
        const second = await reconciler.reconcileSessionBalance(USER, SESSION);
        assert.strictEqual(first.credited, 5, 'first call credits the deposit');
        assert.strictEqual(second.reason, 'throttled', 'second call is throttled');
        assert.strictEqual(sessionsStore.get(USER).balance, 5, 'no double credit from the throttle');
    });

    await test('credited deposits are written to history for the UI', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 0 });
        onChainBalance = '9';
        await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(history.length, 1, 'a deposit record should be pushed');
        assert.strictEqual(history[0].rec.source, 'chain-reconcile');
        assert.strictEqual(history[0].rec.amount, 9);
    });

    // Regression guard: the in-app deposit flow (/fund/confirm,
    // /fund/permit-bridge) credits the ledger through creditTradingWallet,
    // which advances the baseline for the same on-chain transfer. The
    // reconciler must then see nothing left to credit.
    await test('app deposit already credited is not credited twice', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 0 };
        sessionsStore.set(USER, { balance: 0 });

        // The on-chain transfer lands.
        onChainBalance = '10';
        // fundingService.creditTradingWallet credits 10 and advances baseline.
        reconciler.advanceBaselineForCreditedDeposit(USER, 10);
        sessionsStore.get(USER).balance = 10;

        const out = await reconciler.reconcileSessionBalance(USER, SESSION, { force: true });
        assert.strictEqual(out.credited, 0, 'must not double-credit an app deposit');
        assert.strictEqual(sessionsStore.get(USER).balance, 10, 'balance must stay at 10');
    });

    // A deposit landing while gas is still owed must credit the deposit in
    // total, and never more, regardless of how the two interleave.
    await test('interleaved gas and deposits never over-credit', async () => {
        profilesStore[USER] = { chainBaseline: 0, chainGasOwed: 2 };
        sessionsStore.set(USER, { balance: 0 });

        let totalCredited = 0;
        // gas 2 arrives
        onChainBalance = '2';
        totalCredited += (await reconciler.reconcileSessionBalance(USER, SESSION, { force: true })).credited;
        // deposit 5 arrives
        onChainBalance = '7';
        totalCredited += (await reconciler.reconcileSessionBalance(USER, SESSION, { force: true })).credited;
        // another deposit 3 arrives
        onChainBalance = '10';
        totalCredited += (await reconciler.reconcileSessionBalance(USER, SESSION, { force: true })).credited;

        assert.strictEqual(totalCredited, 8, 'exactly the two deposits (5 + 3), never the gas');
    });

    console.log(`\n${passed} passing, ${failed} failing\n`);
    process.exit(failed > 0 ? 1 : 0);
})();

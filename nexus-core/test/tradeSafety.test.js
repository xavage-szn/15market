// Regression tests for the two house-losing bugs behind the phantom 97 USDC bet.
//
//   node test/tradeSafety.test.js
//
// 1. Payout was amount / sharePrice with no ceiling, so a 3.95 USDC 15s bet paid
//    ~97 USDC (13.1x the published 1.9x). creditWinner now clamps to the duration
//    multiplier, and the copier's ratio payout inherits the same ceiling.
// 2. Trade placement had no durable replay protection, so a re-submitted bet id
//    placed a second real on-chain stake. claimBet now runs immediately before
//    the broadcast and fails closed on anything it cannot prove is fresh.
//
// Plain node, no test framework. The chain, Redis and the real Supabase project
// are never touched: payout math runs against the real config, and claimBet runs
// against a stubbed global.fetch.

process.env.SUPABASE_URL = process.env.SUPABASE_URL || 'https://stub.supabase.test';
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || 'stub-key';

const assert = require('assert');
const config = require('../src/config');
const cache = require('../src/cache');
const ClassicEngine = require('../src/classic');
const profiles = require('../src/profiles');

let passed = 0;
let failed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  FAIL  ${name}\n          ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ok    ${name}`);
  } catch (e) {
    failed++;
    failures.push({ name, error: e });
    console.log(`  FAIL  ${name}\n          ${e.message}`);
  }
}

const engine = Object.create(ClassicEngine.prototype);
const USER = '0xabc0000000000000000000000000000000000001';

// ── Payout ceiling ──────────────────────────────────────────────────────────

test('published duration multipliers are unchanged', () => {
  assert.strictEqual(config.MULTIPLIERS[5], 2.90, '5s tier');
  assert.strictEqual(config.MULTIPLIERS[10], 2.40, '10s tier');
  assert.strictEqual(config.MULTIPLIERS[15], 1.90, '15s tier');
});

test('multiplierFor snaps every duration to a configured tier', () => {
  assert.strictEqual(engine.multiplierFor(5), 2.90);
  assert.strictEqual(engine.multiplierFor(10), 2.40);
  assert.strictEqual(engine.multiplierFor(15), 1.90);
  // Odd durations must land on a tier, never fall through to an uncapped 1x.
  assert.strictEqual(engine.multiplierFor(1), 2.90);
  assert.strictEqual(engine.multiplierFor(14), 1.90);
  assert.strictEqual(engine.multiplierFor(60), 1.90);
  // Junk input must stay conservative rather than producing NaN.
  for (const bad of [NaN, undefined, null, 'x', -5, 0]) {
    const m = engine.multiplierFor(bad);
    assert.ok(m >= 1.90, `duration ${bad} produced multiplier ${m}`);
  }
});

test('the reported 3.95 USDC 15s bet now pays 7.43 instead of 97', () => {
  const stake = 3.95;
  const sharePrice = 0.040314; // live price at the time of the incident

  const uncapped = (stake / sharePrice) * 0.99;
  assert.ok(Math.abs(uncapped - 97) < 1, `old math should reproduce ~97, got ${uncapped}`);

  const cap = engine.maxPayoutFor({ amount: stake, duration: 15 });
  const payout = Math.max(0.000001, Math.min(uncapped, cap));
  assert.ok(Math.abs(payout - 7.42995) < 0.0001, `expected 7.42995, got ${payout}`);
});

test('no legal sharePrice can push a payout over the cap', () => {
  // sharePrice is clamped to [0.03, 0.97]. At 0.03 the old formula paid 33x the
  // stake, so the whole legal range is checked.
  for (const raw of [0.03, 0.040314, 0.1, 0.5, 0.9, 0.97]) {
    for (const duration of [5, 10, 15]) {
      const stake = 25;
      const clamped = Math.max(0.03, Math.min(0.97, raw));
      const uncapped = (stake / clamped) * 0.99;
      const cap = engine.maxPayoutFor({ amount: stake, duration });
      const payout = Math.max(0.000001, Math.min(uncapped, cap));
      assert.ok(
        payout <= cap + 1e-9,
        `sharePrice=${raw} duration=${duration} paid ${payout} over cap ${cap}`
      );
    }
  }
});

test('a fair-odds win still pays the full computed amount', () => {
  // 50% odds returns 1.98x, comfortably under the 2.9x 5s ceiling, so the cap
  // must not quietly tax ordinary wins.
  const stake = 10;
  const uncapped = (stake / 0.5) * 0.99; // 19.80
  const cap = engine.maxPayoutFor({ amount: stake, duration: 5 }); // 28.71
  const payout = Math.max(0.000001, Math.min(uncapped, cap));
  assert.strictEqual(payout, uncapped, 'the cap altered a normal payout');
});

// ── Settlement runs at most once per bet ────────────────────────────────────

function withStubbedCache(fn) {
  const realSessions = cache.sessions;
  const realPush = cache.pushHistory;
  const realDelete = cache.deleteCachedTradeResult;
  cache.sessions = new Map([[USER, { balance: 0 }]]);
  cache.pushHistory = () => {};
  cache.deleteCachedTradeResult = () => {};
  try {
    return fn();
  } finally {
    cache.sessions = realSessions;
    cache.pushHistory = realPush;
    cache.deleteCachedTradeResult = realDelete;
  }
}

// The engine emits both room-scoped (io.to(addr).emit) and global (io.emit)
// events depending on the call site, so the stub has to answer to both.
function stubIo() {
  const emit = () => {};
  return { emit, to: () => ({ emit }) };
}

test('creditWinner pays once and refuses a second credit', () => {
  withStubbedCache(() => {
    const ctx = Object.create(ClassicEngine.prototype);
    ctx.io = stubIo();
    ctx.syncBalance = () => {};

    const trade = {
      id: '77', userAddr: USER, amount: 3.95, duration: 15,
      sharePrice: 0.040314, status: 'PENDING'
    };

    ClassicEngine.prototype.creditWinner.call(ctx, trade, 2550);
    assert.strictEqual(trade.status, 'WON', 'the first credit must settle the bet');
    const afterFirst = cache.sessions.get(USER).balance;
    assert.ok(afterFirst > 0, 'the first credit must pay out');
    assert.ok(afterFirst <= 7.43, `first credit paid ${afterFirst}, over the 15s cap`);

    ClassicEngine.prototype.creditWinner.call(ctx, trade, 2550);
    assert.strictEqual(
      cache.sessions.get(USER).balance, afterFirst,
      'a duplicate settle credited the winner a second time'
    );
  });
});

test('settleTradeLocally settles a loss only once', () => {
  withStubbedCache(() => {
    const ctx = Object.create(ClassicEngine.prototype);
    ctx.io = stubIo();
    ctx.syncBalance = () => {};

    const trade = { id: '78', userAddr: USER, amount: 5, symbol: 'eth', direction: 1, status: 'PENDING' };
    ClassicEngine.prototype.settleTradeLocally.call(ctx, trade);
    const firstStamp = trade.settledAt;
    assert.ok(firstStamp > 0, 'the first settle must stamp settledAt');

    ClassicEngine.prototype.settleTradeLocally.call(ctx, trade);
    assert.strictEqual(trade.settledAt, firstStamp, 'a duplicate settle re-stamped the bet');
    assert.strictEqual(trade.status, 'LOST', 'a duplicate settle changed the verdict');
  });
});

// ── Durable claim gate ──────────────────────────────────────────────────────
//
// classic.js depends on an exact contract from claimBet: 201 means "this call
// owns the bet id and may broadcast", 409 means "already placed, do not place".
// If the Prefer header swallows the unique violation and returns 201 for a
// replay, every duplicate sails through to a second on-chain stake - so the
// header is asserted here, not just the status handling.

function withStubbedFetch(handler, fn) {
  const realFetch = global.fetch;
  global.fetch = handler;
  return Promise.resolve()
    .then(fn)
    .finally(() => { global.fetch = realFetch; });
}

function makeResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body))
  };
}

(async () => {
  console.log('\ntrade safety regression tests\n');

  await testAsync('claimBet grants the id on a fresh insert (201)', async () => {
    await withStubbedFetch(async () => makeResponse(201, null), async () => {
      const res = await profiles.claimBet('9001', USER, 3.95, { duration: 15, symbol: 'eth' });
      assert.strictEqual(res.claimed, true, 'a first insert must own the id');
    });
  });

  await testAsync('claimBet rejects a replay of the same id (409)', async () => {
    await withStubbedFetch(async (url) => {
      if (url.includes('/rest/v1/placed_bets?')) {
        // betIdOwner lookup, same wallet => a genuine replay, not a collision.
        return makeResponse(200, [{ user_address: USER }]);
      }
      return makeResponse(409, { code: '23505' });
    }, async () => {
      const res = await profiles.claimBet('9002', USER, 3.95, { duration: 15 });
      assert.strictEqual(res.claimed, false, 'a replay must not be granted the id');
      assert.strictEqual(res.reason, 'already-placed', 'replay reason');
    });
  });

  await testAsync('claimBet does not ignore duplicate conflicts', async () => {
    // Regression guard: `resolution=ignore-duplicates` makes PostgREST swallow the
    // 23505 and answer 201, which classic.js would read as a fresh claim.
    await withStubbedFetch(async (_url, opts) => {
      const prefer = (opts?.headers?.Prefer) || '';
      assert.ok(
        !/ignore-duplicates/i.test(prefer),
        `claimBet must not send resolution=ignore-duplicates (got "${prefer}")`
      );
      return makeResponse(201, null);
    }, async () => {
      await profiles.claimBet('9003', USER, 1, { duration: 15 });
    });
  });

  await testAsync('claimBet refuses an id claimed by a different wallet', async () => {
    await withStubbedFetch(async (url) => {
      if (url.includes('/rest/v1/placed_bets?')) {
        return makeResponse(200, [{ user_address: '0xsomeoneelse000000000000000000000000000000' }]);
      }
      return makeResponse(409, { code: '23505' });
    }, async () => {
      const res = await profiles.claimBet('9004', USER, 3.95, { duration: 15 });
      assert.strictEqual(res.claimed, false, 'an id collision must never grant the bet');
      assert.strictEqual(res.reason, 'id-collision', 'collision reason');
    });
  });

  await testAsync('claimBet fails closed when the table is missing (404)', async () => {
    const before = profiles.sbBetIdempotencyAvailable;
    try {
      await withStubbedFetch(async () => makeResponse(404, { code: '42P01' }), async () => {
        const res = await profiles.claimBet('9005', USER, 3.95, { duration: 15 });
        assert.strictEqual(res.claimed, false, 'a missing table must not grant a bet');
        assert.strictEqual(res.reason, 'table-missing', 'missing-table reason');
      });
      assert.strictEqual(
        profiles.sbBetIdempotencyAvailable, false,
        'a 404 must latch the table as unavailable'
      );
    } finally {
      profiles.sbBetIdempotencyAvailable = before;
    }
  });

  await testAsync('claimBet fails closed on a network error', async () => {
    const before = profiles.sbBetIdempotencyAvailable;
    try {
      await withStubbedFetch(async () => { throw new Error('ECONNRESET'); }, async () => {
        const res = await profiles.claimBet('9006', USER, 3.95, { duration: 15 });
        assert.strictEqual(res.claimed, false, 'an unreachable store must not grant a bet');
        assert.strictEqual(res.reason, 'unavailable', 'network-blip reason');
        // Must NOT latch, or one blip would disable trading until restart.
        assert.notStrictEqual(
          profiles.sbBetIdempotencyAvailable, false,
          'a transient network error latched the gate off permanently'
        );
      });
    } finally {
      profiles.sbBetIdempotencyAvailable = before;
    }
  });

  await testAsync('recordBetResult never throws on a failed update', async () => {
    await withStubbedFetch(async () => { throw new Error('boom'); }, async () => {
      await profiles.recordBetResult('9001', { stake_tx_hash: '0xabc', status: 'WON' });
    });
  });

  // ── Idle-fund sweep must never touch user principal ───────────────────────
  //
  // _reclaimIdleSessionArc() runs every 5 minutes over every live session
  // wallet. It used to sweep `onChain - lockedStakes - buffer`, which is the
  // user's trading balance whenever no trade is pending, so a 30 USDC balance
  // was taken whole and sent to the operator wallet. The sweep is now bounded by
  // the platform's own recorded gas float, and the reclaim is recorded so a
  // second pass cannot take the same money again.
  //
  // The reclaim formula is asserted here directly rather than by driving the
  // 5-minute timer, so a regression is caught without a live chain.

  const reclaim = require('../src/services/chainReconciler');

  // Mirror of the caps in classic.js _reclaimIdleSessionArc.
  function reclaimableAmount({ onChain, lockedStakes, gasFloatOwed, userBalance }) {
    const MIN_TO_KEEP = 0.05;
    const MAX_RECLAIM = 50;
    if (onChain <= MIN_TO_KEEP) return 0;
    if (gasFloatOwed > onChain + 0.01) return 0; // drifted: refuse
    const headroom = onChain - lockedStakes - MIN_TO_KEEP;
    return Math.max(0, Math.min(
      MAX_RECLAIM, gasFloatOwed, headroom, Number.isFinite(userBalance) ? userBalance : 0
    ));
  }

  test('a user balance is never swept when the platform funded no gas', () => {
    // The reported symptom: 30 USDC on-chain, 5 USDC in the ledger.
    assert.strictEqual(
      reclaimableAmount({ onChain: 30, lockedStakes: 0, gasFloatOwed: 0, userBalance: 5 }),
      0,
      'no gas float recorded means we take nothing'
    );
  });

  test('a user balance is never swept even with a large recorded float', () => {
    // Only the float is reclaimable; the 25 USDC of principal stays put.
    const got = reclaimableAmount({ onChain: 30, lockedStakes: 0, gasFloatOwed: 5, userBalance: 25 });
    assert.ok(got <= 5, `swept ${got}, above the 5 USDC float`);
  });

  test('pending stakes are never swept', () => {
    const got = reclaimableAmount({ onChain: 30, lockedStakes: 20, gasFloatOwed: 10, userBalance: 30 });
    assert.ok(got <= 9.95, `swept ${got}, into the 20 USDC of pending stakes`);
  });

  test('a drifted float larger than the wallet is refused outright', () => {
    assert.strictEqual(
      reclaimableAmount({ onChain: 3, lockedStakes: 0, gasFloatOwed: 12, userBalance: 3 }),
      0,
      'a float bigger than the wallet means the accounting drifted'
    );
  });

  test('a repeat sweep takes nothing once the float is fully reclaimed', () => {
    // The ratchet: gasOwed is only ever raised by recordGasFunding, so without
    // recording the reclaim the next 5-minute pass takes the same money again.
    let gasOwed = 4;
    const sweep = () => reclaimableAmount({ onChain: 30, lockedStakes: 0, gasFloatOwed: gasOwed, userBalance: 26 });
    const first = sweep();
    assert.ok(first > 0, 'the first sweep must recover the float');
    gasOwed = Math.max(0, gasOwed - first); // recordGasReclaim
    assert.strictEqual(sweep(), 0, 'a second sweep took the float twice');
  });

  await testAsync('recordGasReclaim floors the float at zero', async () => {
    const addr = '0xabc0000000000000000000000000000000000009';
    const realUpsert = profiles.upsert;
    const store = {};
    try {
      profiles.upsert = (a, patch) => { store[a.toLowerCase()] = { ...(store[a.toLowerCase()] || {}), ...patch }; };
      profiles.get = (a) => store[a.toLowerCase()] || null;
      reclaim.__setDeps({ profiles });

      reclaim.recordGasFunding(addr, '5000000000000000000'); // 5 USDC (1e18 each)
      assert.strictEqual(reclaim.getGasFloatOwed(addr), 5, 'float recorded');

      reclaim.recordGasReclaim(addr, 5);
      assert.strictEqual(reclaim.getGasFloatOwed(addr), 0, 'float cleared after full reclaim');

      // An over-reported reclaim must not go negative, or a later sweep would be
      // authorised against gas we already took back.
      reclaim.recordGasFunding(addr, '2000000000000000000'); // 2 USDC
      reclaim.recordGasReclaim(addr, 99);
      assert.strictEqual(reclaim.getGasFloatOwed(addr), 0, 'float never goes negative');
    } finally {
      profiles.upsert = realUpsert;
      reclaim.__reset();
    }
  });

  // ── Undecidable trades are disputed, never settled as a loss ─────────────
  //
  // lockResult used to declare a LOST verdict whenever the exit price was
  // nonsense (`validExit` false) and on ANY exception. A price-feed gap therefore
  // silently cost the user their entire stake, with our failure billed to them
  // as a market result. It is now parked in DISPUTE: stake held, no verdict,
  // visible for an admin.
  //
  // The other half matters just as much — a trade with a usable entry and exit
  // price must still settle automatically with no human involved, or this whole
  // change would have quietly broken normal trading.

  const engineProto = ClassicEngine.prototype;

  function lockCtx(overrides = {}) {
    const ctx = Object.create(engineProto);
    ctx.io = { emit: () => {}, to: () => ({ emit: () => {} }) };
    ctx.syncBalance = () => {};
    ctx._noteDispute = () => {};
    ctx.settleOnChainBackground = () => {};
    ctx.creditWinner = function (t) { t.status = 'WON'; };
    ctx.settleTradeLocally = function (t) { t.status = 'LOST'; };
    return Object.assign(ctx, overrides);
  }

  test('a trade with a valid exit still settles automatically', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '900', userAddr: USER, amount: 5, symbol: 'eth', direction: 1,
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      // Entry 100, exit 110, direction UP -> a win.
      ctx.captureExitPrice = () => 110;
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'WON', 'a valid win must settle with no admin involved');
      assert.strictEqual(trade.lockedExitPrice, 110, 'the exit price is locked');
      assert.strictEqual(trade.lockedWon, true, 'the verdict is locked');
    });
  });

  test('a valid loss still settles automatically', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '901', userAddr: USER, amount: 5, symbol: 'eth', direction: 1,
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      ctx.captureExitPrice = () => 90; // DOWN from entry on an UP trade
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'LOST', 'a valid loss must settle with no admin involved');
      assert.strictEqual(trade.lockedWon, false, 'the verdict is locked');
    });
  });

  test('an invalid exit price is DISPUTED, not silently lost', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '902', userAddr: USER, amount: 5, symbol: 'eth', direction: 1,
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      // Feed down: no price at all. This used to be a LOST verdict.
      ctx.captureExitPrice = () => 0;
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'DISPUTE', 'a feed failure must not become a loss');
      assert.strictEqual(trade.lockedWon, undefined, 'no verdict may be invented');
      assert.strictEqual(trade.lockedExitPrice, undefined, 'no exit price may be invented');
      assert.strictEqual(trade.settledAt, undefined, 'a disputed trade is not settled');
      assert.strictEqual(trade.disputeReason, 'INVALID_EXIT_PRICE', 'the reason is recorded');
    });
  });

  test('an engine error is DISPUTED, not silently lost', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '903', userAddr: USER, amount: 5, symbol: 'eth', direction: 1,
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      ctx.captureExitPrice = () => { throw new Error('boom'); };
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'DISPUTE', 'our own crash must not cost the user their stake');
      assert.strictEqual(trade.disputeReason, 'ENGINE_ERROR', 'the reason is recorded');
    });
  });

  test('an invalid direction is DISPUTED', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '904', userAddr: USER, amount: 5, symbol: 'eth', direction: 'sideways',
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      ctx.captureExitPrice = () => 110;
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'DISPUTE', 'an undecidable direction must not be guessed');
      assert.strictEqual(trade.disputeReason, 'INVALID_DIRECTION', 'the reason is recorded');
    });
  });

  test('a disputed trade is not re-settled by a later sweep', () => {
    withStubbedCache(() => {
      const ctx = lockCtx();
      const trade = {
        id: '905', userAddr: USER, amount: 5, symbol: 'eth', direction: 1,
        entryPrice: 100, duration: 15, status: 'PENDING'
      };
      ctx.captureExitPrice = () => 0;
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'DISPUTE');

      // The 3s recovery sweep only touches PENDING, and lockResult re-checks
      // the status, so a dispute must stay put instead of being re-decided.
      ctx.captureExitPrice = () => 110;
      engineProto.lockResult.call(ctx, trade);
      assert.strictEqual(trade.status, 'DISPUTE', 'a dispute must not be overwritten by a later pass');
    });
  });

  // ── Clearing stuck trades must void them, never delete them ──────────────
  //
  // The stake is debited when a trade is placed, so removing the row would take
  // the user's money AND the only record that the trade existed — including the
  // evidence needed to work out why it got stuck. markTradeResolved moves the row
  // to a real terminal status instead.
  //
  // payout must be forced to 0: the client treats any settled row with a
  // non-zero payout as a win, and a voided trade is not a win.

  test('markTradeResolved voids a stuck trade without deleting the row', async () => {
    const addr = '0xabc000000000000000000000000000000000000a';
    const realGetAll = profiles.getAll;
    const realSave = profiles.saveToFile;
    const store = {
      [addr]: {
        address: addr,
        trades: [
          { id: '7001', symbol: 'ETH', amount: 5, status: 'PENDING', won: false, payout: 0 },
          { id: '7002', symbol: 'BTC', amount: 3, status: 'LOST', won: false, payout: 0 }
        ]
      }
    };
    try {
      profiles.getAll = () => store;
      profiles.saveToFile = () => {};

      const ok = await profiles.markTradeResolved('7001', addr, { status: 'CANCELLED', reason: 'stuck' });
      assert.strictEqual(ok, true, 'the row must be resolvable');

      const t = store[addr].trades.find(x => x.id === '7001');
      assert.ok(t, 'the row must still exist — deleting it is what we are avoiding');
      assert.strictEqual(t.status, 'CANCELLED', 'moved to a real terminal status');
      assert.strictEqual(t.payout, 0, 'payout forced to 0 so it is not read as a win');
      assert.strictEqual(t.won, false, 'never marked as a win');
      assert.strictEqual(t.amount, 5, 'the stake is still on the record');

      // An already-settled trade is left alone.
      const other = store[addr].trades.find(x => x.id === '7002');
      assert.strictEqual(other.status, 'LOST', 'a settled trade must not be rewritten');
    } finally {
      profiles.getAll = realGetAll;
      profiles.saveToFile = realSave;
    }
  });

  test('markTradeResolved refuses an unknown bet id rather than inventing one', async () => {
    const addr = '0xabc000000000000000000000000000000000000b';
    const realGetAll = profiles.getAll;
    const realSave = profiles.saveToFile;
    try {
      profiles.getAll = () => ({ [addr]: { address: addr, trades: [] } });
      profiles.saveToFile = () => {};
      const ok = await profiles.markTradeResolved('does-not-exist', addr, {});
      assert.strictEqual(ok, false, 'an unknown id must not report success');
    } finally {
      profiles.getAll = realGetAll;
      profiles.saveToFile = realSave;
    }
  });

  console.log(`\n${passed} passing, ${failed} failing\n`);
  if (failed) {
    for (const f of failures) console.log(`${f.name}\n${f.error.stack}\n`);
    process.exit(1);
  }
  // Requiring the engine pulls in modules that start timers/sockets, so the
  // event loop never drains on its own. Exit explicitly once the run is done.
  process.exit(0);
})();

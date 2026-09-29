-- 004_deposit_idempotency.sql
--
-- Makes the DATABASE the authority on "has this deposit already been credited?"
--
-- Before this, the only guard was an in-process Set of credited tx hashes
-- (nexus-core/src/index.js `_creditedDepositTxs`). That set is lost on every
-- restart, so any replay of a deposit confirmation inside the 1h signature
-- freshness window credited the same transfer twice. The trades table could
-- not catch it either: deposit rows were keyed
-- `DEPOSIT-<Date.now()>-<addr>`, a freshly generated id, so every replay
-- inserted a brand new row instead of colliding on the primary key.
--
-- Fix: claim the tx hash in a dedicated table whose PRIMARY KEY *is* the
-- idempotency key. The insert is the lock — whoever inserts first gets to
-- credit, everyone else gets a unique violation (Postgres 23505) and does
-- nothing. This is durable across restarts, deploys and multiple instances.

CREATE TABLE IF NOT EXISTS credited_deposits (
    tx_hash      TEXT PRIMARY KEY,                    -- on-chain transfer hash; the idempotency key
    user_address TEXT NOT NULL,                       -- whose balance was credited
    amount       NUMERIC(20, 6) NOT NULL DEFAULT 0,    -- exactly what the chain said arrived
    source       TEXT,                                 -- 'fund-confirm' | 'reconciler' | 'cctxp'
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()    -- first successful claim
);

CREATE INDEX IF NOT EXISTS idx_credited_deposits_user ON credited_deposits(user_address);
CREATE INDEX IF NOT EXISTS idx_credited_deposits_created ON credited_deposits(created_at DESC);

-- ── Backfill from the ledger ────────────────────────────────────────────────
-- The trades table already stores the tx hash of every credited deposit.
-- Seeding the table from it repairs history that was double-credited while the
-- in-memory guard was the only protection, and means a re-scan cannot re-credit
-- an old transfer. `on conflict do nothing` makes this safe to re-run.
INSERT INTO credited_deposits (tx_hash, user_address, amount, source, created_at)
SELECT DISTINCT ON (lower(t.tx_hash))
       lower(t.tx_hash),
       lower(t.user_address),
       COALESCE(t.amount, 0),
       'backfill',
       to_timestamp(COALESCE(t.timestamp, 0) / 1000.0)
FROM trades t
WHERE t.tx_hash IS NOT NULL
  AND t.tx_hash <> ''
  AND upper(t.status) IN ('CONFIRMED', 'WON', 'PAID', 'LOST', 'SETTLED')
  AND lower(t.user_address) IS NOT NULL
ON CONFLICT (tx_hash) DO NOTHING;

-- ── Guard: never credit a negative amount ──────────────────────────────────
ALTER TABLE credited_deposits DROP CONSTRAINT IF EXISTS credited_deposits_amount_nonneg;
ALTER TABLE credited_deposits
    ADD CONSTRAINT credited_deposits_amount_nonneg CHECK (amount >= 0);

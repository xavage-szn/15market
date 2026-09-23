-- ─────────────────────────────────────────────────────────────
-- 15market — Supabase `profiles` table: optional columns for
-- full profile durability (trade history).
--
-- The `profiles` table already exists and the backend writes to it
-- out of the box (identity, balance, copy-trading, provider state).
--
-- Run this ALTER TABLE in the Supabase SQL Editor ONLY if you also
-- want in-app trade history (`trades` / `copy_trades`) to persist
-- across backend restarts. Without these columns the backend
-- automatically stores a "slim" payload and trade history stays in
-- the file/Redis backups.
-- ─────────────────────────────────────────────────────────────

alter table public.profiles
  add column if not exists trades jsonb not null default '[]'::jsonb,
  add column if not exists copy_trades jsonb not null default '[]'::jsonb;

-- Upsert convenience (used by the REST upsert with on_conflict=address)
create unique index if not exists profiles_address_key on public.profiles (address);
-- ─────────────────────────────────────────────────────────────
-- 15market — Lock down the `profiles` table.
--
-- PROBLEM: the anonymous (publishable) key can read AND write every
-- row, including copy-trading wallet private keys stored in
-- copy_trading_wallet. The table currently trusts permissive RLS.
--
-- FIX (run this in the Supabase SQL Editor):
--   * Enables row level security.
--   * Drops permissive policies granting anon/authenticated access.
--   * Revokes table-level privileges from anon + authenticated.
--
-- After this, ONLY the backend (via SUPABASE_SERVICE_ROLE_KEY, which
-- bypasses RLS) and you (dashboard owner) can touch the table. The
-- publishable key becomes inert.
-- ─────────────────────────────────────────────────────────────

-- 1) Turn on row level security (policies now gate all access)
alter table public.profiles enable row level security;

-- 2) Drop permissive policies (common dashboard-generated names; safe
--    to run as-is — "if exists" means unknown names are skipped)
drop policy if exists "Enable read access for all users" on public.profiles;
drop policy if exists "Enable insert for authenticated users only" on public.profiles;
drop policy if exists "Enable update for users based on email" on public.profiles;
drop policy if exists "Enable delete for users based on user_id" on public.profiles;
drop policy if exists "profiles_anon_all" on public.profiles;
drop policy if exists "profiles_public_read" on public.profiles;

-- 3) Belt & braces: revoke table privileges from anonymous + signed-in roles
revoke all on table public.profiles from anon, authenticated;

-- Optional extra hardening once everything else works:
--   revoke all on schema public from anon, authenticated;
--   (locks down ALL tables, not just profiles — only enable if the
--    rest of the app doesn't rely on anonymous PostgREST access)

-- Verify afterwards:
--   select * from pg_policies where tablename = 'profiles';
--   (should be empty)
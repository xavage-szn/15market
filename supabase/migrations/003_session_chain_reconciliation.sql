-- Durable state for reconciling the session (trading) wallet's on-chain
-- native USDC balance against the platform's virtual trading ledger.
--
-- Background: the trading balance shown in the UI is a virtual ledger
-- (profiles.balance), not a wallet balance. Historically nothing observed the
-- session EOA on-chain, so USDC transferred directly to the trading wallet
-- address was never credited. These columns let the backend detect that
-- inflow without also crediting the platform's own gas top-ups.
--
-- chain_baseline : on-chain balance observed at the last reconciliation.
--                  Only growth ABOVE this value counts as a new deposit.
--                  NULL means "never observed" — the first pass adopts the
--                  current balance and credits nothing, so a restart can never
--                  re-credit an already-counted balance.
-- chain_gas_owed : on-chain inflow the platform itself caused (gas funding
--                  from _ensureSessionWalletFunded). Absorbed before crediting
--                  so gas is never handed back to the user as trading balance.
alter table public.profiles
  add column if not exists chain_baseline numeric(40, 18),
  add column if not exists chain_gas_owed numeric(40, 18);

comment on column public.profiles.chain_baseline is
  'On-chain session wallet balance at last reconciliation; deposits are the positive delta above this. NULL = never reconciled.';
comment on column public.profiles.chain_gas_owed is
  'On-chain inflow still expected from platform gas funding; excluded from user deposits.';

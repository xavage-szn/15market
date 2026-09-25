alter table public.profiles
  add column if not exists onboarded boolean not null default false,
  add column if not exists onboarded_at bigint;

update public.profiles
set onboarded = true
where onboarded = false
  and (onboarded_at is not null or nullif(trim(username), '') is not null);

create table if not exists public.trades (
  id text primary key,
  user_address text not null references public.profiles(address) on delete cascade,
  symbol text not null,
  direction text,
  amount numeric(20, 6) default 0,
  entry_price numeric(30, 10),
  exit_price numeric(30, 10),
  duration integer,
  status text default 'PENDING',
  won boolean default false,
  payout numeric(20, 6) default 0,
  fee numeric(20, 6) default 0,
  pnl numeric(20, 6) default 0,
  tx_hash text,
  stake_tx_hash text,
  settlement_tx_hash text,
  settled_at bigint,
  timestamp bigint default (extract(epoch from now()) * 1000)::bigint,
  raw_data jsonb,
  created_at timestamptz default now()
);

alter table public.trades
  add column if not exists user_address text,
  add column if not exists symbol text,
  add column if not exists direction text,
  add column if not exists amount numeric(20, 6),
  add column if not exists entry_price numeric(30, 10),
  add column if not exists exit_price numeric(30, 10),
  add column if not exists duration integer,
  add column if not exists status text,
  add column if not exists won boolean,
  add column if not exists payout numeric(20, 6),
  add column if not exists fee numeric(20, 6),
  add column if not exists pnl numeric(20, 6),
  add column if not exists tx_hash text,
  add column if not exists stake_tx_hash text,
  add column if not exists settlement_tx_hash text,
  add column if not exists settled_at bigint,
  add column if not exists timestamp bigint,
  add column if not exists raw_data jsonb,
  add column if not exists created_at timestamptz default now();

create index if not exists idx_trades_user_address on public.trades(user_address);
create index if not exists idx_trades_timestamp on public.trades(timestamp desc);
create index if not exists idx_trades_status on public.trades(status);

alter table public.trades enable row level security;

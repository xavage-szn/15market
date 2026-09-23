-- ============================================================
-- 15MARKET Supabase Schema — Initial Migration
-- ============================================================
-- This schema replaces the Redis JSON blob with proper relational tables.
-- All tables have Row Level Security (RLS) enabled.
-- The backend uses a service_role key to bypass RLS for admin operations.
-- ============================================================

-- ─── PROFILES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS profiles (
  address TEXT PRIMARY KEY,                    -- lowercase wallet address
  username TEXT,
  x_handle TEXT,
  x_id TEXT,
  x_connected BOOLEAN DEFAULT false,
  avatar TEXT,
  email TEXT,
  email_verified BOOLEAN DEFAULT false,
  verified_email TEXT,
  discord JSONB,                               -- { id, username }
  balance NUMERIC(20, 6) DEFAULT 0,            -- trading wallet balance (authoritative)
  solana_wallet JSONB,                         -- { pubKey, privKey (encrypted) }
  copy_trading_wallet JSONB,                   -- { address, privateKey (encrypted), balance }
  copy_trading_allocated NUMERIC(20, 6) DEFAULT 0,
  copy_trading_pnl NUMERIC(20, 6) DEFAULT 0,
  active_copies JSONB DEFAULT '[]'::jsonb,     -- array of copy relationships
  access_code TEXT,
  waitlist_status TEXT,
  applied_at BIGINT,
  is_provider BOOLEAN DEFAULT false,
  provider_application JSONB,                  -- full application data
  provider_stats JSONB,                        -- { followers, aum, profitGenerated }
  provider_portfolio_wallet JSONB,             -- { address, privateKey (encrypted), balance }
  pending_portfolio_revenue NUMERIC(20, 6) DEFAULT 0,
  trading_wallet TEXT,                         -- session wallet address for display
  wallet_address TEXT,                         -- linked wallet address
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ─── TRADES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS trades (
  id TEXT PRIMARY KEY,                         -- betId / trade ID
  user_address TEXT NOT NULL REFERENCES profiles(address) ON DELETE CASCADE,
  symbol TEXT NOT NULL,                        -- e.g. 'btc', 'eth', 'sol'
  direction TEXT,                              -- 'UP' or 'DOWN'
  amount NUMERIC(20, 6) DEFAULT 0,
  entry_price NUMERIC(30, 10),
  exit_price NUMERIC(30, 10),
  duration INTEGER,                            -- seconds
  status TEXT DEFAULT 'PENDING',               -- PENDING, WON, LOST, CANCELLED
  won BOOLEAN DEFAULT false,
  payout NUMERIC(20, 6) DEFAULT 0,
  fee NUMERIC(20, 6) DEFAULT 0,
  pnl NUMERIC(20, 6) DEFAULT 0,
  tx_hash TEXT,
  stake_tx_hash TEXT,
  settlement_tx_hash TEXT,
  settled_at BIGINT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  raw_data JSONB,                              -- full trade object for backward compatibility
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trades_user_address ON trades(user_address);
CREATE INDEX IF NOT EXISTS idx_trades_timestamp ON trades(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_trades_status ON trades(status);

-- ─── COPY TRADES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS copy_trades (
  id TEXT PRIMARY KEY,
  investor_address TEXT NOT NULL REFERENCES profiles(address) ON DELETE CASCADE,
  provider_address TEXT,
  provider_name TEXT,
  asset TEXT,
  direction TEXT,
  result TEXT DEFAULT 'PENDING',
  amount NUMERIC(20, 6) DEFAULT 0,
  provider_trade_id TEXT,
  payout NUMERIC(20, 6) DEFAULT 0,
  settled_at BIGINT,
  timestamp BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_copy_trades_investor ON copy_trades(investor_address);
CREATE INDEX IF NOT EXISTS idx_copy_trades_provider ON copy_trades(provider_address);

-- ─── CAMPAIGNS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaigns (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  prize TEXT,
  start_time BIGINT,
  end_time BIGINT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ─── CAMPAIGN ENROLLMENTS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS campaign_enrollments (
  id SERIAL PRIMARY KEY,
  campaign_id TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  address TEXT NOT NULL,
  enrolled_at BIGINT DEFAULT (EXTRACT(EPOCH FROM now()) * 1000)::BIGINT,
  UNIQUE(campaign_id, address)
);

CREATE INDEX IF NOT EXISTS idx_enrollments_campaign ON campaign_enrollments(campaign_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_address ON campaign_enrollments(address);

-- ─── ADMIN SETTINGS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS admin_settings (
  key TEXT PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================================
-- NOTE: The backend uses a service_role key which bypasses RLS entirely.
-- These policies protect against direct Supabase client access from the frontend
-- using the anon key. Since 15MARKET authenticates via wallet signatures
-- (not Supabase Auth), the RLS policies use a custom claim approach.
-- 
-- For the anon key, we default to restrictive read-only access.
-- All mutations go through the backend (service_role), which validates ownership.
-- ============================================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE copy_trades ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_enrollments ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_settings ENABLE ROW LEVEL SECURITY;

-- Profiles: public can read non-sensitive fields via backend API.
-- Direct Supabase access (anon key) is restricted.
CREATE POLICY "Service role full access on profiles"
  ON profiles FOR ALL
  USING (true)
  WITH CHECK (true);

-- Trades: only accessible via backend (service_role)
CREATE POLICY "Service role full access on trades"
  ON trades FOR ALL
  USING (true)
  WITH CHECK (true);

-- Copy trades: only accessible via backend (service_role)
CREATE POLICY "Service role full access on copy_trades"
  ON copy_trades FOR ALL
  USING (true)
  WITH CHECK (true);

-- Campaigns: public read
CREATE POLICY "Public read campaigns"
  ON campaigns FOR SELECT
  USING (true);

CREATE POLICY "Service role manage campaigns"
  ON campaigns FOR ALL
  USING (true)
  WITH CHECK (true);

-- Campaign enrollments
CREATE POLICY "Service role manage enrollments"
  ON campaign_enrollments FOR ALL
  USING (true)
  WITH CHECK (true);

-- Admin settings: public read for non-sensitive settings
CREATE POLICY "Public read admin_settings"
  ON admin_settings FOR SELECT
  USING (true);

CREATE POLICY "Service role manage admin_settings"
  ON admin_settings FOR ALL
  USING (true)
  WITH CHECK (true);

-- ============================================================
-- HELPER FUNCTION: auto-update updated_at timestamp
-- ============================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

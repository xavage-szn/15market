// ============================================================
// nexus-core/src/supabase.js
// Supabase service-role client for server-side operations.
// Uses the service_role key to bypass Row Level Security.
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

let supabase = null;
let supabaseReady = false;

function getClient() {
  if (!supabase) {
    if (!config.SUPABASE_URL || !config.SUPABASE_SERVICE_ROLE_KEY) {
      console.warn('[Supabase] SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not configured. Supabase is disabled.');
      return null;
    }
    supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });
    supabaseReady = true;
    console.log('[Supabase] Client initialized (service_role mode).');
  }
  return supabase;
}

function isReady() {
  return supabaseReady && !!getClient();
}

// ─── PROFILE HELPERS ────────────────────────────────────────────────────────

/**
 * Get a single profile by address.
 * @param {string} address - lowercase wallet address
 * @returns {object|null} profile data or null
 */
async function getProfile(address) {
  const client = getClient();
  if (!client) return null;
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('address', address.toLowerCase())
      .single();
    if (error && error.code !== 'PGRST116') { // PGRST116 = not found
      console.error('[Supabase] getProfile error:', error.message);
    }
    return data || null;
  } catch (e) {
    console.error('[Supabase] getProfile exception:', e.message);
    return null;
  }
}

/**
 * Upsert a profile (insert or update on conflict).
 * @param {string} address - lowercase wallet address
 * @param {object} data - profile fields to upsert
 * @returns {object|null} upserted profile
 */
async function upsertProfile(address, data) {
  const client = getClient();
  if (!client) return null;
  try {
    const addr = address.toLowerCase();
    // Map camelCase fields to snake_case for Supabase columns
    const mapped = mapProfileToDb(data);
    mapped.address = addr;
    mapped.updated_at = new Date().toISOString();

    const { data: result, error } = await client
      .from('profiles')
      .upsert(mapped, { onConflict: 'address' })
      .select()
      .single();
    if (error) {
      console.error('[Supabase] upsertProfile error:', error.message);
      return null;
    }
    return result;
  } catch (e) {
    console.error('[Supabase] upsertProfile exception:', e.message);
    return null;
  }
}

/**
 * Get all profiles (for admin/stats).
 * @returns {object} map of address -> profile
 */
async function getAllProfiles() {
  const client = getClient();
  if (!client) return {};
  try {
    const { data, error } = await client
      .from('profiles')
      .select('*');
    if (error) {
      console.error('[Supabase] getAllProfiles error:', error.message);
      return {};
    }
    const map = {};
    for (const row of (data || [])) {
      map[row.address] = mapProfileFromDb(row);
    }
    return map;
  } catch (e) {
    console.error('[Supabase] getAllProfiles exception:', e.message);
    return {};
  }
}

// ─── TRADE HELPERS ──────────────────────────────────────────────────────────

/**
 * Insert or update a trade record.
 * @param {string} userAddress
 * @param {object} trade
 */
async function upsertTrade(userAddress, trade) {
  const client = getClient();
  if (!client) return null;
  try {
    const tradeId = String(trade.betId || trade.id || `t-${Date.now()}`);
    const row = {
      id: tradeId,
      user_address: userAddress.toLowerCase(),
      symbol: (trade.symbol || trade.asset || '').toLowerCase(),
      direction: trade.direction !== undefined && trade.direction !== null ? trade.direction : '',
      amount: parseFloat(trade.amount || 0),
      entry_price: trade.entryPrice || null,
      exit_price: trade.exitPrice || trade.settlementPrice || null,
      duration: trade.duration || null,
      status: trade.status || (trade.won ? 'WON' : 'LOST'),
      won: !!(trade.won || trade.status === 'WON'),
      payout: parseFloat(trade.payout || 0),
      fee: parseFloat(trade.fee || 0),
      pnl: parseFloat(trade.pnl || trade.profit || 0),
      tx_hash: trade.txHash || null,
      stake_tx_hash: trade.stakeTxHash || null,
      settlement_tx_hash: trade.settlementTxHash || null,
      settled_at: trade.settledAt || null,
      timestamp: trade.timestamp || Date.now(),
      raw_data: trade
    };

    const { error } = await client
      .from('trades')
      .upsert(row, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase] upsertTrade error:', error.message);
    }
    return row;
  } catch (e) {
    console.error('[Supabase] upsertTrade exception:', e.message);
    return null;
  }
}

/**
 * Get trade history for a user, ordered by timestamp descending.
 * @param {string} userAddress
 * @param {number} limit
 * @returns {Array}
 */
async function getTradeHistory(userAddress, limit = 100) {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from('trades')
      .select('*')
      .eq('user_address', userAddress.toLowerCase())
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[Supabase] getTradeHistory error:', error.message);
      return [];
    }
    // Map back to the format the rest of the codebase expects
    return (data || []).map(row => row.raw_data || mapTradeFromDb(row));
  } catch (e) {
    console.error('[Supabase] getTradeHistory exception:', e.message);
    return [];
  }
}

// ─── COPY TRADE HELPERS ─────────────────────────────────────────────────────

/**
 * Insert a copy trade record.
 */
async function upsertCopyTrade(investorAddress, trade) {
  const client = getClient();
  if (!client) return null;
  try {
    const row = {
      id: trade.id || `ct-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      investor_address: investorAddress.toLowerCase(),
      provider_address: (trade.providerAddress || '').toLowerCase(),
      provider_name: trade.providerName || '',
      asset: trade.asset || '',
      direction: trade.direction || 'UP',
      result: trade.result || 'PENDING',
      amount: parseFloat(trade.amount || 0),
      provider_trade_id: trade.providerTradeId || '',
      payout: parseFloat(trade.payout || 0),
      settled_at: trade.settledAt || null,
      timestamp: trade.timestamp || Date.now()
    };

    const { error } = await client
      .from('copy_trades')
      .upsert(row, { onConflict: 'id' });
    if (error) {
      console.error('[Supabase] upsertCopyTrade error:', error.message);
    }
    return row;
  } catch (e) {
    console.error('[Supabase] upsertCopyTrade exception:', e.message);
    return null;
  }
}

/**
 * Get copy trades for an investor.
 */
async function getCopyTrades(investorAddress, limit = 200) {
  const client = getClient();
  if (!client) return [];
  try {
    const { data, error } = await client
      .from('copy_trades')
      .select('*')
      .eq('investor_address', investorAddress.toLowerCase())
      .order('timestamp', { ascending: false })
      .limit(limit);
    if (error) {
      console.error('[Supabase] getCopyTrades error:', error.message);
      return [];
    }
    return (data || []).map(mapCopyTradeFromDb);
  } catch (e) {
    console.error('[Supabase] getCopyTrades exception:', e.message);
    return [];
  }
}

// ─── FIELD MAPPING UTILITIES ────────────────────────────────────────────────
// Convert between camelCase (app) ↔ snake_case (Supabase)

function mapProfileToDb(profile) {
  const db = {};
  if (profile.address !== undefined) db.address = profile.address;
  if (profile.username !== undefined) db.username = profile.username;
  if (profile.xHandle !== undefined) db.x_handle = profile.xHandle;
  if (profile.xId !== undefined) db.x_id = profile.xId;
  if (profile.xConnected !== undefined) db.x_connected = profile.xConnected;
  if (profile.avatar !== undefined) db.avatar = profile.avatar;
  if (profile.email !== undefined) db.email = profile.email;
  if (profile.emailVerified !== undefined) db.email_verified = profile.emailVerified;
  if (profile.verifiedEmail !== undefined) db.verified_email = profile.verifiedEmail;
  if (profile.discord !== undefined) db.discord = profile.discord;
  if (profile.balance !== undefined) db.balance = parseFloat(profile.balance || 0);
  if (profile.solanaWallet !== undefined) db.solana_wallet = profile.solanaWallet;
  if (profile.copyTradingWallet !== undefined) db.copy_trading_wallet = profile.copyTradingWallet;
  if (profile.copyTradingAllocated !== undefined) db.copy_trading_allocated = profile.copyTradingAllocated;
  if (profile.copyTradingPnl !== undefined) db.copy_trading_pnl = profile.copyTradingPnl;
  if (profile.activeCopies !== undefined) db.active_copies = profile.activeCopies;
  if (profile.accessCode !== undefined) db.access_code = profile.accessCode;
  if (profile.waitlistStatus !== undefined) db.waitlist_status = profile.waitlistStatus;
  if (profile.appliedAt !== undefined) db.applied_at = profile.appliedAt;
  if (profile.isProvider !== undefined) db.is_provider = profile.isProvider;
  if (profile.providerApplication !== undefined) db.provider_application = profile.providerApplication;
  if (profile.providerStats !== undefined) db.provider_stats = profile.providerStats;
  if (profile.providerPortfolioWallet !== undefined) db.provider_portfolio_wallet = profile.providerPortfolioWallet;
  if (profile.pendingPortfolioRevenue !== undefined) db.pending_portfolio_revenue = profile.pendingPortfolioRevenue;
  if (profile.tradingWallet !== undefined) db.trading_wallet = profile.tradingWallet;
  if (profile.walletAddress !== undefined) db.wallet_address = profile.walletAddress;
  if (profile.onboarded !== undefined) db.onboarded = profile.onboarded;
  if (profile.onboardedAt !== undefined) db.onboarded_at = profile.onboardedAt;
  return db;
}

function mapProfileFromDb(row) {
  if (!row) return null;
  return {
    address: row.address,
    username: row.username,
    xHandle: row.x_handle,
    xId: row.x_id,
    xConnected: row.x_connected,
    avatar: row.avatar,
    email: row.email,
    emailVerified: row.email_verified,
    verifiedEmail: row.verified_email,
    discord: row.discord,
    balance: parseFloat(row.balance || 0),
    solanaWallet: row.solana_wallet,
    copyTradingWallet: row.copy_trading_wallet,
    copyTradingAllocated: parseFloat(row.copy_trading_allocated || 0),
    copyTradingPnl: parseFloat(row.copy_trading_pnl || 0),
    activeCopies: row.active_copies || [],
    accessCode: row.access_code,
    waitlistStatus: row.waitlist_status,
    appliedAt: row.applied_at,
    isProvider: row.is_provider,
    providerApplication: row.provider_application,
    providerStats: row.provider_stats,
    providerPortfolioWallet: row.provider_portfolio_wallet,
    pendingPortfolioRevenue: parseFloat(row.pending_portfolio_revenue || 0),
    tradingWallet: row.trading_wallet,
    walletAddress: row.wallet_address,
    onboarded: row.onboarded === true || !!row.onboarded_at || !!row.username,
    onboardedAt: typeof row.onboarded_at === 'number' ? row.onboarded_at : (row.onboarded_at ? Date.parse(row.onboarded_at) : undefined),
    trades: [],       // populated separately
    copyTrades: [],   // populated separately
    createdAt: row.created_at ? new Date(row.created_at).getTime() : 0,
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : (row.created_at ? new Date(row.created_at).getTime() : 0)
  };
}

function mapTradeFromDb(row) {
  return {
    id: row.id,
    betId: row.id,
    userAddr: row.user_address,
    symbol: row.symbol,
    direction: row.direction,
    amount: parseFloat(row.amount || 0),
    entryPrice: parseFloat(row.entry_price || 0),
    exitPrice: parseFloat(row.exit_price || 0),
    duration: row.duration,
    status: row.status,
    won: row.won,
    payout: parseFloat(row.payout || 0),
    fee: parseFloat(row.fee || 0),
    pnl: parseFloat(row.pnl || 0),
    txHash: row.tx_hash,
    stakeTxHash: row.stake_tx_hash,
    settlementTxHash: row.settlement_tx_hash,
    settledAt: row.settled_at,
    timestamp: row.timestamp
  };
}

function mapCopyTradeFromDb(row) {
  return {
    id: row.id,
    providerAddress: row.provider_address,
    providerName: row.provider_name,
    asset: row.asset,
    direction: row.direction,
    result: row.result,
    amount: parseFloat(row.amount || 0),
    providerTradeId: row.provider_trade_id,
    payout: parseFloat(row.payout || 0),
    settledAt: row.settled_at,
    timestamp: row.timestamp
  };
}

module.exports = {
  getClient,
  isReady,
  getProfile,
  upsertProfile,
  getAllProfiles,
  upsertTrade,
  getTradeHistory,
  upsertCopyTrade,
  getCopyTrades,
  mapProfileToDb,
  mapProfileFromDb,
  mapTradeFromDb,
  mapCopyTradeFromDb
};

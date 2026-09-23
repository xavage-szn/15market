// ============================================================
// nexus-core/src/scripts/migrate_to_supabase.js
// Migration script: Migrates all user profiles, trade history,
// and copy trades from Redis / local file backup to Supabase.
// ============================================================
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const fs = require('fs');
const path = require('path');
const Redis = require('ioredis');
const supabase = require('../supabase');

const DATA_DIR = path.join(__dirname, '../../data');
const FILE_PATH = path.join(DATA_DIR, 'profiles.json');

async function runMigration() {
  console.log('====================================================');
  console.log('15MARKET: Starting Redis -> Supabase Migration');
  console.log('====================================================');

  const client = supabase.getClient();
  if (!client) {
    console.error('[Migration ERROR] Supabase client could not be initialized.');
    console.error('Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set in nexus-core/.env');
    process.exit(1);
  }

  // 1. Gather profiles from local file backup
  let fileProfiles = {};
  if (fs.existsSync(FILE_PATH)) {
    try {
      const content = fs.readFileSync(FILE_PATH, 'utf8');
      if (content) {
        fileProfiles = JSON.parse(content);
        console.log(`[Source: File] Found ${Object.keys(fileProfiles).length} profiles in ${FILE_PATH}`);
      }
    } catch (e) {
      console.warn('[Source: File] Could not read profiles.json:', e.message);
    }
  }

  // 2. Gather profiles from Redis (if available)
  let redisProfiles = {};
  let redis = null;
  try {
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379', {
      maxRetriesPerRequest: 1,
      connectTimeout: 3000
    });
    const redisData = await Promise.race([
      redis.get('15market_profiles_db'),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Redis timeout')), 3000))
    ]);
    if (redisData) {
      redisProfiles = JSON.parse(redisData);
      console.log(`[Source: Redis] Found ${Object.keys(redisProfiles).length} profiles in Redis`);
    }
  } catch (e) {
    console.log('[Source: Redis] Redis not accessible or timed out, continuing with file backup');
  } finally {
    if (redis) {
      try { redis.disconnect(); } catch (_) {}
    }
  }

  // 3. Merge profiles (Redis takes precedence over file)
  const combinedProfiles = { ...fileProfiles, ...redisProfiles };
  const addresses = Object.keys(combinedProfiles);
  console.log(`\n[Merge] Total unique profiles to migrate: ${addresses.length}`);

  if (addresses.length === 0) {
    console.log('No profiles found to migrate. Exiting.');
    process.exit(0);
  }

  let profilesMigrated = 0;
  let tradesMigrated = 0;
  let copyTradesMigrated = 0;
  let errors = [];

  for (const addr of addresses) {
    const profile = combinedProfiles[addr];
    const userAddr = addr.toLowerCase();

    console.log(`\nMigrating user: ${userAddr}...`);

    // A. Upsert Profile
    try {
      const res = await supabase.upsertProfile(userAddr, profile);
      if (res) {
        profilesMigrated++;
        console.log(`  ✓ Profile saved`);
      } else {
        errors.push(`Failed to upsert profile for ${userAddr}`);
      }
    } catch (e) {
      errors.push(`Error upserting profile ${userAddr}: ${e.message}`);
    }

    // B. Upsert Trades
    const trades = profile.trades || [];
    if (trades.length > 0) {
      console.log(`  Migrating ${trades.length} trades...`);
      for (const trade of trades) {
        try {
          const res = await supabase.upsertTrade(userAddr, trade);
          if (res) tradesMigrated++;
        } catch (e) {
          errors.push(`Error saving trade ${trade.id || trade.betId} for ${userAddr}: ${e.message}`);
        }
      }
    }

    // C. Upsert Copy Trades
    const copyTrades = profile.copyTrades || [];
    if (copyTrades.length > 0) {
      console.log(`  Migrating ${copyTrades.length} copy trades...`);
      for (const ct of copyTrades) {
        try {
          const res = await supabase.upsertCopyTrade(userAddr, ct);
          if (res) copyTradesMigrated++;
        } catch (e) {
          errors.push(`Error saving copy trade ${ct.id} for ${userAddr}: ${e.message}`);
        }
      }
    }
  }

  console.log('\n====================================================');
  console.log('Migration Complete Summary:');
  console.log(`- Profiles Migrated:    ${profilesMigrated}/${addresses.length}`);
  console.log(`- Trades Migrated:      ${tradesMigrated}`);
  console.log(`- Copy Trades Migrated: ${copyTradesMigrated}`);
  console.log(`- Errors Encountered:   ${errors.length}`);
  if (errors.length > 0) {
    console.log('\nErrors:');
    errors.forEach(err => console.error('  - ' + err));
  }
  console.log('====================================================');
}

runMigration()
  .then(() => process.exit(0))
  .catch(e => {
    console.error('Fatal migration error:', e);
    process.exit(1);
  });

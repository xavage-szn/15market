# Smart Contract Redesign - Deployment Guide

## Changes Made

### ✅ File Modified: `sol_prediction/programs/sol_prediction/src/lib.rs`

#### Change 1: `place_bet` function (Line 27)
**Before:**
```rust
to: ctx.accounts.bet.to_account_info(),  // Sent to Bet PDA
```

**After:**
```rust
to: ctx.accounts.treasury.to_account_info(),  // ✅ Sent to Treasury
```

#### Change 2: `settle_bet` function (Lines 105-120)
**Before:**
```rust
if user_won {
    let profit = payout.checked_sub(bet_amount).unwrap();
    require!(treasury_lamports >= profit, ErrorCode::InsufficientTreasury);
    // Transfer only profit
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= profit;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += profit;
} else {
    // Transfer stake from bet to treasury
    **ctx.accounts.bet.to_account_info().try_borrow_mut_lamports()? -= bet_amount;
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += bet_amount;
}
```

**After:**
```rust
if user_won {
    // Pay full payout (stake + profit) from treasury
    require!(treasury_lamports >= payout, ErrorCode::InsufficientTreasury);
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= payout;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += payout;
} else {
    // Stake already in treasury, no transfer needed
}
```

---

## Deployment Steps

### Prerequisites
- Ensure Anchor CLI is installed and in PATH
- Have deployer wallet funded with SOL
- All active bets must be settled before deployment

### Step 1: Build the Program
```bash
cd c:\Users\HP\Documents\15market\sol_prediction
anchor build
```

### Step 2: Get Program ID
```bash
solana address -k target/deploy/sol_prediction-keypair.json
```

### Step 3: Update Program ID in Code (if changed)
Update `lib.rs` line 3 and `Anchor.toml` with the new program ID if it changed.

### Step 4: Rebuild
```bash
anchor build
```

### Step 5: Deploy to Devnet
```bash
anchor deploy --provider.cluster devnet
```

### Step 6: Initialize Market (if new deployment)
```bash
cd ../keeper
node initialize_market.js
```

### Step 7: Fund Treasury
```bash
node fund_treasury.js
```

### Step 8: Test
1. Place a test bet
2. Verify stake goes to treasury immediately
3. Wait for settlement
4. Verify payout logic works correctly

---

## Verification Commands

### Check Treasury Balance
```bash
cd c:\Users\HP\Documents\15market\keeper
node analyze_funds.js
```

### Monitor Real-time
```bash
node debug_treasury.js
```

---

## Rollback Plan

If issues occur:

1. **Stop the keeper** to prevent new settlements
2. **Restore backup:**
   ```bash
   cd c:\Users\HP\Documents\15market\sol_prediction\programs\sol_prediction\src
   # Find the backup file (lib.rs.backup_YYYYMMDD_HHMMSS)
   Copy-Item lib.rs.backup_YYYYMMDD_HHMMSS lib.rs -Force
   ```
3. **Rebuild and redeploy** old version
4. **Restart keeper**

---

## Testing Checklist

- [ ] Build completes without errors
- [ ] Program deploys successfully
- [ ] Market initializes correctly
- [ ] Treasury receives funds on bet placement
- [ ] Winning bet pays full payout from treasury
- [ ] Losing bet keeps stake in treasury
- [ ] Bet accounts close properly
- [ ] User balances update correctly
- [ ] Keeper settles bets without errors

---

## Current Status

✅ Code changes completed
✅ Backup created
⏳ Awaiting build and deployment

**Next Action:** Run `anchor build` in the sol_prediction directory

---

**Created:** 2026-01-17T02:39:31+01:00
**Modified:** 2026-01-17T02:45:00+01:00

# 🚨 CRITICAL ISSUE: User Stakes Not Going to Treasury

## Executive Summary

**Problem:** When users place bets on Solana, their stakes are NOT immediately added to the treasury. Instead, funds are held in individual Bet PDA accounts until settlement.

**Impact:** 
- Treasury only receives funds AFTER a losing bet is settled
- Active bets show as "escrow" but funds are in Bet PDAs, not treasury
- If settlement fails or is delayed, funds remain locked in Bet accounts

---

## Technical Analysis

### Current Flow (What's Happening Now)

#### 1. **When User Places Bet** (`place_bet` function - lines 17-45 in lib.rs)

```rust
// Lines 22-31: Transfer from user to BET ACCOUNT (not treasury!)
anchor_lang::system_program::transfer(
    CpiContext::new(
        ctx.accounts.system_program.to_account_info(),
        anchor_lang::system_program::Transfer {
            from: ctx.accounts.user.to_account_info(),
            to: ctx.accounts.bet.to_account_info(),  // ❌ FUNDS GO HERE
        },
    ),
    amount_lamports,
)?;
```

**Result:** User's stake sits in the Bet PDA account, NOT in treasury.

---

#### 2. **When User WINS** (`settle_bet` function - lines 103-115)

```rust
if user_won {
    let profit = payout.checked_sub(bet_amount).unwrap();
    
    // Transfer profit from treasury to user
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= profit;
    **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += profit;
}
// Bet account closes (line 213: close = owner)
// Original stake returns to user automatically via account closure
```

**Result:** 
- Treasury pays out profit
- Bet account closes and refunds original stake to user
- ✅ This works correctly

---

#### 3. **When User LOSES** (`settle_bet` function - lines 116-121)

```rust
} else {
    // User lost: transfer entire bet amount to treasury
    **ctx.accounts.bet.to_account_info().try_borrow_mut_lamports()? -= bet_amount;
    **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += bet_amount;
}
// Then bet account closes
```

**Result:** 
- Funds transfer from Bet PDA to Treasury ONLY during settlement
- ⚠️ If settlement is delayed, funds stay in Bet PDA
- ⚠️ If settlement fails, funds are trapped

---

## Where User Stakes Actually Are

### Fund Locations:

1. **Active Bets (Unsettled):** 
   - Location: Individual Bet PDA accounts
   - Example: `bet_v6 + user_pubkey + nonce`
   - Status: Locked until settlement

2. **Losing Bets (After Settlement):**
   - Location: Treasury PDA
   - Transfer happens in `settle_bet` function

3. **Winning Bets (After Settlement):**
   - Location: Returned to user
   - Original stake from Bet PDA closure
   - Profit from Treasury

---

## Current Treasury Balance

Based on the debug script output:
- **Treasury PDA:** `DQWpJWfGhw1T1t8sZVCnxeztLF` (truncated)
- **Current Balance:** ~5 SOL
- **Source:** Only from settled losing bets + initial funding

---

## Why This is a Problem

### 1. **Misleading Metrics**
- "Active Escrow" shows funds in Bet PDAs, not treasury
- Admin dashboard may show incorrect treasury balance
- Treasury appears empty even with active bets

### 2. **Settlement Risk**
- If keeper fails to settle, funds stay in Bet PDAs
- Network congestion can delay settlements
- Failed settlements leave funds locked

### 3. **Liquidity Management**
- Treasury needs to be pre-funded to pay winners
- Can't use active bet stakes as liquidity
- Higher capital requirements

---

## How to Verify This Issue

### Check Bet Account Balances:

Run this command to see all active bet accounts:
```bash
cd c:\Users\HP\Documents\15market\keeper
node check_bet_accounts.js
```

This will show:
- All bet accounts and their balances
- Which bets are resolved vs active
- Total SOL locked in bet accounts

### Monitor Treasury in Real-Time:

```bash
node debug_treasury.js
```

This will:
- Show current treasury balance
- Listen for treasury balance changes
- Confirm when funds actually arrive

---

## Solution Options

### Option 1: **Immediate Treasury Transfer (Recommended)**

Modify `place_bet` to send funds directly to treasury:

```rust
// Change line 27 from:
to: ctx.accounts.bet.to_account_info(),

// To:
to: ctx.accounts.treasury.to_account_info(),
```

**Pros:**
- Immediate treasury funding
- Simpler accounting
- No settlement risk for stake collection

**Cons:**
- Need to modify payout logic
- Requires program redeployment
- Breaking change

---

### Option 2: **Keep Current Design (Document It)**

Keep funds in Bet PDAs but improve monitoring:

**Pros:**
- No code changes needed
- Cleaner separation of concerns
- Bet accounts are self-contained

**Cons:**
- Complex accounting
- Settlement dependency
- Requires robust keeper

---

## Recommended Action Plan

### Immediate (No Code Changes):

1. ✅ **Document the current flow** (this file)
2. ✅ **Update admin dashboard** to show:
   - Treasury balance (settled funds only)
   - Active escrow (funds in Bet PDAs)
   - Total platform funds (treasury + escrow)

3. ✅ **Monitor keeper reliability**
   - Ensure settlements complete quickly
   - Alert on settlement failures
   - Track bet account balances

### Long-term (Requires Redeployment):

1. **Redesign fund flow** to send stakes directly to treasury
2. **Update settlement logic** to handle payouts from treasury
3. **Test thoroughly** on devnet
4. **Migrate existing bets** before mainnet deployment

---

## Current Keeper Behavior

The keeper (`src/index.js`) correctly:
- ✅ Detects new bets via WebSocket and polling
- ✅ Tracks active bets in memory
- ✅ Settles bets when they expire
- ✅ Transfers losing stakes to treasury during settlement
- ✅ Pays winners from treasury

**The keeper is working as designed.** The issue is the design itself - funds don't go to treasury until settlement.

---

## Files Involved

### Smart Contract:
- `sol_prediction/programs/sol_prediction/src/lib.rs`
  - Line 22-31: `place_bet` transfer logic
  - Line 117-120: `settle_bet` losing bet transfer

### Keeper:
- `keeper/src/index.js` - Main settlement loop
- `keeper/src/settle.js` - Settlement execution
- `keeper/src/pdas.js` - PDA derivation

### Frontend:
- `15market-ui/src/api/program.js` - Program interface
- `15market-ui/src/api/pdas.js` - PDA helpers
- `15market-ui/src/UserApp.jsx` - Bet placement (lines 1026-1041)

---

## Conclusion

**The system is working as designed, but the design has a critical flaw:**

User stakes are held in Bet PDA accounts until settlement, not immediately added to the treasury. This creates:
- Accounting complexity
- Settlement dependency
- Potential fund lock-up risk

**Recommendation:** Either redesign the fund flow OR clearly document this behavior and ensure robust settlement monitoring.

---

## Next Steps

1. **Verify current state:**
   ```bash
   node check_bet_accounts.js  # See where funds are
   node debug_treasury.js       # Monitor treasury
   ```

2. **Decide on approach:**
   - Keep current design + improve monitoring
   - OR redesign fund flow (requires redeployment)

3. **Update documentation:**
   - Admin dashboard tooltips
   - User-facing explanations
   - Developer docs

---

**Generated:** 2026-01-17T02:33:40+01:00
**Analyst:** Antigravity AI
**Status:** CRITICAL - Requires Decision

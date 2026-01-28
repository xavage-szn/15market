# Smart Contract Redesign Proposal
## Send User Stakes Directly to Treasury

### Current Problem
User stakes are held in individual Bet PDA accounts until settlement, creating:
- Complex accounting (treasury + all bet PDAs)
- Settlement dependency for fund collection
- Potential fund lock-up if settlement fails

### Proposed Solution
Modify the `place_bet` function to send stakes directly to treasury, then adjust settlement logic accordingly.

---

## Code Changes Required

### File: `sol_prediction/programs/sol_prediction/src/lib.rs`

#### Change 1: Modify `place_bet` function (Lines 17-45)

**Current Code:**
```rust
pub fn place_bet(ctx: Context<PlaceBet>, direction: u8, amount_lamports: u64, entry_price: u64, nonce: u64, duration: u8) -> Result<()> {
    require!(direction <= 1, ErrorCode::InvalidDirection);
    require!(amount_lamports > 0, ErrorCode::InvalidAmount);
    require!(duration == 5 || duration == 10 || duration == 15, ErrorCode::InvalidDuration);

    // ❌ CURRENT: Sends to Bet PDA
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.bet.to_account_info(),  // ❌ Goes to Bet PDA
            },
        ),
        amount_lamports,
    )?;

    let bet = &mut ctx.accounts.bet;
    bet.owner = ctx.accounts.user.key();
    bet.amount_lamports = amount_lamports;
    bet.direction = direction;
    bet.entry_price = entry_price;
    bet.nonce = nonce;
    bet.duration = duration;
    bet.timestamp = Clock::get()?.unix_timestamp;
    bet.resolved = false;
    bet.bump = ctx.bumps.bet;

    Ok(())
}
```

**Proposed Code:**
```rust
pub fn place_bet(ctx: Context<PlaceBet>, direction: u8, amount_lamports: u64, entry_price: u64, nonce: u64, duration: u8) -> Result<()> {
    require!(direction <= 1, ErrorCode::InvalidDirection);
    require!(amount_lamports > 0, ErrorCode::InvalidAmount);
    require!(duration == 5 || duration == 10 || duration == 15, ErrorCode::InvalidDuration);

    // ✅ NEW: Send stake directly to treasury
    anchor_lang::system_program::transfer(
        CpiContext::new(
            ctx.accounts.system_program.to_account_info(),
            anchor_lang::system_program::Transfer {
                from: ctx.accounts.user.to_account_info(),
                to: ctx.accounts.treasury.to_account_info(),  // ✅ Goes to Treasury
            },
        ),
        amount_lamports,
    )?;

    // Bet account now only stores metadata (no funds)
    let bet = &mut ctx.accounts.bet;
    bet.owner = ctx.accounts.user.key();
    bet.amount_lamports = amount_lamports;
    bet.direction = direction;
    bet.entry_price = entry_price;
    bet.nonce = nonce;
    bet.duration = duration;
    bet.timestamp = Clock::get()?.unix_timestamp;
    bet.resolved = false;
    bet.bump = ctx.bumps.bet;

    Ok(())
}
```

---

#### Change 2: Modify `settle_bet` function (Lines 83-143)

**Current Code:**
```rust
pub fn settle_bet(ctx: Context<SettleBet>, user_won: bool) -> Result<()> {
    let bet = &mut ctx.accounts.bet;
    require!(!bet.resolved, ErrorCode::AlreadySettled);
    
    let bet_amount = bet.amount_lamports;
    
    let multiplier_bp = match bet.duration {
        5 => 698,
        10 => 498,
        _ => 198,
    };

    let payout = bet_amount.checked_mul(multiplier_bp).unwrap().checked_div(100).unwrap(); 

    bet.resolved = true;

    if user_won {
        let profit = payout.checked_sub(bet_amount).unwrap();
        
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let treasury_lamports = treasury_info.lamports();
        
        require!(treasury_lamports >= profit, ErrorCode::InsufficientTreasury);

        // Transfer profit from treasury to user
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= profit;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += profit;
    } else {
        // User lost: transfer entire bet amount to treasury
        **ctx.accounts.bet.to_account_info().try_borrow_mut_lamports()? -= bet_amount;
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? += bet_amount;
    }

    // Update profile...
    Ok(())
}
```

**Proposed Code:**
```rust
pub fn settle_bet(ctx: Context<SettleBet>, user_won: bool) -> Result<()> {
    let bet = &mut ctx.accounts.bet;
    require!(!bet.resolved, ErrorCode::AlreadySettled);
    
    let bet_amount = bet.amount_lamports;
    
    let multiplier_bp = match bet.duration {
        5 => 698,
        10 => 498,
        _ => 198,
    };

    let payout = bet_amount.checked_mul(multiplier_bp).unwrap().checked_div(100).unwrap(); 

    bet.resolved = true;

    if user_won {
        // ✅ NEW: Pay full payout from treasury (includes original stake + profit)
        let treasury_info = ctx.accounts.treasury.to_account_info();
        let treasury_lamports = treasury_info.lamports();
        
        require!(treasury_lamports >= payout, ErrorCode::InsufficientTreasury);

        // Transfer full payout from treasury to user
        **ctx.accounts.treasury.to_account_info().try_borrow_mut_lamports()? -= payout;
        **ctx.accounts.owner.to_account_info().try_borrow_mut_lamports()? += payout;
    } else {
        // ✅ NEW: User lost - stake is already in treasury, nothing to transfer
        // Treasury keeps the stake (no transfer needed)
    }

    // Update profile...
    Ok(())
}
```

---

## Benefits of This Redesign

### 1. **Immediate Treasury Funding** ✅
- All user stakes go directly to treasury
- Treasury balance accurately reflects total platform funds
- No need to track individual bet PDAs

### 2. **Simpler Accounting** ✅
- Treasury balance = Total platform funds
- Admin dashboard shows accurate real-time balance
- No complex escrow calculations needed

### 3. **No Settlement Risk for Stakes** ✅
- Stakes are already in treasury
- Settlement only handles payouts (wins) or nothing (losses)
- Failed settlements don't lock up user funds

### 4. **Cleaner Code** ✅
- Losing bets require no transfer (stake already in treasury)
- Winning bets pay full amount from treasury
- Bet PDAs become pure metadata (no funds)

---

## Risks & Considerations

### 1. **Breaking Change** ⚠️
- Requires program redeployment
- Existing active bets would need migration or settlement
- Cannot be deployed while bets are active

### 2. **Treasury Liquidity** ⚠️
- Treasury must always have enough for max possible payouts
- Need to monitor treasury health more carefully
- Consider implementing treasury low-balance alerts

### 3. **Testing Required** ⚠️
- Thorough testing on devnet
- Test all scenarios: wins, losses, edge cases
- Verify rent-exempt minimums still work

---

## Migration Plan

### Phase 1: Preparation (Before Deployment)
1. ✅ Ensure all active bets are settled
2. ✅ Backup current program state
3. ✅ Test new program thoroughly on devnet
4. ✅ Update keeper to handle new settlement logic

### Phase 2: Deployment
1. Deploy new program version
2. Initialize new market/treasury if needed
3. Fund treasury with initial liquidity
4. Update frontend to use new program

### Phase 3: Verification
1. Place test bets
2. Verify stakes go to treasury immediately
3. Test settlement for both wins and losses
4. Monitor treasury balance in real-time

---

## Alternative: Keep Current Design

If redeployment is too risky, we can keep the current design but:

### Improvements:
1. **Update Admin Dashboard** to show:
   - Treasury balance (settled funds)
   - Active escrow (funds in bet PDAs)
   - Total platform funds (sum of both)

2. **Add Monitoring**:
   - Alert on settlement failures
   - Track bet PDA balances
   - Monitor keeper reliability

3. **Documentation**:
   - Clearly explain fund flow to users
   - Add tooltips in admin panel
   - Update developer docs

---

## Recommendation

**For Production/Mainnet:** Implement the redesign (send stakes to treasury)
- Cleaner architecture
- Better user experience
- Simpler operations

**For Current Devnet:** Keep current design + improve monitoring
- Less risk
- No downtime
- Can test redesign in parallel

---

## Next Steps

1. **Decision**: Choose redesign or keep current
2. **If Redesign**: 
   - Modify `lib.rs` as shown above
   - Test on devnet
   - Deploy when ready
3. **If Keep Current**:
   - Update admin dashboard (Task 3)
   - Improve monitoring
   - Document clearly

---

**Created:** 2026-01-17
**Status:** Awaiting Decision

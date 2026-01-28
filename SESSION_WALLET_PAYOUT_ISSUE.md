# Session Wallet Payout Issue - CRITICAL FINDING

## Problem
User reports winnings not appearing in wallet balance after winning bets.

## Root Cause
When using **session mode** (auto-signer):
- Bets are placed from the **session wallet** (burner wallet)
- Winnings are paid to the **bet owner** = **session wallet**
- User's **main wallet** balance doesn't change

## Technical Details

### Bet Placement (UserApp.jsx line 1055-1059)
```javascript
.accounts({
  user: activeWallet.publicKey,  // Session wallet if in session mode
  ...
})
.remainingAccounts(
  sessionMode ? [{ pubkey: wallet.publicKey }] : []  // Main wallet stored as main_owner
)
```

### Smart Contract (lib.rs line 35-40)
```rust
bet.owner = ctx.accounts.user.key();  // Session wallet
bet.main_owner = ctx.remaining_accounts.get(0)
    .map(|a| a.key())
    .unwrap_or(ctx.accounts.user.key());  // Main wallet
```

### Settlement (lib.rs line 119-120)
```rust
**treasury_info.try_borrow_mut_lamports()? -= payout;
**owner_info.try_borrow_mut_lamports()? += payout;  // Pays to bet.owner = session wallet!
```

## Current Behavior
1. User places bet in session mode
2. Stake deducted from session wallet
3. User wins
4. Payout sent to session wallet
5. **Session wallet balance increases**
6. **Main wallet balance unchanged**
7. User thinks winnings weren't paid

## Solutions

### Option 1: Show Combined Balance (Quick Fix)
Display: `Main Wallet + Session Wallet` as total balance

### Option 2: Auto-Withdraw Winnings (Better UX)
After settlement, automatically transfer winnings from session to main wallet

### Option 3: Pay to Main Wallet (Requires Contract Change)
Change settlement to pay `bet.main_owner` instead of `bet.owner`
- **Pros**: Winnings go directly to main wallet
- **Cons**: Requires redeployment, session wallet rent not recovered

### Option 4: Clear UI Indication (Immediate)
Show session wallet balance prominently with "Withdraw" button

## Recommended Immediate Fix
**Option 4**: Make it clear that funds are in session wallet

Add to UI:
```
Session Wallet: 0.15 SOL [Withdraw All]
Main Wallet: 1.50 SOL
```

## Long-term Fix
**Option 3**: Modify smart contract to pay winnings to `main_owner` instead of `owner`

This way:
- Session wallet only holds temporary stake
- Winnings go directly to main wallet
- User sees profit immediately

## Files to Modify for Quick Fix
- `15market-ui/src/components/DashboardPage.jsx` - Show session balance prominently
- `15market-ui/src/UserApp.jsx` - Add visual indicator when in session mode

## Files to Modify for Long-term Fix
- `sol_prediction/programs/sol_prediction/src/lib.rs` - Change payout recipient
- Redeploy program
- Update all frontends

## Current Workaround
Users must manually withdraw from session wallet to main wallet using the Dashboard.

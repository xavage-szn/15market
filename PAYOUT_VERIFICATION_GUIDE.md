# Solana Winnings Payout - Verification Guide

## Current Status ✅

### System Health
- ✅ Keeper running and funded (0.99 SOL)
- ✅ Treasury funded (1.34 SOL - increased from 1.05 SOL)
- ✅ Market initialized
- ✅ RPC connection working (public Solana devnet)
- ✅ Balance update race condition fixed

### Treasury Activity
**Initial**: 1.05 SOL  
**Current**: 1.34 SOL  
**Change**: +0.29 SOL (bets have been placed!)

## How Payouts Work

### Session Mode (Auto-Signer)
1. User places bet → Stake goes from **session wallet** to treasury
2. Bet expires
3. Keeper settles bet
4. If won → Winnings go from treasury to **session wallet**
5. User withdraws from session wallet to main wallet

### Direct Mode (Manual Signing)
1. User places bet → Stake goes from **main wallet** to treasury
2. Bet expires
3. Keeper settles bet
4. If won → Winnings go from treasury to **main wallet**

## Verification Steps

### Step 1: Monitor Treasury in Real-Time
```bash
cd keeper
node monitor_treasury.js
```

This will show:
- `💰 DEPOSIT` when bets are placed (stake added to treasury)
- `💸 WITHDRAWAL` when winnings are paid (funds leaving treasury)

### Step 2: Place a Test Bet
1. Open UI at http://localhost:5173
2. Connect Solana wallet
3. **Important**: Note which mode you're in:
   - Session mode: Check "Session Wallet" balance
   - Direct mode: Check main wallet balance
4. Place a **small bet** (0.005 SOL minimum)
5. Choose **5-second duration** for fast testing

### Step 3: Watch for Settlement
After 5 seconds, you should see in keeper logs:
```
[KEEPER] 🔔 NEW BET DETECTED LIVE
✨ [BET_DATA] ID:... | AMT:... | EXP:...
[KEEPER] 🔍 Processing 1 settlement(s)
[SETTLER] Settling bet ... | Symbol: BTC | Live: 95234.5
[SETTLER] Result: WIN | Entry: 95000 | Exit: 95234.5
✅ [SOL_PAYOUT] Winner DSz...97A received 0.0349 SOL
```

### Step 4: Verify Payout
In the treasury monitor, you should see:
```
[01:15:45] 💸 WITHDRAWAL: -0.0349 SOL (Winnings paid!)
           New Balance: 1.30595352 SOL
```

### Step 5: Check Wallet Balance

**If using Session Mode:**
- Open Dashboard
- Check "Session Wallet" balance - should have increased
- Click "Withdraw All" to move funds to main wallet

**If using Direct Mode:**
- Check main wallet balance - should have increased immediately

## Troubleshooting

### Issue: No settlement happening
**Check:**
1. Is keeper running? `netstat -ano | findstr :8080`
2. Keeper logs showing bet detection?
3. Is bet expired? (check duration)

### Issue: Settlement fails
**Check keeper logs for:**
- `InsufficientTreasury` → Treasury needs more funds
- `AlreadySettled` → Bet already settled
- `Unauthorized` → Keeper not authorized

### Issue: Winnings not in main wallet
**If using session mode:**
- This is expected! Check session wallet balance
- Use Dashboard → Withdraw to move funds

**If using direct mode:**
- Check transaction on Solana Explorer
- Verify wallet address matches bet owner

## Quick Test Commands

```bash
# Check keeper status
cd keeper
node test_settlement.js

# Monitor treasury real-time
node monitor_treasury.js

# Check treasury balance
node check_sol_treasury.js

# Check market status
node check_market.js
```

## Expected Behavior

### Winning Bet (5s duration, 6.98x multiplier)
- Stake: 0.005 SOL
- Payout: 0.005 × 6.98 = 0.0349 SOL
- Net profit: 0.0349 - 0.005 = 0.0299 SOL

### Losing Bet
- Stake: 0.005 SOL
- Payout: 0 SOL
- Net loss: -0.005 SOL (stake swept to treasury)

## Verification Checklist

- [ ] Keeper running without errors
- [ ] Treasury monitor shows deposits when bets placed
- [ ] Treasury monitor shows withdrawals when bets won
- [ ] Session wallet balance increases (if using session mode)
- [ ] Main wallet balance increases (if using direct mode)
- [ ] Withdraw function works (session → main wallet)

## Current Evidence

✅ **Treasury increased from 1.05 to 1.34 SOL** → Bets are being placed  
✅ **Keeper is running and ready** → Can settle bets  
✅ **Balance update fix applied** → UI will show changes  

**Next**: Place a test bet and verify the complete flow!

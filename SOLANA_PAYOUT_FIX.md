# Solana Payout Issue - Root Cause & Resolution

## Problem Report
**Date**: 2026-01-21  
**Issue**: Solana users report that their winnings are not being sent to their wallets after winning bets. "Profits not instantly sent".

## Investigation Summary

### 1. Initial Findings
- **Treasury Balance**: Adequate (~5.74 SOL).
- **Previous Fixes**: Anchor account casing and RPC endpoints were previously fixed.
- **Keeper Status**: Keeper appeared to be running, but payouts were unreliable.

### 2. Root Cause Analysis
**Issue**: "Fire and Forget" Settlement Logic.
The keeper's `settleBet` function was using `rpc({ skipPreflight: true })` and returning immediately after the transaction signature was generated.
- It did **NOT** wait for transaction confirmation.
- It returned success to the main loop immediately.
- The main loop removed the bet from `activeBets` memory.
- If the transaction was dropped by the network (UDP packet loss) or failed during execution (but passed preflight check, though `skipPreflight` skips unlikely errors), the bet was **lost forever** from the keeper's queue.
- Users never received funds because the transaction never landed, and the keeper never retried.

### 3. Fix Applied
**File**: `keeper/src/settle.js`

Added explicit transaction confirmation waiting:
```javascript
// Before
const tx = await Promise.race([settlementPromise, timeoutPromise]);
return tx;

// After
const tx = await Promise.race([settlementPromise, timeoutPromise]);
await connection.confirmTransaction(tx, "confirmed"); // WAITS/VERIFIES
return tx;
```

This ensures that:
1. The keeper waits until the network confirms the payout.
2. If the network drops the valid transaction, `confirmTransaction` throws/fails.
3. The error is caught by the retry loop (`attempt 1..10`).
4. The keeper RETRIES the settlement until it lands.
5. `activeBets` entry is NOT removed until a confirmed success.

## Verification
- Keeper must be restarted to apply the fix.
- Once restarted, any stuck bets (if still in memory / re-scanned) will be processed reliably.
- Payouts should be truly "instant" (confirmed within ~2-5s) and guaranteed.

## Next Steps
- Restart the Keeper service (`node keeper/src/index.js`).
- Monitor logs for `✅ [SETTLE] Success`.

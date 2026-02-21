# Auto-Signer (Session Wallet) Payout Fix

## Problem
When auto-signer was used to trade and the trade won, winnings appeared to flash in the session balance and then go to the main wallet. Users expected winnings to stay in the session wallet until explicitly withdrawn.

## Root Cause Analysis

### On-Chain Flow: ✅ CORRECT
The smart contract (`ArcPrediction.sol`) correctly handles payouts:
- `placeBet()` accepts `_payoutAddress` param → sets `bet.user` to session wallet
- `settleBet()` sends payout to `bet.user` → session wallet receives funds on-chain
- `BetSettled` event emits session wallet as `user`

The backend `/session/trade` endpoint correctly passes `wallet.address` (session wallet) as `_payoutAddress`.

### Frontend Flow: HAD BUGS

**Bug 1: Balance Polling Overwriting Optimistic Credits**
- `updateEvmSessionBal()` polls on-chain balance every 2.5 seconds
- After an optimistic credit (+payout to sessionBalance), the poller runs
- If the on-chain settlement hasn't confirmed yet (takes ~2-5s), the poller reads the OLD balance
- This RESETS sessionBalance to the pre-payout value
- Result: Winnings appear briefly then vanish, looking like they went elsewhere

**Bug 2: `reconcileTrades` Losing `balanceApplied` Flag**
- Backend data merge was overwriting local trade objects
- `balanceApplied` flag (prevents double-crediting) was lost during merge
- This caused the BetSettled handler to double-credit or miss credits

**Bug 3: Session Trade Identification Fragile**
- Only checked `tradeOwner === sessionAddr` based on address match
- If the trade's `owner` field was different casing or format, it could fail
- Didn't use the explicit `isSessionTrade` flag

## Fixes Applied

### 1. Settlement Cooldown Window (12s)
```javascript
const lastSettlementCreditTime = useRef(0);
```
After a settlement credit is applied, balance polling is paused for 12 seconds. This prevents the on-chain poller from overwriting the optimistic credit before the blockchain confirms.

### 2. Preserved Local Flags During Data Merge
In `reconcileTrades`, local-only fields are now preserved when merging with backend data:
- `balanceApplied` — Prevents double-crediting
- `isSessionTrade` — Tracks which wallet mode placed the trade
- `optimistic` — Tracks locally-computed results

### 3. Dual-Signal Session Trade Detection
Both crediting paths now check:
```javascript
if (normalizedUser === sessionAddr || trade.isSessionTrade)
```
This uses both the address match AND the explicit `isSessionTrade` flag.

### 4. Delayed Authoritative Balance Refresh
After settlement, two delayed refreshes are scheduled:
- 3s: Targeted refresh (session or main, based on trade type)
- 8s: Full refresh (both wallets)
This catches the actual on-chain payout after confirmation.

## Files Modified
1. `15market-ui/src/UserApp.jsx` — All frontend crediting and polling logic

## Architecture Summary (Post-Fix)

```
TRADE FLOW:
1. User places trade in session mode
2. Backend uses session wallet to call placeBet(payoutAddr=sessionWallet)
3. Smart contract records bet.user = sessionWallet
4. Settlement sends payout → sessionWallet on-chain ✅

BALANCE DISPLAY:
1. Optimistic credit → setSessionBalance(prev + payout)
2. Cooldown activated → polling paused 12s
3. Delayed forced refresh → reads confirmed on-chain balance
4. Result: Smooth display, no "flash" effect

WITHDRAWAL (Explicit Only):
1. User clicks "Sweep to Main" → signs authorization
2. Backend derives session wallet → sends funds to main wallet
3. Both balances update
```

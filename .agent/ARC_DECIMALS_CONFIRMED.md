# Arc Network Decimal Precision - CONFIRMED

## ✅ CONFIRMED: Arc Uses 18 Decimals for msg.value

According to official Arc documentation:

> "When USDC is used as the native gas token, it operates with **18 decimals** of precision for native balance movements and gas fees."

### Two USDC Representations on Arc:

1. **Native USDC (msg.value):** 18 decimals - Used for gas fees and native transfers
2. **ERC-20 USDC (0x3600...):** 6 decimals - Optional interface for ERC-20 functions

### Our Contract Uses:
- `msg.value` → **18 decimals** ✅

### Current Code Status:
- Frontend: **18 decimals** ✅
- Backend: **18 decimals** ✅

## 🔴 So Why Are Transactions Still Reverting?

Since decimal precision is correct, the issue must be one of these:

### Possible Causes:

1. **Bet ID Collision**
   - Using `Date.now()` for bet IDs might cause collisions
   - Contract requires: `!bets[_betId].settled && bets[_betId].user == address(0)`

2. **Insufficient Gas**
   - Gas limit might be too low
   - Current: 600,000 (session) / 800,000 (main wallet)

3. **Invalid Parameters**
   - Direction must be 0 or 1
   - Entry price format
   - Market ID

4. **Contract Balance**
   - Contract might need initial funding

5. **RPC Issues**
   - Transaction not being broadcast properly

## 🔍 Next Steps:

1. Check Arc testnet explorer for failed transactions from user's wallet
2. Look at the revert reason
3. Fix the specific issue causing the revert

## Explorer Link:
https://testnet.arcscan.app/

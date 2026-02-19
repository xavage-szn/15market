# Arc Network Native Currency Investigation

## The Problem

Transactions are reverting and stakes are returning to users' wallets. This indicates the `placeBet` function is failing.

## Possible Causes

### 1. Decimal Mismatch
Arc uses USDC as native currency. The question is: **Does `msg.value` use 6 decimals (USDC standard) or 18 decimals (EVM standard)?**

### 2. Contract Requirements
The contract has these requirements:
```solidity
require(msg.value > 0, "Bet amount must be greater than 0");
require(_direction == 0 || _direction == 1, "Invalid direction");
require(!bets[_betId].settled && bets[_betId].user == address(0), "Bet ID already exists");
```

## Investigation Steps

1. ✅ Verified contract is deployed at `0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8`
2. ✅ Checked for recent transactions - **NONE FOUND** (confirms all are reverting)
3. ⏳ Need to determine correct decimal precision

## Testing Strategy

We need to test with BOTH decimal precisions to see which one works:

### Test A: 6 Decimals (USDC Standard)
- Send `1 * 10^6` wei for 1 USDC bet
- If this works, Arc uses 6 decimals for `msg.value`

### Test B: 18 Decimals (EVM Standard)  
- Send `1 * 10^18` wei for 1 USDC bet
- If this works, Arc uses standard 18 decimals

## Recommendation

**Check Arc's official documentation or explorer** to see how other contracts handle `msg.value` on Arc network.

Alternatively, we can:
1. Deploy a simple test contract that logs `msg.value`
2. Send a small amount and see what value is logged
3. This will definitively tell us the decimal precision

## Current Status

- Frontend: Using 18 decimals
- Backend: Using 18 decimals
- **Result: All transactions reverting**

This suggests either:
- Arc uses 6 decimals (need to switch back)
- There's another issue (bet ID collision, direction parameter, etc.)

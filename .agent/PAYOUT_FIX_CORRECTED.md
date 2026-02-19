# Arc Native Currency Fix - CORRECTED

## 🔴 The Real Problem

**Issue:** User stakes were returning to their wallets after placing trades instead of being held by the contract.

**Root Cause:** I initially misunderstood Arc's token structure. Here's the correct understanding:

### Arc Network Token Structure:
- **Native Gas Token (msg.value):** Uses **18 decimals** (like ETH on Ethereum)
- **USDC ERC20 Token:** Uses **6 decimals** (standard USDC)

The contract uses `msg.value` (native currency with 18 decimals), NOT the USDC ERC20 token.

## ❌ What I Did Wrong Initially

I incorrectly changed everything to 6 decimals thinking Arc used USDC as the native currency. This was WRONG.

## ✅ The Correct Fix

**Arc's native currency uses 18 decimals (standard EVM)**, so all `msg.value` operations must use 18 decimals.

### Frontend Changes (`15market-ui/src/UserApp.jsx`)

**Reverted back to 18 decimals:**

1. **Trade execution (line 1202):**
   ```javascript
   const amountWei = parseUnits(amount.toString(), 18); // Arc Native currency uses 18 decimals (msg.value)
   ```

2. **Auto-signer fee (line 1210):**
   ```javascript
   const feeWei = parseUnits(signerFee.toFixed(18), 18); // Arc Native currency uses 18 decimals
   ```

3. **Payout formatting (line 1392):**
   ```javascript
   const formattedPayout = (Number(payout) / 10 ** 18).toFixed(4); // Arc native currency is 18 decimals
   ```

### Backend Changes (`backend/arc-keeper/src/index.js`)

**Reverted back to 18 decimals:**

1. **Admin withdraw (line 260):**
   ```javascript
   const amtWei = ethers.parseUnits(amount.toString(), 18); // Arc Native currency uses 18 decimals
   ```

2. **Treasury balance check (line 673):**
   ```javascript
   const ethBal = ethers.formatUnits(bal, 18); // Arc Native currency uses 18 decimals
   ```

3. **Keeper gas balance (line 680-682):**
   ```javascript
   if (parseFloat(ethers.formatUnits(gasBal, 18)) < 0.1) {
       console.warn(`⚠️ [LOW GAS] Keeper wallet low on gas: ${ethers.formatUnits(gasBal, 18)} ARC`);
   }
   ```

4. **History ingestion (line 783):**
   ```javascript
   amount: ethers.formatUnits(amount, 18), // Arc Native currency uses 18 decimals
   ```

5. **Active bet tracking (line 802):**
   ```javascript
   amount: ethers.formatUnits(amount, 18), // Arc Native currency uses 18 decimals
   ```

6. **Volume stats (line 814):**
   ```javascript
   const amtNum = parseFloat(ethers.formatUnits(amount, 18)); // Arc Native currency uses 18 decimals
   ```

7. **Gas logging (line 934):**
   ```javascript
   console.log(`⛽ [GAS] Req: ${ethers.formatUnits(requiredGas, 18)} | Current: ${ethers.formatUnits(bal, 18)} | Nonce: ${useNonce}`);
   ```

8. **Treasury payout estimate (line 943-947):**
   ```javascript
   const payoutEstimate = (BigInt(Math.floor(parseFloat(bet.amount) * 1000000)) * 198n * 10n**12n) / 100n; // 18 decimal payout
   if (treasuryBal < payoutEstimate) {
       console.warn(`🚨 [TREASURY_LOW] Contract has ${ethers.formatUnits(treasuryBal, 18)} ARC, but need ~${ethers.formatUnits(payoutEstimate, 18)} for payout #${bet.id}. Settle will fail!`);
   }
   ```

## 🎯 Why Stakes Were Returning

When using 6 decimals:
- User bet: 1 USDC
- Frontend sent: `1 * 10^6` wei (WRONG)
- Contract expected: `1 * 10^18` wei
- **Result:** Transaction appeared to succeed but amount was too small, or contract rejected it

When using 18 decimals (CORRECT):
- User bet: 1 USDC
- Frontend sends: `1 * 10^18` wei (CORRECT)
- Contract receives: `1 * 10^18` wei
- **Result:** Stake is held in contract, payouts work correctly

## 📝 Key Learnings

1. **Arc uses standard EVM native currency (18 decimals)** for `msg.value`
2. **USDC ERC20 token (6 decimals)** is separate from the native currency
3. The contract uses `msg.value` (native currency), not USDC tokens
4. Always verify the decimal precision of the currency being used in `msg.value` transactions

## 🚀 Status

- ✅ Frontend reverted to 18 decimals
- ✅ Backend keeper reverted to 18 decimals
- ✅ All `msg.value` operations now use correct precision
- ⏳ Keeper running with corrected code
- ⏳ Ready for testing

## 🔧 Files Modified

1. `15market-ui/src/UserApp.jsx` - 3 changes (reverted to 18 decimals)
2. `backend/arc-keeper/src/index.js` - 8 changes (reverted to 18 decimals)
3. `15market-ui/src/components/ActiveTradesSidebar.jsx` - Win/loss logic fix (strict comparison)
4. `15market-ui/src/components/LiveExecution.jsx` - Win/loss logic fix (strict comparison)

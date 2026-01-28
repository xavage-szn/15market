# Solana Treasury Investigation - Resolution Summary

## Problem Identified

The Solana Keeper was failing to settle bets due to **RPC Socket Timeouts** when using the public Solana Devnet RPC (`https://api.devnet.solana.com`). This prevented:
- Stakes from being collected into the treasury on losing bets
- Winnings from being paid out on winning bets

Additionally, the treasury account (`CSmhih8DYPf1JFxDxNpA38BPWhhw1T1t8sZVCnxeztLF`) currently has a **0 balance**, which triggers `PAYOUT_DELAYED` status in the UI when users win.

## Solution Implemented

### Load-Balanced RPC Strategy

Distributed the workload across **three available RPC endpoints** to prevent bottlenecks:

1. **UI/Admin** (`15market-ui`, `15market-admin`):
   - Uses: `https://solana-devnet.g.alchemy.com/v2/n9YGlSxGsLydkILQ9V2_B`
   - Purpose: User trade submissions and dashboard monitoring

2. **Keeper - READ Operations** (Heavy Scanning):
   - Uses: `https://solana-devnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1`
   - Purpose: `getProgramAccounts` calls for bet/profile scanning

3. **Keeper - WRITE Operations** (Broadcasting):
   - Uses: `https://api.devnet.solana.com` (Public RPC)
   - Purpose: Settlement transaction broadcasts

### Changes Made

**File: `keeper/.env`**
```diff
-READ_RPC=https://api.devnet.solana.com
+READ_RPC=https://solana-devnet.g.alchemy.com/v2/gmklUsP-qeITLeu6a8Pw1
```

## Verification Results

✅ **Keeper is now running successfully** without timeout errors
✅ **Bet scanning is operational** (Profile Scan and Bet Scan working)
✅ **No more "Socket timeout" errors** in the logs

## Next Steps Required

### 1. Fund the Treasury (Critical)

The treasury needs an initial balance to enable payouts. Send **0.5-1.0 Devnet SOL** to:

```
Treasury PDA: CSmhih8DYPf1JFxDxNpA38BPWhhw1T1t8sZVCnxeztLF
```

You can use:
- Solana CLI: `solana transfer CSmhih8DYPf1JFxDxNpA38BPWhhw1T1t8sZVCnxeztLF 1 --allow-unfunded-recipient`
- Or any Solana wallet (Phantom, Solflare, etc.)

### 2. Test the Settlement Flow

1. **Place a test bet** in the UI (minimum 0.005 SOL)
2. **Wait for expiration** (5s, 10s, or 15s depending on duration selected)
3. **Monitor Keeper logs** at `http://localhost:8080/logs` for settlement messages
4. **Verify in Admin Dashboard**:
   - If **LOSS**: Treasury balance should increase
   - If **WIN**: User wallet should receive payout (multiplier × stake)

### 3. Monitor for Issues

Watch for these log patterns:
- ✅ `[INSTANT] Settling X due bets` - Settlement is working
- ✅ `[REVENUE_COLLECT]` - Loss collected to treasury
- ✅ `[PAYOUT_INIT]` - Winning payout sent
- ❌ `PAYOUT_DELAYED` - Treasury lacks funds for payout
- ❌ `Socket timeout` - RPC issue (should be resolved now)

## Technical Details

### Treasury PDA Derivation
```javascript
PublicKey.findProgramAddressSync(
    [Buffer.from("treasury")],
    new PublicKey("7e1dPQRBJwWpxcRDkp8PUQDGrb5m4RYHCYxSPcnuVmVe")
)
// Result: CSmhih8DYPf1JFxDxNpA38BPWhhw1T1t8sZVCnxeztLF
```

### Settlement Logic Flow
1. User places bet → Stake deducted from wallet
2. Bet expires → Keeper detects via polling
3. Keeper determines outcome (WIN/LOSS) via AI Arbiter price oracle
4. **If LOSS**: `SystemProgram.transfer` from bet PDA → Treasury PDA
5. **If WIN**: `SystemProgram.transfer` from Treasury PDA → User wallet (stake × multiplier)

### Current Status
- ✅ RPC timeouts resolved
- ✅ Keeper operational
- ⏳ Treasury needs funding
- ⏳ Awaiting test bet for full verification

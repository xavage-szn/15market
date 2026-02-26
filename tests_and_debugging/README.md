# 15Market — Testing & Debugging Scripts Guide

> All testing and debugging scripts have been organized into this folder. Every script below is a standalone Node.js file you can run from the project root or from the `tests_and_debugging/` directory.

---

## 📁 Directory Structure

```
tests_and_debugging/
├── README.md                       ← You are here
├── rpc/                            ← RPC connectivity checks
│   ├── test_rpcs.js                ← Multi-RPC latency tester (ARC network)
│   ├── verify_rpcs.js              ← Basic RPC chain-ID / block-number check (JS)
│   └── verify_rpcs.py              ← Same check in Python (useful if Node is broken)
├── contract/                       ← Smart contract verification & health
│   ├── check_contract.js           ← Verify contract code + owner + balance (old addr)
│   ├── check_contract_v2.js        ← Verify contract code exists at address (new addr)
│   ├── check_final.js              ← Code + owner + user-count + balance (old addr)
│   ├── verify_contract.js          ← Full contract deployment verification (env-based)
│   ├── check_owner.js              ← Confirm keeper is contract owner (settlement auth)
│   ├── check_decimals.js           ← ARC network native token decimal investigation
│   ├── check_net.js                ← Chain ID + contract code length sanity check
│   ├── check_nonce.js              ← Contract outbound transaction count
│   └── bytecode_strings.js         ← Extract human-readable strings from deployed bytecode
├── balances/                       ← Treasury / wallet / contract balance checks
│   ├── check_balances_backend.js   ← Backend: contract + keeper balance (Thirdweb RPC)
│   ├── check_balances_arc.js       ← Arc: contract + wallet balance (DNS-patched)
│   ├── check_bals.js               ← Quick balance check across two RPCs
│   ├── check_contract_balance.js   ← Deep contract balance + recent active bets summary
│   ├── check_user_bal.js           ← Look up the sender balance of a specific TX
│   ├── raw_bal.js                  ← Raw wei + hex balance output (low-level debug)
│   ├── check_treasury.js           ← Solana treasury PDA balance (SOL side)
│   └── diagnose_balances.js        ← Multi-RPC fallback balance diagnostic
├── trades/                         ← Trade placement, bet queries, event scanning
│   ├── test_place_bet.js           ← Place a tiny test bet on-chain (keeper wallet)
│   ├── test_payout.js              ← Full E2E: place bet → wait → settle → check payout
│   ├── test_payout_v2.js           ← Same as above but with hardcoded contract address
│   ├── test_frontend_params.js     ← Place a bet using exact frontend parameter format
│   ├── test_6_decimals.js          ← Test if contract accepts 6-decimal value (USDC)
│   ├── test_arc_decimals.js        ← Investigate Arc native currency decimals
│   ├── detailed_test.js            ← Verbose test: balance → bet ID check → estimate gas → place
│   ├── check_bet_exists.js         ← Verify a specific bet ID exists on-chain
│   ├── check_bet_amount.js         ← Inspect last bet: amount, duration, potential payout
│   ├── check_bet_ids.js            ← Check for bet ID collisions (Date.now() based)
│   ├── check_recent_bets.js        ← Scan last 1000 blocks for BetPlaced events
│   └── check_ids.js                ← Check bet IDs 1–10 + recent timestamp IDs
├── transactions/                   ← TX analysis and revert debugging
│   ├── analyze_tx.js               ← Full TX analysis: status, decode args, find revert cause
│   ├── check_tx.js                 ← TX receipt: status, block, gas, logs
│   ├── check_revert.js             ← Scan last 50 blocks for failed TXs + simulate revert
│   ├── find_failed_txs.js          ← Scan last 100 blocks for all failed contract TXs
│   ├── decode_args.js              ← Decode placeBet arguments from a raw TX hash
│   ├── full_analyze.js             ← TX hash → gas, value, decoded args dump
│   ├── short_analyze.js            ← Compact TX analysis: status, gasLimit, gasUsed, value
│   ├── get_revert_reason.js        ← Replay failed TX to extract revert reason string
│   ├── simulate_call.js            ← Simulate a placeBet call without sending a TX
│   ├── call_diag.js                ← Encode + simulate placeBet, extract revert data
│   └── estimate_gas.js             ← Estimate gas for a placeBet call
├── settlement/                     ← Settlement event scanning
│   ├── scan_settlements_backend.js ← Backend: scan BetSettled events (last 500 blocks)
│   ├── scan_settlements_arc.js     ← Arc: scan BetSettled events (last 1000 blocks)
│   ├── scan_events.js              ← Scan last 5000 blocks for BetPlaced events
│   ├── manual_scan.js              ← Block-by-block scan for BetPlaced events (last 100)
│   └── check_events.js             ← Fetch recent successful BetPlaced events (last 5000 blocks)
├── sessions/                       ← Auto-signer / session wallet debugging
│   ├── check_session.js            ← Derive session wallet for a user address + check balance
│   └── check_wallet.js             ← Derive wallet address from a raw private key
├── migrations/                     ← Treasury fund migration scripts (USE WITH CAUTION)
│   ├── migrate_funds_backend.js    ← Migrate funds from old→new contract (backend)
│   ├── migrate_funds_arc.js        ← Migrate funds with DNS patch (arc_prediction)
│   ├── migrate_arc_treasury.js     ← Old→new treasury migration (direct withdraw+deposit)
│   ├── perform_migration.js        ← Full treasury migration with verification
│   ├── fund_all.js                 ← Sweep entire wallet balance into contract
│   ├── fund_arc_contract_arc.js    ← Fund arc contract with 1.0 ARC (DNS-patched)
│   └── fund_arc_contract_scripts.js← Fund contract if balance < 1 ARC (10 ARC top-up)
└── misc/                           ← Other utility scripts
    └── check_syntax.js             ← Count braces/parens in a JSX file (syntax check)
```

---

## 🚀 How To Use

### Prerequisites

1. Ensure you have a `.env` file in the `backend/` directory with:
   ```
   PRIVATE_KEY=0x...
   ARC_CONTRACT_ADDRESS=0x...
   ARC_RPC=https://...
   SESSION_MASTER_SECRET=...
   ```
2. Run `npm install` in the project root or `backend/` if you haven't already.

### Running a Script

```bash
# From the project root:
node tests_and_debugging/rpc/test_rpcs.js

# Or cd into the folder:
cd tests_and_debugging/balances
node check_balances_backend.js
```

---

## 🐛 Debugging Playbook — When To Use Each Script

### 1. "RPC is down / can't connect to Arc network"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `rpc/test_rpcs.js` | Tests all 4 RPC endpoints with latency timing |
| 2 | `rpc/verify_rpcs.js` | Quick chain ID + block number check |
| 3 | `rpc/verify_rpcs.py` | Same check via Python (if Node env is broken) |

**Root cause examples:** DNS resolution failure, RPC rate-limit, network outage.

---

### 2. "Trades are failing / TX reverts"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `transactions/check_tx.js` | Check a specific TX hash for status, gas, logs |
| 2 | `transactions/analyze_tx.js` | Full decode: was it a duplicate bet ID? |
| 3 | `transactions/get_revert_reason.js` | Replay the TX to extract the revert message |
| 4 | `transactions/find_failed_txs.js` | Scan last 100 blocks for ANY failed contract TX |
| 5 | `transactions/check_revert.js` | Scan + simulate reverted TXs from last 50 blocks |
| 6 | `transactions/decode_args.js` | Inspect the exact args that were sent on-chain |

**Root cause examples:** Bet ID collision (Date.now()), insufficient gas, nonce mismatch.

---

### 3. "Settlement is not happening / trades stuck"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `settlement/scan_settlements_backend.js` | Are BetSettled events appearing on-chain? |
| 2 | `settlement/check_events.js` | Are BetPlaced events working? |
| 3 | `contract/check_owner.js` | Is the keeper wallet still the contract owner? |
| 4 | `balances/check_contract_balance.js` | Does the contract have enough funds for payouts? |
| 5 | `balances/check_balances_backend.js` | Does the keeper have gas? |

**Root cause examples:** Keeper lost ownership, contract balance too low, RPC timeout during settlement.

---

### 4. "Payouts not arriving / wrong amount"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `trades/test_payout.js` | Full E2E: place → settle → verify payout received |
| 2 | `trades/test_payout_v2.js` | Same but with hardcoded contract address |
| 3 | `trades/check_bet_amount.js` | Check the last bet's amount + potential payout |
| 4 | `trades/test_arc_decimals.js` | Verify that msg.value decimal format is correct |

**Root cause examples:** Contract balance insufficient for payout, incorrect decimal scaling.

---

### 5. "Contract looks wrong / deployment issues"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `contract/verify_contract.js` | Full deployment check (code, balance, owner) |
| 2 | `contract/check_contract_v2.js` | Simple: does bytecode exist at this address? |
| 3 | `contract/check_owner.js` | Who owns the contract? |
| 4 | `contract/bytecode_strings.js` | Extract revert strings from deployed bytecode |

---

### 6. "Auto-signer / session wallet issues"

| Step | Script | What it does |
|------|--------|-------------|
| 1 | `sessions/check_session.js` | Derive the session wallet for a user and check balance |
| 2 | `sessions/check_wallet.js` | Verify a private key produces the expected address |

**Root cause examples:** Session master secret changed, session wallet has no gas.

---

### 7. "Need to fund / migrate treasury"

> ⚠️ **CAUTION**: Migration and funding scripts send real transactions. Use on testnet only or with extreme care.

| Script | What it does |
|--------|-------------|
| `migrations/fund_all.js` | Sweeps ALL wallet funds into the contract |
| `migrations/fund_arc_contract_scripts.js` | Tops up contract to 10 ARC if balance < 1 |
| `migrations/migrate_funds_backend.js` | Withdraw from old contract → deposit to new |
| `migrations/perform_migration.js` | Full migration with verification |

---

## 🔑 Important Notes

- **Never run migration/fund scripts on mainnet without double-checking addresses.**
- **Hardcoded addresses** in some scripts may point to OLD contracts. Always verify the `.env` values match your intended target.
- **Private keys** should NEVER be committed to git. The `.env` file is in `.gitignore`.
- **DNS patches** in some scripts work around Arc testnet DNS resolution issues. If RPCs start failing, check if the hardcoded IP `64.130.40.38` is still valid.

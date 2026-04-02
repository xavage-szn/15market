# 🛡️ 15Market Security Protocols

This repository contains the source code for the 15Market platform. All components are subject to rigorous penetration testing and security audits.

## Security Audit - April 2026

A comprehensive audit was performed on the trading backend and smart contracts.

### Recent Patches
- **Trade Settlement Security (Critical):** Resolved a major vulnerability where the backend trusted client-side price data for payouts. Settlement is now governed strictly by server-side oracles. [Read Report](./VULNERABILITY_REPORT.md).
- **Access Control Verification:** Authenticated all core contract management functions to ensure they are restricted to the `onlyOwner` role.
- **Ownership Security:** Audited and confirmed that on-chain ownership cannot be transferred or spoofed by external adversaries.

## Vulnerability Disclosure
If you discover a security vulnerability in this project, please do not open a public issue. Instead, contact the engineering team directly at `security@15market.com`.

## Repository Health
- **Contracts:** `arc_prediction/contracts/`
- **Audit Reports:** `VULNERABILITY_REPORT.md`
- **Status:** All CRITICAL findings have been remediated.

# Dokploy Configuration - 15Market Platform

## 1. Backend Service (Arc Keeper)
**Build Configuration:**
- **Build Method**: Dockerfile
- **Dockerfile Path**: `./Dockerfile.arc`
- **Context Path**: `.` (Root of monorepo)

**Network Configuration:**
- **Port**: `3010` (Exposed)

**Environment Variables:**
| Variable | Value |
|----------|-------|
| `PORT` | `3010` |
| `ARC_RPC` | `https://rpc.testnet.arc.network` |
| `ARC_CONTRACT_ADDRESS` | `0x345014899b42bF9034D9475760609e64B1433A6a` |
| `USDC_ADDRESS` | `0x3600000000000000000000000000000000000000` |
| `PRIVATE_KEY` | `0x...` (Keeper Wallet Private Key) |
| `REDIS_URL` | `redis://...` |
| `ADMIN_TOKEN` | `15MARKET_ADMIN_SECRET_KEY_2024` |
| `FRONTEND_URL` | `https://15market.online` |
| `SESSION_MASTER_SECRET` | `15market_super_secure_master_secret_key_v1` |

---

## 2. Admin Portal Service
**Build Configuration:**
- **Build Method**: Dockerfile
- **Dockerfile Path**: `./15market-admin/Dockerfile`
- **Context Path**: `./15market-admin`

**Network Configuration:**
- **Port**: `80` (Exposed)

**Build Arguments (Crucial for Vite build):**
Add these in Dokploy's "Build Arguments" section:
| Argument | Value |
|----------|-------|
| `VITE_ARC_CONTRACT_ADDRESS` | `0x4AD92eAFb8867f4d5c95dcB7eDc922E30B3bc1C8` |
| `VITE_ARC_RPC` | `https://rpc.testnet.arc.network` |
| `VITE_KEEPER_URL` | `https://api.15market.online` |
| `VITE_KEEPER_URL_ARC` | `https://api.15market.online/arc` |
| `VITE_ADMIN_TOKEN` | `15MARKET_ADMIN_SECRET_KEY_2024` |
| `VITE_REOWN_PROJECT_ID` | `c57ca95b47569778a828d19178114f4d` |

---

## 3. Frontend UI Service (15market)
**Build Configuration:**
- **Build Method**: Dockerfile
- **Dockerfile Path**: `./15market/Dockerfile`
- **Context Path**: `./15market`

**Network Configuration:**
- **Port**: `80` (Exposed)

**Build Arguments:**
- `VITE_ARC_CONTRACT_ADDRESS`: `0x345014899b42bF9034D9475760609e64B1433A6a`
- `VITE_ARC_RPC`: `https://rpc.testnet.arc.network`
- `VITE_KEEPER_URL_ARC`: `https://api.15market.online`
- `VITE_REOWN_PROJECT_ID`: `c57ca95b47569778a828d19178114f4d`

---

## Deployment Checklist
1. **Redis**: Ensure a Redis instance is reachable and the URL is provided to the Backend.
2. **Keeper Wallet**: Ensure the `PRIVATE_KEY` wallet has Arc USDC (or native coin) for gas and payouts.
3. **Build Contexts**: Since this is a monorepo, always ensure Dokploy is building with the correct context directory relative to the root.

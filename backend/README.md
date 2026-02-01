# 15Market Backend Keepers

This directory contains the fully isolated backends for Solana and Arc networks.

## Structure

- **solana-keeper/**: Handles Solana bets, user profiles (OAuth tokens), and core market data updates. Runs on Port 3005.
- **arc-keeper/**: Handles Arc bets and settlement. Runs on Port 3010.
- **shared/**: Shared logic for pricing (consensus) and logging.

## Installation

Run `npm install` in all directories:

```bash
cd shared && npm install
cd ../solana-keeper && npm install
cd ../arc-keeper && npm install
```

## Running Locally

You can run them separately:

**Solana Keeper:**
```bash
cd solana-keeper
npm run dev
```

**Arc Keeper:**
```bash
cd arc-keeper
npm run dev
```

## Production Deployment (VPS)

### 1. Using PM2 (Recommended)

In the `backend` directory:
```bash
npm install -g pm2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 2. Reverse Proxy Configuration (Nginx / Dockploy)

Since the keepers fetch data relative to their root (e.g. `/history`), but you want to route `/solana` and `/arc` from a public domain, you should use rewrite rules.

**Nginx Example:**

```nginx
server {
    listen 80;
    server_name api.15market.online;

    # Solana Keeper
    location /solana/ {
        proxy_pass http://localhost:3005/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Rewrite to strip /solana prefix if the app expects root paths
        rewrite ^/solana/(.*) /$1 break;
    }

    # Arc Keeper
    location /arc/ {
        proxy_pass http://localhost:3010/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        # Rewrite to strip /arc prefix
        rewrite ^/arc/(.*) /$1 break;
    }
}
```

**Important**: 
- Ensure your Frontend uses the correct URLs (e.g., `https://api.15market.online/solana/history` for Solana history).
- If you use OAuth, update the Twitter Developer Portal callback URL if needed, though proper proxying should handle it. Currently callback routes to `/auth/twitter/callback`. With the proxy above, it would be `https://api.15market.online/solana/auth/twitter/callback`.

## Environment Variables

Check `.env` files in `solana-keeper/` and `arc-keeper/` and ensure all keys (RPCs, Private Keys, Program IDs) are correct.

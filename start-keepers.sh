#!/bin/sh
set -e

echo "🚀 Starting 15market Solana Keeper (Isolated)..."

# Navigate to the correct directory so Node can find express and other modules
cd backend/solana-keeper

# Start the keeper
node src/index.js

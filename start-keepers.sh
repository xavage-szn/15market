#!/bin/sh
set -e

echo "🚀 Starting Isolated 15market Keepers..."

# Note: In production (Dokploy), it is recommended to run these as separate services.
# If running in a single container for now:

echo "✅ Starting Solana Keeper..."
node backend/solana-keeper/src/index.js &
SOL_PID=$!

echo "✅ Starting Arc Keeper..."
node backend/arc-keeper/src/index.js &
ARC_PID=$!

wait $SOL_PID $ARC_PID

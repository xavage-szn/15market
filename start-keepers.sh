#!/bin/sh
set -e

echo "🚀 Starting 15market Standalone Keepers..."

# 1. Start Solana Keeper (Port 3005)
echo "--- Launching Solana Keeper ---"
cd /app/backend/solana-keeper
node src/index.js &
SOL_PID=$!

# 2. Start Arc Keeper (Port 3010)
echo "--- Launching Arc Keeper ---"
cd /app/backend/arc-keeper
node src/index.js &
ARC_PID=$!

echo "✅ Both keepers are initializing. Monitoring PIDs: $SOL_PID, $ARC_PID"

# Keep the container alive and monitor processes
wait $SOL_PID $ARC_PID

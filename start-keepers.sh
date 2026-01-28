#!/bin/sh
set -e

echo "🚀 Starting 15market Keeper Services..."

# Start Arc Keeper in background
cd /app/arc_keeper
node index.js > logs/arc_keeper.log 2>&1 &
ARC_PID=$!
echo "✅ Arc Keeper started (PID: $ARC_PID)"

# Start Solana Keeper in foreground
cd /app
echo "✅ Starting Solana Keeper..."
node keeper/src/index.js

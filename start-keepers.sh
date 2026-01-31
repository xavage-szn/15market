#!/bin/sh
set -e

echo "🚀 Starting 15market Keeper Monolith..."

# Start Arc Keeper in background (printing to stdout for Dokploy)
cd /app/arc_keeper
node index.js &
ARC_PID=$!
echo "✅ Arc Keeper backgrounded (PID: $ARC_PID)"

# Start Solana Keeper in foreground
cd /app
echo "✅ Starting Solana Keeper..."
node keeper/src/index.js

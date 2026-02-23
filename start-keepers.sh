#!/bin/sh
set -e

echo "🚀 Starting 15market Standalone Keeper (ARC)..."

# 1. Start Arc Keeper (Port 3010)
echo "--- Launching Arc Keeper ---"
cd /app/backend
npm start

FROM node:20-alpine
WORKDIR /app

# Install Solana Keeper dependencies
COPY backend/solana-keeper/package*.json ./
RUN npm install

# Copy all code
COPY . .

# Install Arc Keeper dependencies
WORKDIR /app/backend/arc-keeper
RUN npm install

# Return to root for startup
WORKDIR /app

# Ensure start script is executable
RUN chmod +x ./start-keepers.sh

# Expose ports for both keepers
EXPOSE 3005 3010

# Note: Healthcheck updated to Solana port
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3005/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["./start-keepers.sh"]

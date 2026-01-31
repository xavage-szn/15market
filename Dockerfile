FROM node:20-alpine
WORKDIR /app

# Install Solana Keeper dependencies
COPY keeper/package*.json ./
RUN npm ci --only=production

# Copy all code (context should be the project root)
COPY . .

# Install Arc Keeper dependencies
WORKDIR /app/arc_keeper
RUN npm ci --only=production

# Return to main app dir
WORKDIR /app

# Create logs directories
RUN mkdir -p logs arc_keeper/logs

# Health check (Solana keeper runs on 8080)
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

# Expose port
EXPOSE 8080

# Start script to run both
RUN chmod +x ./start-keepers.sh
CMD ["./start-keepers.sh"]

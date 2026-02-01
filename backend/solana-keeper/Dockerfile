FROM node:20-slim

WORKDIR /app

# Copy shared utilities first
COPY backend/shared ./backend/shared

# Copy solana-keeper
COPY backend/solana-keeper ./backend/solana-keeper

# Set working directory to the keeper
WORKDIR /app/backend/solana-keeper

# Install dependencies
RUN npm install

# Expose port
EXPOSE 3005

# Start
CMD ["npm", "start"]

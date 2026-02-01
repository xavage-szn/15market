# Build from the /backend directory
FROM node:20-slim

WORKDIR /app

# Copy shared utils (relative to backend/)
COPY backend/shared ./shared

# Copy keeper code (relative to backend/)
COPY backend/solana-keeper ./solana-keeper

# Install shared dependencies
WORKDIR /app/shared
RUN npm install

# Install keeper dependencies
WORKDIR /app/solana-keeper
RUN npm install

# Expose port
EXPOSE 3005

# Start
CMD ["npm", "start"]

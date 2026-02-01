# Build from the REPO ROOT (not backend/)
# This makes path configuration much easier in Dokploy
FROM node:20-slim

WORKDIR /app

# Copy the entire backend directory structure
COPY backend/shared ./shared
COPY backend/solana-keeper ./solana-keeper

# Install shared dependencies
WORKDIR /app/shared
RUN npm install

# Install keeper dependencies
WORKDIR /app/solana-keeper
RUN npm install

# Expose port
EXPOSE 3005

# Start the keeper
CMD ["npm", "start"]

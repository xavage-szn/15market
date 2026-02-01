# Build from the /backend directory to include the shared-utils
FROM node:20-slim

WORKDIR /app

# Copy shared utils first
COPY shared ./shared

# Copy the keeper code
COPY solana-keeper ./solana-keeper

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

# Build from the /backend directory
FROM node:20-slim

WORKDIR /app

# Copy shared utils (relative to backend/)
COPY shared ./shared

# Copy keeper code (relative to backend/)
COPY arc-keeper ./arc-keeper

# Install shared dependencies
WORKDIR /app/shared
RUN npm install

# Install keeper dependencies
WORKDIR /app/arc-keeper
RUN npm install

# Expose port
EXPOSE 3010

# Start
CMD ["npm", "start"]

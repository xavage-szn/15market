# Build from the /backend directory context
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY backend/src ./src

# Copy environment file (though usually injected at runtime, useful for default builds)
COPY backend/.env ./

# Expose port (Backend defaults to 3012, but previous Dockerfile used 3010)
ENV PORT=3010
EXPOSE 3010

# Start
CMD ["npm", "start"]

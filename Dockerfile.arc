# Build from the /backend directory context
FROM node:20-slim

WORKDIR /app

# Copy package files
COPY backend/package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY backend/src ./src

# Expose port (Backend defaults to 3012, but previous Dockerfile used 3010)
ENV PORT=3010
EXPOSE 3010

# Start
CMD ["npm", "start"]

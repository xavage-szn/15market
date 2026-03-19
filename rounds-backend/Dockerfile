# Multi-stage build for rounds-backend microservice
FROM node:20-slim AS builder

WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install --production

# Stage 2: Final image
FROM node:20-slim

WORKDIR /app

# Copy from builder
COPY --from=builder /app/node_modules ./node_modules
COPY . .

# Environment Defaults
ENV PORT=3011
ENV NODE_ENV=production

EXPOSE 3011

CMD ["node", "index.js"]

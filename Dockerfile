# Multi-service Dockerfile for 15market Monorepo
FROM node:20-slim

WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./

# Copy backend
COPY backend ./backend
RUN cd backend && npm install

# Copy frontend
COPY 15market ./15market

# We only build the backend part here since Render Frontend usually uses Static Site or its own build
# If using this for backend deployment:
EXPOSE 3010

# Default to starting the backend
CMD ["npm", "run", "render:start:backend"]

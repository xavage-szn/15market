FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy source code
COPY src ./src

# Expose port
ENV PORT=3010
EXPOSE 3010

# Start the application
CMD ["node", "src/index.js"]

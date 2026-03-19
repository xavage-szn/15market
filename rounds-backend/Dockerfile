FROM node:20-slim

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY index.js ./
COPY src ./src

# Expose port (Rounds Backend defaults to 3011)
ENV PORT=3011
EXPOSE 3011

# Start the application
CMD ["node", "index.js"]

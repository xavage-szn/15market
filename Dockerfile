FROM node:20-alpine
WORKDIR /app

# Install Arc Keeper dependencies
COPY backend/arc-keeper/package*.json ./backend/arc-keeper/
COPY backend/shared/package*.json ./backend/shared/
RUN cd backend/arc-keeper && npm install

# Copy all code
COPY . .

# Ensure start script is executable
RUN chmod +x ./start-keepers.sh

# Expose port for Arc keeper
EXPOSE 3010

# Healthcheck updated to Arc port
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3010/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["./start-keepers.sh"]

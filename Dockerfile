# Build from the root for monorepo context
FROM node:20-slim
WORKDIR /app

# Copy shared utils first
COPY backend/shared ./backend/shared
RUN cd backend/shared && npm install

# Copy keeper code
COPY backend/arc-keeper ./backend/arc-keeper
RUN cd backend/arc-keeper && npm install

# Copy all code for path resolution
COPY . .

# Ensure start script is executable
RUN chmod +x ./start-keepers.sh

# Expose port for Arc keeper
EXPOSE 3010

# Healthcheck
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
    CMD node -e "require('http').get('http://localhost:3010/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"

CMD ["./start-keepers.sh"]

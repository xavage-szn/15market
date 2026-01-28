# Build stage
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

# Build-time environment variables
ARG VITE_SOLANA_RPC
ARG VITE_ARC_RPC
ARG VITE_ARC_CONTRACT_ADDRESS
ARG VITE_ADMIN_TOKEN
ARG VITE_KEEPER_URL
ARG VITE_REOWN_PROJECT_ID

ENV VITE_SOLANA_RPC=$VITE_SOLANA_RPC
ENV VITE_ARC_RPC=$VITE_ARC_RPC
ENV VITE_ARC_CONTRACT_ADDRESS=$VITE_ARC_CONTRACT_ADDRESS
ENV VITE_ADMIN_TOKEN=$VITE_ADMIN_TOKEN
ENV VITE_KEEPER_URL=$VITE_KEEPER_URL
ENV VITE_REOWN_PROJECT_ID=$VITE_REOWN_PROJECT_ID

RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

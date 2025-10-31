# syntax=docker/dockerfile:1.4
# Dockerfile for NestJS Backend API
# Build context: apps/server-nest directory
# 
# BuildKit optimizations:
# - Cache mounts for npm (50-80% faster dependency installs)
# - Optimized layer ordering for better caching
# - Parallel builds with BuildKit
#
# NODE_ENV handling:
# - Build stage: NODE_ENV=development (installs devDependencies needed for build)
# - Runtime stage: NODE_ENV=production (optimized runtime, no dev tools)

FROM node:20-alpine AS builder

# Set NODE_ENV to development for build stage
ENV NODE_ENV=development

WORKDIR /build

# Copy package files
COPY package*.json ./

# Install dependencies with npm cache mount
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

# Set NODE_ENV to production for runtime
ENV NODE_ENV=production

WORKDIR /app

# Install tini for proper signal handling
RUN apk add --no-cache tini curl

# Copy built application and dependencies from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/dist ./dist
COPY --from=builder /build/src/common/database/migrations ./src/common/database/migrations
COPY --from=builder /build/package*.json ./

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://localhost:3002/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/sbin/tini", "--"]

# Start application
CMD ["node", "dist/main.js"]

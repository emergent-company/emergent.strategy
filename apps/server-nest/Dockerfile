# syntax=docker/dockerfile:1.4
# Dockerfile for NestJS Backend API
# Build context: REPOSITORY ROOT (.) - workspace-aware build
# Usage: docker build -f apps/server-nest/Dockerfile .
# 
# BuildKit optimizations:
# - Cache mounts for npm (50-80% faster dependency installs)
# - Optimized layer ordering for better caching
# - Parallel builds with BuildKit
#
# NODE_ENV handling:
# - Build stage: NODE_ENV=development (installs devDependencies needed for build)
# - Runtime stage: NODE_ENV=production (optimized runtime, no dev tools)

FROM node:20-slim AS builder

# Set NODE_ENV to development for build stage
ENV NODE_ENV=development

WORKDIR /build

# Copy root workspace package files first
COPY package*.json ./
# Copy server-nest package files
COPY apps/server-nest/package*.json ./apps/server-nest/

# Install dependencies with npm cache mount (workspace-aware)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/server-nest

# Copy server-nest source code
COPY apps/server-nest ./apps/server-nest

# Build the application
RUN cd apps/server-nest && npm run build

# Production stage
FROM node:20-slim

# Set NODE_ENV to production for runtime
ENV NODE_ENV=production

WORKDIR /app

# Install tini and curl for proper signal handling and health checks
RUN apt-get update && apt-get install -y --no-install-recommends tini curl && \
    rm -rf /var/lib/apt/lists/*

# Copy built application and dependencies from builder
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/server-nest/dist ./dist
COPY --from=builder /build/apps/server-nest/src/common/database/migrations ./src/common/database/migrations
COPY --from=builder /build/apps/server-nest/package*.json ./

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://localhost:3002/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start application
CMD ["node", "dist/main.js"]

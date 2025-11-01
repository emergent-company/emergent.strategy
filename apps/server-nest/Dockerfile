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

# DEBUG: List what's in the build context root
RUN echo "=== DEBUG: Listing root directory ===" && \
    ls -la / && \
    echo "=== DEBUG: Listing current directory ===" && \
    pwd && ls -la

# Copy root workspace package files first
COPY package.json package-lock.json ./
RUN echo "=== DEBUG: After copying root package files ===" && ls -la

# DEBUG: Check if apps directory exists in build context
RUN echo "=== DEBUG: Checking for apps directory ===" && \
    if [ -d "apps" ]; then \
        echo "apps directory EXISTS" && ls -la apps/; \
    else \
        echo "apps directory DOES NOT EXIST"; \
    fi

# Copy server-nest package files
COPY apps/server-nest/package.json apps/server-nest/package-lock.json ./apps/server-nest/
RUN echo "=== DEBUG: After copying server-nest package files ===" && \
    ls -la apps/server-nest/

# Copy root tsconfig.json (extended by server-nest tsconfig)
COPY tsconfig.json ./

# Install dependencies with npm cache mount (workspace-aware)
RUN --mount=type=cache,target=/root/.npm \
    npm ci --workspace=apps/server-nest

RUN echo "=== DEBUG: After npm ci ===" && \
    ls -la && \
    echo "=== DEBUG: node_modules ===" && \
    ls -la node_modules/ | head -20 && \
    echo "=== DEBUG: apps/server-nest/node_modules ===" && \
    ls -la apps/server-nest/node_modules/ | head -20

# Copy server-nest source code (includes .api directory)
COPY apps/server-nest ./apps/server-nest

RUN echo "=== DEBUG: After copying server-nest source ===" && \
    ls -la apps/server-nest/ && \
    echo "=== DEBUG: Checking for .api directory ===" && \
    if [ -d "apps/server-nest/.api" ]; then \
        echo ".api directory EXISTS" && ls -la apps/server-nest/.api/; \
    else \
        echo ".api directory DOES NOT EXIST"; \
    fi

# Manually create symlink for @api/clickup (npm ci doesn't handle file: deps in Docker)
# Use absolute path for the symlink target
RUN mkdir -p apps/server-nest/node_modules/@api && \
    ln -sf /build/apps/server-nest/.api/apis/clickup apps/server-nest/node_modules/@api/clickup

# Build the application
RUN cd apps/server-nest && npm run build

# Production stage
FROM node:20-slim

# Set NODE_ENV to production for runtime
ENV NODE_ENV=production

WORKDIR /app

# Install tini and curl for proper signal handling and health checks
# Also install postgresql-client for database migrations
RUN apt-get update && apt-get install -y --no-install-recommends tini curl postgresql-client && \
    rm -rf /var/lib/apt/lists/*

# Create a minimal package.json for production (without "type": "module")
RUN echo '{\n\
  "name": "server-nest",\n\
  "version": "0.1.0",\n\
  "private": true,\n\
  "main": "dist/main.js",\n\
  "scripts": {\n\
    "start": "node dist/main.js"\n\
  },\n\
  "engines": {\n\
    "node": ">=20.0.0"\n\
  }\n\
}' > /app/package.json

# Copy node_modules from both root and workspace
COPY --from=builder /build/node_modules ./node_modules
COPY --from=builder /build/apps/server-nest/node_modules ./node_modules

# Copy the @api/clickup module (which is a local file dependency)
COPY --from=builder /build/apps/server-nest/.api ./.api

# Recreate the symlink for @api/clickup in production
RUN mkdir -p node_modules/@api && \
    ln -sf /app/.api/apis/clickup node_modules/@api/clickup

# Copy built application
COPY --from=builder /build/apps/server-nest/dist ./dist
COPY --from=builder /build/apps/server-nest/src/common/database/migrations ./src/common/database/migrations

# Copy migration script
COPY --from=builder /build/apps/server-nest/scripts/migrate.mjs ./scripts/migrate.mjs

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://localhost:3002/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start application
CMD ["node", "dist/main.js"]

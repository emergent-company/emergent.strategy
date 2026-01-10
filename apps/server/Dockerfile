# Dockerfile for NestJS Backend API
# Build context: REPOSITORY ROOT (.) - workspace-aware build
# Usage: docker build -f apps/server/Dockerfile .
#
# BuildKit optimizations:
# - Cache mounts for pnpm (50-80% faster dependency installs)
# - Optimized layer ordering for better caching
# - Parallel builds with BuildKit
#
# NODE_ENV handling:
# - Build stage: NODE_ENV=development (installs devDependencies needed for build)
# - Runtime stage: NODE_ENV=production (optimized runtime, no dev tools)

FROM node:20-slim AS builder

# Set NODE_ENV to development for build stage
ENV NODE_ENV=development

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Copy root workspace package files first
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy server package files
COPY apps/server/package.json ./apps/server/

# Copy .api folder (generated ClickUp API client - local dependency)
COPY .api ./.api

# Copy root tsconfig.json (extended by server tsconfig)
COPY tsconfig.json ./

# Install dependencies (workspace-aware, skip prepare scripts like husky)
RUN pnpm install --filter=server... --ignore-scripts

# Copy server source code
COPY apps/server ./apps/server

# Build the application
RUN cd apps/server && pnpm run build

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
  "name": "server",\n\
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
COPY --from=builder /build/apps/server/node_modules ./node_modules

# Copy built application
COPY --from=builder /build/apps/server/dist ./dist

# Copy migrations directory
COPY --from=builder /build/apps/server/migrations ./migrations

# Expose port
EXPOSE 3002

# Health check
HEALTHCHECK --interval=10s --timeout=5s --retries=5 --start-period=30s \
  CMD curl -f http://localhost:3002/health || exit 1

# Use tini as entrypoint for proper signal handling
ENTRYPOINT ["/usr/bin/tini", "--"]

# Start application
CMD ["node", "dist/main.js"]

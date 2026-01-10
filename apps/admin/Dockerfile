# Dockerfile for Frontend Admin App
# Build context: REPOSITORY ROOT (.) - workspace-aware build
# 
# Build arguments:
#   - VITE_API_URL: API endpoint URL (baked into build)
#   - VITE_ZITADEL_ISSUER: Auth issuer URL (baked into build)
#   - VITE_ZITADEL_CLIENT_ID: OAuth client ID (baked into build)
#   - VITE_APP_ENV: Environment (production/staging)
#
# BuildKit optimizations:
# - Cache mounts for pnpm (50-80% faster dependency installs)
# - Optimized layer ordering for better caching
# - Parallel builds with BuildKit

FROM node:20-alpine AS builder

# Set NODE_ENV to development for build stage
ENV NODE_ENV=development

# Build arguments
ARG VITE_API_URL
ARG VITE_API_BASE
ARG VITE_ZITADEL_ISSUER
ARG VITE_ZITADEL_CLIENT_ID
ARG VITE_APP_ENV=production

# Set as environment variables so Vite can access them during build
ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_API_BASE=${VITE_API_BASE}
ENV VITE_ZITADEL_ISSUER=${VITE_ZITADEL_ISSUER}
ENV VITE_ZITADEL_CLIENT_ID=${VITE_ZITADEL_CLIENT_ID}
ENV VITE_APP_ENV=${VITE_APP_ENV}

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /build

# Copy root package files for workspace
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Copy admin app package files
COPY apps/admin/package.json ./apps/admin/

# Copy .api folder (generated ClickUp API client - local dependency)
COPY .api ./.api

# Install dependencies (skip prepare scripts like husky in Docker)
RUN pnpm install --filter=admin... --ignore-scripts && \
    echo "Dependencies installed successfully"

# Copy application source
COPY apps/admin ./apps/admin

# Build the application
RUN cd apps/admin && pnpm run build

# Production stage - serve with nginx
FROM nginx:alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Copy built application
COPY --from=builder /build/apps/admin/dist /usr/share/nginx/html

# Create nginx configuration for SPA routing
RUN cat > /etc/nginx/conf.d/default.conf <<'EOF'
server {
    listen 3000;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;

    # Enable gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json application/xml+rss;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # SPA routing - try files first, fallback to index.html
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
}
EOF

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=10s --timeout=3s --retries=3 --start-period=10s \
  CMD curl -f http://localhost:3000/health || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]

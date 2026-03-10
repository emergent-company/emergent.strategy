# Multi-stage Dockerfile for EPF Cloud Server
# Builds the epf-cli binary with embedded canonical artifacts and runs it as
# an MCP server over HTTP (Streamable HTTP + SSE).
#
# Build:
#   docker build --secret id=gh_token,env=GITHUB_TOKEN \
#     --build-arg VERSION=$(cat VERSION) \
#     --build-arg GIT_COMMIT=$(git rev-parse --short HEAD) \
#     -t epf-server .
#
# Run (single-tenant — one repo, no user auth):
#   docker run -p 8080:8080 \
#     -e EPF_GITHUB_APP_ID=... \
#     -e EPF_GITHUB_APP_INSTALLATION_ID=... \
#     -e EPF_GITHUB_APP_PRIVATE_KEY="$(cat key.pem)" \
#     -e EPF_GITHUB_OWNER=... \
#     -e EPF_GITHUB_REPO=... \
#     epf-server
#
# Run (multi-tenant — GitHub OAuth, workspace discovery, multi-repo):
#   docker run -p 8080:8080 \
#     -e EPF_OAUTH_CLIENT_ID=... \
#     -e EPF_OAUTH_CLIENT_SECRET=... \
#     -e EPF_SESSION_SECRET=$(openssl rand -hex 32) \
#     epf-server
#
# Run (strategy-only — 16 read-only tools, no auth):
#   docker run -p 8080:8080 \
#     -e EPF_SERVER_MODE=strategy \
#     -e EPF_STRATEGY_INSTANCE=/path/to/instance \
#     epf-server

# ---------------------------------------------------------------------------
# Stage 1: Build
# ---------------------------------------------------------------------------
FROM golang:1.25-bookworm AS builder

ARG VERSION=dev
ARG GIT_COMMIT=dev
ARG BUILD_DATE=""

WORKDIR /build

# Install git (needed to clone canonical-epf for embedded artifacts)
RUN apt-get update && apt-get install -y --no-install-recommends git ca-certificates && rm -rf /var/lib/apt/lists/*

# Cache Go module downloads
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY . .

# Clone canonical-epf and sync embedded artifacts.
# The GitHub token is passed as a build secret to avoid leaking it into layers.
RUN --mount=type=secret,id=gh_token \
    GITHUB_TOKEN="$(cat /run/secrets/gh_token 2>/dev/null || echo '')" && \
    if [ -n "$GITHUB_TOKEN" ]; then \
        git clone --depth 1 \
            "https://x-access-token:${GITHUB_TOKEN}@github.com/emergent-company/epf-canonical.git" \
            /tmp/canonical-epf && \
        ./scripts/sync-embedded.sh /tmp/canonical-epf && \
        rm -rf /tmp/canonical-epf; \
    else \
        echo "WARNING: No gh_token secret provided — building without embedded artifacts"; \
    fi

# Compute build date if not provided
RUN if [ -z "$BUILD_DATE" ]; then BUILD_DATE="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; fi && \
    echo "$BUILD_DATE" > /tmp/build_date

# Build static binary
RUN CGO_ENABLED=0 GOOS=linux go build \
    -ldflags="-s -w \
      -X github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version.Version=${VERSION} \
      -X github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version.GitCommit=${GIT_COMMIT} \
      -X github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/version.BuildDate=$(cat /tmp/build_date)" \
    -o /build/epf-server .

# ---------------------------------------------------------------------------
# Stage 2: Runtime
# ---------------------------------------------------------------------------
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=builder /build/epf-server /epf-server

# Cloud Run uses PORT env var (default 8080)
ENV PORT=8080

# Expose the default port
EXPOSE 8080

# Run as non-root user (distroless/nonroot provides uid 65532)
USER nonroot:nonroot

# Start the MCP server in HTTP mode.
# Cloud Run sets PORT; the entrypoint reads it via --port flag.
# SSE is enabled by default for maximum client compatibility.
ENTRYPOINT ["/epf-server", "serve", "--http", "--sse"]
CMD ["--port", "8080"]

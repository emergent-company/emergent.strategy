#!/usr/bin/env bash
# dev-setup.sh — One-command local development environment for strategy-server.
#
# What it does:
#   1. Starts Postgres (+ Memory if --with-memory)
#   2. Waits for services to be healthy
#   3. Sets up Memory project and token (if Memory is running)
#   4. Writes .env.local with all connection details
#   5. Runs database migrations
#   6. Starts the server
#
# Usage:
#   ./scripts/dev-setup.sh              # Postgres only (semantic features disabled)
#   ./scripts/dev-setup.sh --with-memory  # Postgres + Memory (full features)
#   ./scripts/dev-setup.sh --deps-only   # Just start containers, don't run server
#
# The server listens on PORT (default 8090). Override with PORT=XXXX.

set -euo pipefail

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
ENV_FILE="${PROJECT_DIR}/.env.local"

PORT="${PORT:-8090}"
WITH_MEMORY=false
DEPS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --with-memory) WITH_MEMORY=true ;;
        --deps-only)   DEPS_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--with-memory] [--deps-only]"
            echo ""
            echo "  --with-memory   Start Memory server for semantic features"
            echo "  --deps-only     Start containers only, don't run the server"
            echo ""
            echo "Environment:"
            echo "  PORT            Server listen port (default: 8090)"
            exit 0
            ;;
        *) echo "Unknown argument: $arg"; exit 1 ;;
    esac
done

# ---------------------------------------------------------------------------
# Colours (if terminal supports them)
# ---------------------------------------------------------------------------

if [ -t 1 ]; then
    GREEN='\033[0;32m'
    YELLOW='\033[0;33m'
    CYAN='\033[0;36m'
    RED='\033[0;31m'
    NC='\033[0m'
else
    GREEN='' YELLOW='' CYAN='' RED='' NC=''
fi

info()  { echo -e "${CYAN}==> ${NC}$1"; }
ok()    { echo -e "${GREEN} ok ${NC}$1"; }
warn()  { echo -e "${YELLOW}warn${NC} $1"; }
fail()  { echo -e "${RED}FAIL${NC} $1"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Start containers
# ---------------------------------------------------------------------------

cd "$PROJECT_DIR"

if $WITH_MEMORY; then
    info "Starting Postgres + Memory containers..."
    docker compose up -d postgres memory 2>&1 | tail -5
else
    info "Starting Postgres container..."
    docker compose up -d postgres 2>&1 | tail -5
fi

# ---------------------------------------------------------------------------
# 2. Wait for Postgres
# ---------------------------------------------------------------------------

info "Waiting for Postgres..."
for i in $(seq 1 30); do
    if docker compose exec -T postgres pg_isready -U strategy -q 2>/dev/null; then
        ok "Postgres is ready (port 5433)"
        break
    fi
    if [ "$i" -eq 30 ]; then
        fail "Postgres not ready after 30s"
    fi
    sleep 1
done

# ---------------------------------------------------------------------------
# 3. Wait for Memory (if requested)
# ---------------------------------------------------------------------------

MEMORY_TOKEN=""
if $WITH_MEMORY; then
    info "Waiting for Memory server..."
    for i in $(seq 1 60); do
        if curl -sf http://localhost:8787/health >/dev/null 2>&1; then
            ok "Memory server is ready (port 8787)"
            break
        fi
        if [ "$i" -eq 60 ]; then
            warn "Memory server not ready after 60s — continuing without it"
            WITH_MEMORY=false
            break
        fi
        sleep 1
    done
fi

if $WITH_MEMORY; then
    info "Setting up Memory project..."

    # Check memory CLI is installed.
    if ! command -v memory &>/dev/null; then
        warn "'memory' CLI not found — skipping Memory project setup"
        warn "Install: go install github.com/emergent-company/memory/cmd/memory@latest"
        WITH_MEMORY=false
    fi
fi

if $WITH_MEMORY; then
    MEMORY_URL="http://localhost:8787"
    MEMORY_ORG="strategy-dev"
    MEMORY_PROJECT="strategy"

    # Create org (ignore error if already exists).
    memory orgs create --name "${MEMORY_ORG}" --server "${MEMORY_URL}" 2>/dev/null || true

    # Get org ID.
    ORG_ID=$(memory orgs list --server "${MEMORY_URL}" --json 2>/dev/null | \
        python3 -c "
import sys, json
orgs = json.load(sys.stdin)
for o in orgs:
    if o.get('name') == '${MEMORY_ORG}':
        print(o['id'])
        break
" 2>/dev/null || echo "")

    # Create project (ignore error if already exists).
    if [ -n "${ORG_ID}" ]; then
        memory projects create --name "${MEMORY_PROJECT}" --org-id "${ORG_ID}" --server "${MEMORY_URL}" 2>/dev/null || true
    else
        memory projects create --name "${MEMORY_PROJECT}" --server "${MEMORY_URL}" 2>/dev/null || true
    fi

    # Create or retrieve a project token.
    TOKEN_JSON=$(memory projects create-token --server "${MEMORY_URL}" --project "${MEMORY_PROJECT}" --json 2>/dev/null || echo "")
    if [ -n "${TOKEN_JSON}" ]; then
        MEMORY_TOKEN=$(echo "${TOKEN_JSON}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
    fi

    if [ -n "${MEMORY_TOKEN}" ]; then
        ok "Memory project '${MEMORY_PROJECT}' ready (token obtained)"
    else
        warn "Could not obtain Memory token — semantic features may not work"
    fi
fi

# ---------------------------------------------------------------------------
# 4. Write .env.local
# ---------------------------------------------------------------------------

info "Writing ${ENV_FILE}..."

cat > "${ENV_FILE}" << EOF
# Auto-generated by scripts/dev-setup.sh — $(date -Iseconds)
# Do not commit this file.

# Server
PORT=${PORT}
ENV=development
LOG_LEVEL=INFO

# Database (matches docker-compose.yml)
PGHOST=localhost
PGPORT=5433
PGUSER=strategy
PGPASSWORD=strategy
PGDATABASE=strategy
PGSSLMODE=disable

# Database mode
STRATEGY_DB_MODE=dev

# Auth (disabled in dev)
AUTH_ENABLED=false
EOF

if $WITH_MEMORY && [ -n "${MEMORY_TOKEN}" ]; then
    cat >> "${ENV_FILE}" << EOF

# Memory (semantic graph)
EPF_MEMORY_URL=http://localhost:8787
EPF_MEMORY_PROJECT=strategy
EPF_MEMORY_TOKEN=${MEMORY_TOKEN}
EOF
    ok ".env.local written (with Memory)"
else
    cat >> "${ENV_FILE}" << EOF

# Memory (not configured — semantic features disabled)
# EPF_MEMORY_URL=http://localhost:8787
# EPF_MEMORY_PROJECT=strategy
# EPF_MEMORY_TOKEN=
EOF
    ok ".env.local written (without Memory)"
fi

# Ensure .env.local is gitignored.
if ! grep -q '.env.local' "${PROJECT_DIR}/.gitignore" 2>/dev/null; then
    echo '.env.local' >> "${PROJECT_DIR}/.gitignore"
fi

# ---------------------------------------------------------------------------
# 5. Run migrations
# ---------------------------------------------------------------------------

info "Running database migrations..."
set -a; source "${ENV_FILE}"; set +a
go run -tags notui . db --migrate 2>&1
ok "Migrations complete"

# ---------------------------------------------------------------------------
# 6. Start server (unless --deps-only)
# ---------------------------------------------------------------------------

if $DEPS_ONLY; then
    echo ""
    info "Dependencies are ready. To start the server:"
    echo ""
    echo "  cd $(basename "$PROJECT_DIR")"
    echo "  set -a; source .env.local; set +a"
    echo "  task run"
    echo ""
    echo "  MCP endpoint: http://localhost:${PORT}/mcp"
    echo ""
    exit 0
fi

echo ""
info "Starting strategy-server on port ${PORT}..."
echo ""
echo "  Health:  http://localhost:${PORT}/health"
echo "  MCP:     http://localhost:${PORT}/mcp"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

exec go run -tags notui . server

#!/usr/bin/env bash
# dev-setup.sh — One-command local development environment for strategy-server.
#
# What it does:
#   1. Starts Postgres
#   2. Waits for services to be healthy
#   3. Auto-detects the standalone Memory server (reads ~/.memory/config/.env.local)
#      No flag required — Memory is wired automatically if it is already running.
#      Pass --start-memory to also start the Memory server if it is not running.
#   4. Writes .env.local with all connection details
#   5. Runs database migrations
#   6. Starts the server
#
# Usage:
#   ./scripts/dev-setup.sh              # Postgres + auto-detect Memory
#   ./scripts/dev-setup.sh --start-memory  # Start Memory server if not running
#   ./scripts/dev-setup.sh --deps-only  # Just start containers, don't run server
#   ./scripts/dev-setup.sh --no-memory  # Skip Memory even if running
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
START_MEMORY=false
NO_MEMORY=false
DEPS_ONLY=false

for arg in "$@"; do
    case "$arg" in
        --start-memory) START_MEMORY=true ;;
        --with-memory)  START_MEMORY=true ;;  # backwards compat
        --no-memory)    NO_MEMORY=true ;;
        --deps-only)    DEPS_ONLY=true ;;
        --help|-h)
            echo "Usage: $0 [--start-memory] [--no-memory] [--deps-only]"
            echo ""
            echo "  --start-memory  Start the standalone Memory server if not running"
            echo "  --no-memory     Skip Memory even if it is already running"
            echo "  --deps-only     Start containers only, don't run the server"
            echo ""
            echo "Memory is auto-detected: if ~/.memory/config/.env.local exists and the"
            echo "server is healthy on port 3002, it will be wired automatically."
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
    RED='\033[0;31d'
    NC='\033[0m'
else
    GREEN='' YELLOW='' CYAN='' RED='' NC=''
fi

info()  { echo -e "${CYAN}==> ${NC}$1"; }
ok()    { echo -e "${GREEN} ok ${NC}$1"; }
warn()  { echo -e "${YELLOW}warn${NC} $1"; }
fail()  { echo -e "${RED}FAIL${NC} $1"; exit 1; }

# ---------------------------------------------------------------------------
# 1. Start Postgres
# ---------------------------------------------------------------------------

cd "$PROJECT_DIR"

info "Starting Postgres container..."
docker compose up -d postgres 2>&1 | tail -5

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
# 3. Detect (and optionally start) the standalone Memory server
# ---------------------------------------------------------------------------

MEMORY_TOKEN=""
MEMORY_URL=""
MEMORY_PROJECT_ID=""
MEMORY_ENV="${HOME}/.memory/config/.env.local"

memory_is_healthy() {
    curl -s http://localhost:3002/health 2>/dev/null \
        | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('checks',{}).get('database',{}).get('status')=='healthy' else 1)" 2>/dev/null
}

if ! $NO_MEMORY; then
    # Optionally start Memory if requested and not already running.
    if $START_MEMORY; then
        if memory_is_healthy; then
            ok "Memory server already running (port 3002)"
        else
            if command -v memory &>/dev/null; then
                info "Starting Memory server..."
                memory server ctl start 2>&1 | grep -v "new version" || true
                info "Waiting for Memory server to become healthy..."
                for i in $(seq 1 90); do
                    if memory_is_healthy; then
                        ok "Memory server is ready (port 3002)"
                        break
                    fi
                    if [ "$i" -eq 90 ]; then
                        warn "Memory server not fully healthy after 90s — continuing without Memory"
                    fi
                    sleep 1
                done
            else
                warn "'memory' CLI not found — cannot start Memory server"
                warn "Install: curl -sSfL https://memory.emergent-company.ai/install | sh"
            fi
        fi
    fi

    # Auto-detect: read config and check health.
    if [ -f "${MEMORY_ENV}" ] && memory_is_healthy; then
        MEMORY_TOKEN=$(grep '^STANDALONE_API_KEY=' "${MEMORY_ENV}" | cut -d= -f2- || echo "")
        MEMORY_URL="http://localhost:3002"

        # Resolve project ID from the API.
        MEMORY_PROJECT_ID=$(curl -s http://localhost:3002/api/projects \
            -H "X-API-Key: ${MEMORY_TOKEN}" 2>/dev/null | \
            python3 -c "
import sys, json
try:
    projects = json.load(sys.stdin)
    if isinstance(projects, list) and projects:
        print(projects[0]['id'])
    elif isinstance(projects, dict) and projects.get('items'):
        print(projects['items'][0]['id'])
except Exception:
    pass
" 2>/dev/null || echo "")

        if [ -n "${MEMORY_PROJECT_ID}" ]; then
            ok "Memory detected — project ${MEMORY_PROJECT_ID}"
        else
            warn "Memory server healthy but could not resolve project ID — check API key"
            MEMORY_TOKEN=""
        fi
    elif [ -f "${MEMORY_ENV}" ]; then
        warn "Memory config found but server not healthy on port 3002 — run 'memory server ctl start' or use --start-memory"
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

if [ -n "${MEMORY_TOKEN}" ] && [ -n "${MEMORY_PROJECT_ID}" ]; then
    cat >> "${ENV_FILE}" << EOF

# Memory (standalone — semantic graph)
EPF_MEMORY_URL=${MEMORY_URL}
EPF_MEMORY_PROJECT=${MEMORY_PROJECT_ID}
EPF_MEMORY_TOKEN=${MEMORY_TOKEN}
EPF_MEMORY_AUTH_MODE=api-key
EOF
    ok ".env.local written (Memory wired: ${MEMORY_URL})"
else
    cat >> "${ENV_FILE}" << EOF

# Memory (not detected — semantic features disabled)
# Start Memory with: memory server ctl start
# Then re-run: task dev-up
# Or use: task dev-up -- --start-memory
# EPF_MEMORY_URL=http://localhost:3002
# EPF_MEMORY_PROJECT=<project-id>
# EPF_MEMORY_TOKEN=<standalone-api-key>
# EPF_MEMORY_AUTH_MODE=api-key
EOF
    ok ".env.local written (Memory not wired)"
fi

# Ensure .env.local is gitignored.
if ! grep -q '\.env\.local' "${PROJECT_DIR}/.gitignore" 2>/dev/null; then
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
    info "Dependencies ready. To start the server:"
    echo ""
    echo "  cd $(basename "$PROJECT_DIR") && task run"
    echo ""
    echo "  MCP:      http://localhost:${PORT}/mcp"
    echo "  Settings: http://localhost:${PORT}/settings"
    echo ""
    exit 0
fi

echo ""
info "Starting strategy-server on port ${PORT}..."
if [ -n "${MEMORY_TOKEN}" ]; then
    echo "  Memory:   ${MEMORY_URL} (project ${MEMORY_PROJECT_ID})"
fi
echo ""
echo "  Health:   http://localhost:${PORT}/health"
echo "  Settings: http://localhost:${PORT}/settings"
echo "  MCP:      http://localhost:${PORT}/mcp"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

exec go run -tags notui . server

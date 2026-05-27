#!/usr/bin/env bash
# dev-setup.sh — One-command local development environment for strategy-server.
#
# What it does:
#   1. Kills any stale server process already listening on PORT (prevents double-process)
#   2. Starts Postgres; waits for it to be healthy
#   3. Auto-detects the standalone Memory server — always re-validates the token
#      against the live server so stale tokens (e.g. after Docker restart) are
#      caught and corrected automatically
#   4. Rewrites .env.local with fresh, validated credentials every run
#   5. Runs database migrations
#   6. Builds the binary (so `task run` always uses up-to-date code)
#   7. Starts the server
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
BINARY="${PROJECT_DIR}/strategy-server"

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
            echo "  --deps-only     Start containers only, don't run server"
            echo ""
            echo "Memory is auto-detected: if ~/.memory/config/.env.local exists and the"
            echo "server is healthy on port 3002, it will be wired automatically."
            echo "The token is re-validated on every run — stale tokens after Docker"
            echo "restarts are caught and corrected automatically."
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
# 1. Kill any stale server process on PORT (double-process guard)
# ---------------------------------------------------------------------------

cd "$PROJECT_DIR"

OLD_PID=$(lsof -ti tcp:${PORT} 2>/dev/null || true)
if [ -n "${OLD_PID}" ]; then
    warn "Port ${PORT} in use by PID(s) ${OLD_PID} — stopping stale server..."
    kill ${OLD_PID} 2>/dev/null || true
    sleep 1
    # Force-kill if still alive.
    STILL_ALIVE=$(lsof -ti tcp:${PORT} 2>/dev/null || true)
    if [ -n "${STILL_ALIVE}" ]; then
        kill -9 ${STILL_ALIVE} 2>/dev/null || true
        sleep 0.5
    fi
    ok "Stale server stopped"
fi

# ---------------------------------------------------------------------------
# 2. Start Postgres
# ---------------------------------------------------------------------------

info "Starting Postgres container..."
docker compose up -d postgres 2>&1 | tail -3

# ---------------------------------------------------------------------------
# 3. Wait for Postgres
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
# 4. Detect (and optionally start) the standalone Memory server
#    Always re-validates the token — handles stale tokens after Docker restart.
# ---------------------------------------------------------------------------

MEMORY_TOKEN=""
MEMORY_URL=""
MEMORY_PROJECT_ID=""
MEMORY_ENV="${HOME}/.memory/config/.env.local"

memory_is_healthy() {
    curl -s http://localhost:3002/health 2>/dev/null \
        | python3 -c "import sys,json; sys.exit(0 if json.load(sys.stdin).get('checks',{}).get('database',{}).get('status')=='healthy' else 1)" 2>/dev/null
}

# Validate that a given API key can list projects (catches stale token after restart).
memory_token_is_valid() {
    local token="$1"
    result=$(curl -s http://localhost:3002/api/projects \
        -H "X-API-Key: ${token}" 2>/dev/null)
    echo "$result" | python3 -c "
import sys, json
try:
    d = json.load(sys.stdin)
    # Valid if we get a list (possibly empty) or a dict with 'items'.
    if isinstance(d, list) or (isinstance(d, dict) and 'items' in d):
        sys.exit(0)
except Exception:
    pass
sys.exit(1)
" 2>/dev/null
}

resolve_project_id() {
    local token="$1"
    curl -s http://localhost:3002/api/projects \
        -H "X-API-Key: ${token}" 2>/dev/null | \
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
" 2>/dev/null || echo ""
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

    # Auto-detect: read config, check health, then ALWAYS validate the token.
    if [ -f "${MEMORY_ENV}" ] && memory_is_healthy; then
        CANDIDATE_TOKEN=$(grep '^STANDALONE_API_KEY=' "${MEMORY_ENV}" | cut -d= -f2- || echo "")
        MEMORY_URL="http://localhost:3002"

        if [ -n "${CANDIDATE_TOKEN}" ]; then
            if memory_token_is_valid "${CANDIDATE_TOKEN}"; then
                MEMORY_TOKEN="${CANDIDATE_TOKEN}"
                MEMORY_PROJECT_ID=$(resolve_project_id "${MEMORY_TOKEN}")
                if [ -n "${MEMORY_PROJECT_ID}" ]; then
                    ok "Memory validated — project ${MEMORY_PROJECT_ID}"
                else
                    warn "Memory token valid but no projects found — check memory setup"
                    MEMORY_TOKEN=""
                fi
            else
                warn "Memory token is stale (server was restarted?) — memory features disabled"
                warn "Re-run after memory is reconfigured: memory server ctl restart"
                # Token is invalid — do not wire memory.
            fi
        else
            warn "Memory config found but STANDALONE_API_KEY is empty"
        fi
    elif [ -f "${MEMORY_ENV}" ]; then
        warn "Memory config found but server not healthy on port 3002"
        warn "Start it with: memory server ctl start"
        warn "Or run:        task dev-up -- --start-memory"
    fi
fi

# ---------------------------------------------------------------------------
# 5. Write .env.local (always rewritten — never stale)
# ---------------------------------------------------------------------------

info "Writing ${ENV_FILE}..."

cat > "${ENV_FILE}" << EOF
# Auto-generated by scripts/dev-setup.sh — $(date -Iseconds)
# Rewritten on every run to ensure credentials are always valid.
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

# Heartbeat (30s in dev for faster feedback; 0 = disabled)
HEARTBEAT_INTERVAL=30
EOF

if [ -n "${MEMORY_TOKEN}" ] && [ -n "${MEMORY_PROJECT_ID}" ]; then
    cat >> "${ENV_FILE}" << EOF

# Memory (standalone — semantic graph features enabled)
EPF_MEMORY_URL=${MEMORY_URL}
EPF_MEMORY_PROJECT=${MEMORY_PROJECT_ID}
EPF_MEMORY_TOKEN=${MEMORY_TOKEN}
EPF_MEMORY_AUTH_MODE=api-key
EOF
    ok ".env.local written (Memory: ${MEMORY_URL}, project: ${MEMORY_PROJECT_ID})"
else
    cat >> "${ENV_FILE}" << EOF

# Memory (not detected or token invalid — semantic features disabled)
# To enable: memory server ctl start  then  task dev-up -- --start-memory
# EPF_MEMORY_URL=http://localhost:3002
# EPF_MEMORY_PROJECT=<project-id>
# EPF_MEMORY_TOKEN=<standalone-api-key>
# EPF_MEMORY_AUTH_MODE=api-key
EOF
    ok ".env.local written (Memory: not wired)"
fi

# Append LLM config — Google AI Studio via OpenAI-compatible endpoint.
# Source: $GOOGLE_GENERATIVE_AI_API_KEY env var (set in shell profile) or
#         uncommented line in ~/.zshrc (fallback for non-interactive shells).
LLM_KEY="${GOOGLE_GENERATIVE_AI_API_KEY:-}"
if [ -z "${LLM_KEY}" ]; then
    # Try to extract from ~/.zshrc (handles commented-out exports too — uncomment first).
    LLM_KEY=$(grep -E '^\s*(export\s+)?GOOGLE_GENERATIVE_AI_API_KEY=' ~/.zshrc 2>/dev/null \
        | sed 's/.*GOOGLE_GENERATIVE_AI_API_KEY=//; s/[[:space:]].*//' | tail -1)
fi

if [ -n "${LLM_KEY}" ]; then
    cat >> "${ENV_FILE}" << EOF

# LLM (Google AI Studio — OpenAI-compatible endpoint)
LLM_PROVIDER_URL=https://generativelanguage.googleapis.com/v1beta/openai
LLM_API_KEY=${LLM_KEY}
LLM_MODEL=models/gemini-3.5-flash
EOF
    ok "LLM configured (Google AI Studio, model: gemini-3.5-flash)"
else
    cat >> "${ENV_FILE}" << EOF

# LLM (not configured — skill executor runs in skeleton mode)
# To enable: export GOOGLE_GENERATIVE_AI_API_KEY=<your-key> in your shell profile
# or set LLM_PROVIDER_URL + LLM_API_KEY + LLM_MODEL manually.
# LLM_PROVIDER_URL=https://generativelanguage.googleapis.com/v1beta/openai
# LLM_API_KEY=<your-google-ai-studio-key>
# LLM_MODEL=models/gemini-3.5-flash
EOF
    warn "LLM not configured — GOOGLE_GENERATIVE_AI_API_KEY not found. Skills will run in skeleton mode."
fi

# Ensure .env.local is gitignored.
if ! grep -q '\.env\.local' "${PROJECT_DIR}/.gitignore" 2>/dev/null; then
    echo '.env.local' >> "${PROJECT_DIR}/.gitignore"
fi

# ---------------------------------------------------------------------------
# 6. Run migrations
# ---------------------------------------------------------------------------

info "Running database migrations..."
set -a; source "${ENV_FILE}"; set +a
go run -tags notui . db --migrate 2>&1
ok "Migrations complete"

# ---------------------------------------------------------------------------
# 7. Build binary (always — ensures the running server matches current code)
# ---------------------------------------------------------------------------

if ! $DEPS_ONLY; then
    info "Building strategy-server binary..."
    go build -o "${BINARY}" . 2>&1
    ok "Binary built: ${BINARY}"
fi

# ---------------------------------------------------------------------------
# 8. Start server (unless --deps-only)
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
else
    echo "  Memory:   disabled (semantic features unavailable)"
fi
echo ""
echo "  Health:   http://localhost:${PORT}/health"
echo "  Settings: http://localhost:${PORT}/settings"
echo "  MCP:      http://localhost:${PORT}/mcp"
echo ""
echo "  Press Ctrl+C to stop."
echo ""

exec "${BINARY}" server

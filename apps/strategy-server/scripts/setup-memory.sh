#!/usr/bin/env bash
# setup-memory.sh — Creates a Memory project and retrieves a project token.
#
# Prerequisites:
#   - Memory server running at MEMORY_URL (default: http://localhost:8787)
#   - memory CLI installed on PATH
#
# Usage:
#   ./scripts/setup-memory.sh
#
# Environment:
#   MEMORY_URL       Memory server URL (default: http://localhost:8787)
#   MEMORY_ORG       Organisation name (default: strategy-dev)
#   MEMORY_PROJECT   Project name (default: strategy)

set -euo pipefail

MEMORY_URL="${MEMORY_URL:-http://localhost:8787}"
MEMORY_ORG="${MEMORY_ORG:-strategy-dev}"
MEMORY_PROJECT="${MEMORY_PROJECT:-strategy}"

echo "==> Setting up Memory project"
echo "    Server:  ${MEMORY_URL}"
echo "    Org:     ${MEMORY_ORG}"
echo "    Project: ${MEMORY_PROJECT}"

# Check memory CLI is installed.
if ! command -v memory &>/dev/null; then
    echo "ERROR: 'memory' CLI not found on PATH."
    echo "Install: go install github.com/emergent-company/memory/cmd/memory@latest"
    exit 1
fi

# Wait for Memory server to be healthy.
echo "==> Waiting for Memory server..."
for i in $(seq 1 30); do
    if curl -sf "${MEMORY_URL}/health" >/dev/null 2>&1; then
        echo "    Memory server is healthy."
        break
    fi
    if [ "$i" -eq 30 ]; then
        echo "ERROR: Memory server not reachable at ${MEMORY_URL} after 30s"
        exit 1
    fi
    sleep 1
done

# Create org if it doesn't exist.
echo "==> Ensuring org '${MEMORY_ORG}' exists..."
memory orgs create --name "${MEMORY_ORG}" --server "${MEMORY_URL}" 2>/dev/null || true

# Get org ID for project creation.
ORG_ID=$(memory orgs list --server "${MEMORY_URL}" --json 2>/dev/null | \
    python3 -c "import sys,json; orgs=json.load(sys.stdin); print(next((o['id'] for o in orgs if o.get('name')=='${MEMORY_ORG}'),''))" 2>/dev/null || echo "")

if [ -z "${ORG_ID}" ]; then
    echo "WARNING: Could not determine org ID. Project creation may fail."
fi

# Create project if it doesn't exist.
echo "==> Ensuring project '${MEMORY_PROJECT}' exists..."
if [ -n "${ORG_ID}" ]; then
    memory projects create --name "${MEMORY_PROJECT}" --org-id "${ORG_ID}" --server "${MEMORY_URL}" 2>/dev/null || true
else
    memory projects create --name "${MEMORY_PROJECT}" --server "${MEMORY_URL}" 2>/dev/null || true
fi

# Create a project token.
echo "==> Creating project token..."
TOKEN_OUTPUT=$(memory projects create-token --server "${MEMORY_URL}" --project "${MEMORY_PROJECT}" --json 2>/dev/null || echo "")

if [ -n "${TOKEN_OUTPUT}" ]; then
    TOKEN=$(echo "${TOKEN_OUTPUT}" | python3 -c "import sys,json; print(json.load(sys.stdin).get('token',''))" 2>/dev/null || echo "")
fi

echo ""
echo "==> Memory project setup complete."
echo ""
echo "Add to your environment or .env file:"
echo "  export PGPORT=5433"
echo "  export EPF_MEMORY_URL=${MEMORY_URL}"
echo "  export EPF_MEMORY_PROJECT=${MEMORY_PROJECT}"
if [ -n "${TOKEN:-}" ]; then
    echo "  export EPF_MEMORY_TOKEN=${TOKEN}"
else
    echo "  export EPF_MEMORY_TOKEN=<create with: memory projects create-token --server ${MEMORY_URL} --project ${MEMORY_PROJECT}>"
fi
echo ""
echo "Then start the server:"
echo "  task run"
echo ""

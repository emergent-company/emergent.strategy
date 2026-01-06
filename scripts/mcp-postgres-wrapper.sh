#!/bin/bash
# MCP Postgres Wrapper
# 
# Dynamically constructs the PostgreSQL connection string using environment variables
# from the repository's .env file. This allows the MCP configuration to adapt to
# different port configurations without hardcoding values.
#
# Environment variables used (with defaults):
#   POSTGRES_USER (default: emergent)
#   POSTGRES_PASSWORD (default: emergent-dev-password)
#   POSTGRES_HOST (default: localhost)
#   POSTGRES_PORT (default: 5432)
#   POSTGRES_DB (default: emergent)
#
# Usage: Referenced by opencode.jsonc and .vscode/mcp.json
#
# Note: The @modelcontextprotocol/server-postgres package is deprecated but still functional.
# We use a pre-installed version from /opt/mcp-servers to avoid conflicts with the 
# project's pnpm-linked node_modules which causes npx to hang.

# Load .env files from repository root (.env first, then .env.local overrides)
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"

load_env_file() {
  local env_file="$1"
  if [ -f "$env_file" ]; then
    # Export variables from .env file using safer parsing
    # This avoids issues with values containing spaces or special characters
    set -a
    while IFS='=' read -r key value; do
      # Skip empty lines and comments
      [[ -z "$key" || "$key" =~ ^[[:space:]]*# ]] && continue
      # Remove leading/trailing whitespace and quotes from value
      value="${value%\"}"
      value="${value#\"}"
      value="${value%\'}"
      value="${value#\'}"
      # Export the variable
      export "$key=$value"
    done < <(grep -v '^[[:space:]]*#' "$env_file" | grep -v '^[[:space:]]*$')
    set +a
  fi
}

# Load .env first, then .env.local (which overrides)
load_env_file "$REPO_ROOT/.env"
load_env_file "$REPO_ROOT/.env.local"

# Use environment variables with defaults
POSTGRES_USER="${POSTGRES_USER:-emergent}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-emergent-dev-password}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-emergent}"

# Build connection string
CONNECTION_STRING="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

# Use pre-installed MCP server from /opt/mcp-servers
# This avoids npx resolution issues caused by project's pnpm node_modules
MCP_SERVER="/opt/mcp-servers/node_modules/@modelcontextprotocol/server-postgres/dist/index.js"

if [ ! -f "$MCP_SERVER" ]; then
  echo "Error: MCP Postgres server not found at $MCP_SERVER" >&2
  echo "Run: mkdir -p /opt/mcp-servers && cd /opt/mcp-servers && npm init -y && npm install @modelcontextprotocol/server-postgres" >&2
  exit 1
fi

exec node "$MCP_SERVER" "$CONNECTION_STRING"

#!/bin/bash
# MCP Postgres Wrapper
# 
# Dynamically constructs the PostgreSQL connection string using environment variables
# from the repository's .env file. This allows the MCP configuration to adapt to
# different port configurations without hardcoding values.
#
# Environment variables used (with defaults):
#   POSTGRES_USER (default: spec)
#   POSTGRES_PASSWORD (default: spec)
#   POSTGRES_HOST (default: localhost)
#   POSTGRES_PORT (default: 5432)
#   POSTGRES_DB (default: spec)
#
# Usage: Referenced by opencode.jsonc and .vscode/mcp.json

# Load .env file from repository root
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
REPO_ROOT="$( cd "$SCRIPT_DIR/.." && pwd )"
ENV_FILE="$REPO_ROOT/.env"

if [ -f "$ENV_FILE" ]; then
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
  done < <(grep -v '^[[:space:]]*#' "$ENV_FILE" | grep -v '^[[:space:]]*$')
  set +a
fi

# Use environment variables with defaults
POSTGRES_USER="${POSTGRES_USER:-spec}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-spec}"
POSTGRES_HOST="${POSTGRES_HOST:-localhost}"
POSTGRES_PORT="${POSTGRES_PORT:-5432}"
POSTGRES_DB="${POSTGRES_DB:-spec}"

# Build connection string
CONNECTION_STRING="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${POSTGRES_HOST}:${POSTGRES_PORT}/${POSTGRES_DB}"

# Start the MCP server with the dynamically constructed connection string
exec npx -y @modelcontextprotocol/server-postgres "$CONNECTION_STRING"

#!/bin/bash
# MCP Langfuse Wrapper
# 
# Loads Langfuse configuration from the repository's .env file and starts
# the Langfuse MCP server with those environment variables.
#
# Environment variables used:
#   LANGFUSE_HOST - Langfuse server URL (e.g., http://localhost:3011)
#   LANGFUSE_PUBLIC_KEY - Public API key
#   LANGFUSE_SECRET_KEY - Secret API key
#
# Usage: Referenced by opencode.jsonc and .vscode/mcp.json

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

# Start the Langfuse MCP server
exec npx tsx "$REPO_ROOT/tools/langfuse-mcp/src/index.ts"

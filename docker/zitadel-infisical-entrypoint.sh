#!/bin/bash
# Zitadel Infisical Entrypoint
# Calls Infisical CLI with proper flags to fetch and inject secrets
# If INFISICAL_TOKEN is not set, skips Infisical and runs command directly

set -e

# Check if Infisical token is provided
if [ -z "$INFISICAL_TOKEN" ]; then
  echo "⚠️  INFISICAL_TOKEN not set - running without Infisical"
  exec "$@"
else
  echo "🔐 Fetching secrets from Infisical..."
  
  # Build Infisical run command with all required flags
  exec /usr/local/bin/infisical run \
    --silent \
    --token="${INFISICAL_TOKEN}" \
    --projectId="${INFISICAL_PROJECT_ID}" \
    --env="${INFISICAL_ENVIRONMENT:-dev}" \
    --path="/workspace" \
    --domain="${INFISICAL_API_URL:-https://app.infisical.com/api}" \
    -- "$@"
fi

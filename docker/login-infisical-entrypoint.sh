#!/bin/bash
# Login Service Infisical Entrypoint
# Calls Infisical CLI with proper flags to fetch and inject secrets

set -e

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

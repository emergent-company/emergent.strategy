#!/bin/bash
# Docker Compose wrapper that fetches secrets from Infisical
# Usage: ./docker-compose-with-infisical.sh [up|down|restart|logs]

set -e

# Check if Infisical CLI is available
if ! command -v infisical &> /dev/null; then
    echo "❌ Infisical CLI not found. Installing..."
    # Install Infisical CLI
    curl -1sLf 'https://dl.cloudsmith.io/public/infisical/infisical-cli/setup.alpine.sh' | sh
    apk add infisical
fi

# Check required environment variables
if [ -z "$INFISICAL_TOKEN" ]; then
    echo "❌ Error: INFISICAL_TOKEN not set"
    echo "   Please set INFISICAL_TOKEN environment variable"
    exit 1
fi

# Default to 'dev' environment if not specified
INFISICAL_ENVIRONMENT=${INFISICAL_ENVIRONMENT:-dev}

echo "🔐 Starting Docker Compose with Infisical secrets..."
echo "   Environment: $INFISICAL_ENVIRONMENT"
echo "   Project ID: $INFISICAL_PROJECT_ID"

# Change to docker directory
cd "$(dirname "$0")"

# Run docker-compose with Infisical secrets injected
infisical run \
    --token="$INFISICAL_TOKEN" \
    --env="$INFISICAL_ENVIRONMENT" \
    --path="/workspace" \
    -- docker compose "$@"

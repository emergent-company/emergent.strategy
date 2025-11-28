#!/bin/sh
# Zitadel Entrypoint Wrapper
# Loads secrets from Infisical volume and starts Zitadel

set -e

echo "🔐 Loading secrets from Infisical volume..."

# Check if secrets file exists
if [ ! -f /secrets/.env.infisical ]; then
  echo "❌ ERROR: /secrets/.env.infisical not found!"
  echo "   Infisical sidecar may not be running or healthy."
  exit 1
fi

# Source the secrets file to export all variables
# The 'set -a' makes all variable assignments export automatically
set -a
. /secrets/.env.infisical
set +a

echo "✅ Secrets loaded successfully"
echo "📊 Starting Zitadel..."

# Execute the original Zitadel command
# Pass all arguments from docker-compose command
exec /app/zitadel "$@"

#!/bin/sh
# Test script to debug Infisical connection issues
# Run inside the infisical-secrets container:
# docker compose exec infisical-secrets sh /current-dir/test-infisical-connection.sh

echo "=== Testing Infisical Connection ==="
echo ""
echo "Environment Variables:"
echo "INFISICAL_API_URL: ${INFISICAL_API_URL}"
echo "INFISICAL_ENVIRONMENT: ${INFISICAL_ENVIRONMENT}"
echo "INFISICAL_PROJECT_ID: ${INFISICAL_PROJECT_ID}"
echo "INFISICAL_TOKEN length: ${#INFISICAL_TOKEN}"
echo "INFISICAL_TOKEN first 20 chars: ${INFISICAL_TOKEN:0:20}..."
echo ""

echo "=== Test 1: List secrets with verbose output ==="
infisical secrets --env="${INFISICAL_ENVIRONMENT}" --projectId="${INFISICAL_PROJECT_ID}" --path="/workspace" 2>&1
echo ""

echo "=== Test 2: Export secrets from /workspace ==="
infisical export --env="${INFISICAL_ENVIRONMENT}" --projectId="${INFISICAL_PROJECT_ID}" --path="/workspace" --format=dotenv 2>&1
echo ""

echo "=== Test 3: Export secrets from root path (/) ==="
infisical export --env="${INFISICAL_ENVIRONMENT}" --projectId="${INFISICAL_PROJECT_ID}" --path="/" --format=dotenv 2>&1
echo ""

echo "=== Test 4: Export without path parameter ==="
infisical export --env="${INFISICAL_ENVIRONMENT}" --projectId="${INFISICAL_PROJECT_ID}" --format=dotenv 2>&1
echo ""

echo "=== Test 5: Verify API connectivity ==="
if command -v curl >/dev/null 2>&1; then
  curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" "${INFISICAL_API_URL}/api/status" 2>&1
else
  echo "curl not available in container"
fi
echo ""

echo "=== Test 6: Check Infisical CLI version ==="
infisical --version
echo ""

echo "=== Done ==="

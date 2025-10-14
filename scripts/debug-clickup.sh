#!/bin/bash
# Quick ClickUp API Debug
# 
# This script fetches your credentials and runs the debug script in one command

echo "🔍 Fetching ClickUp credentials from database..."
echo ""

# Run the credentials script and capture output
CREDS_OUTPUT=$(npx tsx scripts/get-clickup-credentials.ts 2>&1)
echo "$CREDS_OUTPUT"

# Extract API token and workspace ID from the output
API_TOKEN=$(echo "$CREDS_OUTPUT" | grep '"api_token"' | sed -E 's/.*"api_token": "([^"]+)".*/\1/')
WORKSPACE_ID=$(echo "$CREDS_OUTPUT" | grep '"workspace_id"' | sed -E 's/.*"workspace_id": "([^"]+)".*/\1/')

if [ -z "$API_TOKEN" ] || [ -z "$WORKSPACE_ID" ]; then
    echo ""
    echo "❌ Could not extract credentials. Please run manually:"
    echo "   npx tsx scripts/get-clickup-credentials.ts"
    exit 1
fi

echo ""
echo "🚀 Running ClickUp API debug with extracted credentials..."
echo ""

# Run the debug script
npx tsx scripts/debug-clickup-api.ts "$API_TOKEN" "$WORKSPACE_ID" "$1"

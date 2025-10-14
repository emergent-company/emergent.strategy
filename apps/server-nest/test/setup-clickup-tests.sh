#!/bin/bash

# ClickUp Integration Test Setup Script
# This script helps you set up credentials for real API testing

set -e

SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
PROJECT_ROOT="$(dirname "$(dirname "$SCRIPT_DIR")")"
ENV_FILE="$PROJECT_ROOT/.env.test.local"
EXAMPLE_FILE="$PROJECT_ROOT/.env.test.local.example"

echo ""
echo "🔧 ClickUp Integration Test Setup"
echo "===================================="
echo ""

# Check if .env.test.local already exists
if [ -f "$ENV_FILE" ]; then
    echo "⚠️  Found existing .env.test.local file"
    echo ""
    read -p "Do you want to overwrite it? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled. Existing file preserved."
        exit 0
    fi
fi

echo "📝 Please provide your ClickUp credentials:"
echo ""

# Get API token
echo "1️⃣  ClickUp API Token"
echo "   (Get from: https://app.clickup.com/settings/apps)"
echo ""
read -p "   Enter API Token (starts with pk_): " CLICKUP_API_TOKEN

# Validate token format
if [[ ! $CLICKUP_API_TOKEN =~ ^pk_ ]]; then
    echo "⚠️  Warning: Token should start with 'pk_'"
    read -p "   Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled."
        exit 1
    fi
fi

echo ""
echo "2️⃣  ClickUp Workspace ID"
echo "   (Find in URL: app.clickup.com/WORKSPACE_ID/...)"
echo ""
read -p "   Enter Workspace ID: " CLICKUP_WORKSPACE_ID

# Validate workspace ID is numeric
if [[ ! $CLICKUP_WORKSPACE_ID =~ ^[0-9]+$ ]]; then
    echo "⚠️  Warning: Workspace ID should be numeric"
    read -p "   Continue anyway? (y/N): " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "❌ Setup cancelled."
        exit 1
    fi
fi

# Create .env.test.local file
echo ""
echo "💾 Creating .env.test.local..."

cat > "$ENV_FILE" << EOF
# ClickUp Real API Integration Test Credentials
# Generated: $(date)
#
# WARNING: This file contains sensitive credentials!
# It is gitignored and should NEVER be committed to version control.

CLICKUP_API_TOKEN=$CLICKUP_API_TOKEN
CLICKUP_WORKSPACE_ID=$CLICKUP_WORKSPACE_ID
EOF

chmod 600 "$ENV_FILE"  # Make file readable only by owner

echo "✅ File created: $ENV_FILE"
echo "🔒 Permissions set to 600 (owner read/write only)"
echo ""

# Test the credentials
echo "🧪 Testing credentials..."
echo ""

cd "$PROJECT_ROOT/apps/server-nest"

# Check if dependencies are installed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies first..."
    npm install
    echo ""
fi

# Try to build first
echo "🔨 Building project..."
npm run build > /dev/null 2>&1 || {
    echo "⚠️  Build failed. You may need to run 'npm install' manually."
    echo ""
}

# Run a quick test
echo "🚀 Running quick connectivity test..."
echo ""

# Run just the first test (authentication)
npx jest test/clickup-real-api.integration.spec.ts -t "should authenticate successfully" --testTimeout=30000 || {
    echo ""
    echo "❌ Authentication test failed!"
    echo ""
    echo "Possible issues:"
    echo "  1. Invalid API token"
    echo "  2. Invalid workspace ID"
    echo "  3. Network connectivity issues"
    echo "  4. ClickUp API is down"
    echo ""
    echo "Please verify your credentials and try again."
    echo "You can re-run this setup with: ./apps/server-nest/test/setup-clickup-tests.sh"
    exit 1
}

echo ""
echo "✅ Setup complete! Credentials are working."
echo ""
echo "📚 Next steps:"
echo ""
echo "   Run all integration tests:"
echo "   $ cd apps/server-nest"
echo "   $ npm run test:integration:clickup"
echo ""
echo "   Or run with Jest directly:"
echo "   $ cd apps/server-nest"
echo "   $ npx jest test/clickup-real-api.integration.spec.ts --verbose"
echo ""
echo "   View full documentation:"
echo "   $ cat apps/server-nest/test/README-CLICKUP-INTEGRATION-TESTS.md"
echo ""
echo "🎉 Happy testing!"
echo ""

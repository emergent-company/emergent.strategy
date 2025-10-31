#!/bin/bash
# Coolify Deployment Script for Spec Server 2
# Deploys the application to your Coolify instance

set -e

# Configuration
APP_UUID="${COOLIFY_APP_UUID:-your-app-uuid-here}"
ENVIRONMENT="${DEPLOY_ENV:-preview}"

echo "🚀 Starting Coolify Deployment for Spec Server 2..."
echo "   App UUID: $APP_UUID"
echo "   Environment: $ENVIRONMENT"
echo ""

# Check if we're authenticated with Coolify
echo "🔍 Checking Coolify authentication..."
if ! command -v coolify &> /dev/null; then
    echo "❌ Coolify CLI not installed"
    echo "   Install from: https://coolify.io/docs/cli"
    exit 1
fi

if ! coolify project list > /dev/null 2>&1; then
    echo "❌ Not authenticated with Coolify"
    echo "   Run: coolify auth"
    exit 1
fi

echo "✅ Coolify authentication verified"
echo ""

# Get current application status
echo "📋 Current application status:"
coolify app get $APP_UUID || {
    echo "❌ Failed to get app status. Check APP_UUID is correct."
    exit 1
}
echo ""

# Check if app is running
APP_STATUS=$(coolify app get $APP_UUID --format json 2>/dev/null | grep -o '"status":"[^"]*"' | cut -d'"' -f4 || echo "unknown")
echo "Current status: $APP_STATUS"
echo ""

# Confirm deployment
read -p "🤔 Deploy to $ENVIRONMENT environment? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled"
    exit 0
fi

# Trigger deployment
echo "🔨 Triggering deployment..."
coolify app deploy $APP_UUID --$ENVIRONMENT

# Wait a bit for deployment to start
sleep 5

# Follow logs
echo ""
echo "📜 Following deployment logs (Ctrl+C to stop watching)..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
coolify app logs $APP_UUID --$ENVIRONMENT --follow &
LOGS_PID=$!

# Wait for user to stop following logs
wait $LOGS_PID || true

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get final status
echo "🔍 Checking deployment status..."
coolify app get $APP_UUID
echo ""

# Show access information
echo "🎉 Deployment initiated!"
echo ""
echo "📋 Access Information:"
echo "   Admin UI:  https://<your-admin-domain>"
echo "   API:       https://<your-api-domain>"
echo "   Zitadel:   https://<your-zitadel-domain>"
echo ""
echo "🔧 Management Commands:"
echo "   View logs:    coolify app logs $APP_UUID --$ENVIRONMENT --follow"
echo "   Stop:         coolify app stop $APP_UUID --$ENVIRONMENT"
echo "   Restart:      coolify app restart $APP_UUID --$ENVIRONMENT"
echo "   Status:       coolify app get $APP_UUID"
echo ""
echo "💡 Note: It may take a few minutes for services to be fully available."
echo "   Check health: curl https://<your-api-domain>/health"

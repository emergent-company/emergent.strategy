#!/bin/bash
# Sync environment variables to Coolify via REST API
# Usage: ./scripts/sync-coolify-env.sh [env-file] [environment]

set -e

# Configuration
APP_UUID="${COOLIFY_APP_UUID}"
ENV_FILE="${1:-.env.production}"
ENVIRONMENT="${2:-preview}"  # preview or production
COOLIFY_TOKEN="${COOLIFY_TOKEN}"
COOLIFY_URL="${COOLIFY_URL:-https://coolify.yourdomain.com}"

echo "🔄 Coolify Environment Variable Sync"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Validate inputs
if [[ -z "$APP_UUID" ]]; then
    echo "❌ COOLIFY_APP_UUID not set"
    echo "   Export it: export COOLIFY_APP_UUID=your-app-uuid"
    exit 1
fi

if [[ -z "$COOLIFY_TOKEN" ]]; then
    echo "❌ COOLIFY_TOKEN not set"
    echo "   Export it: export COOLIFY_TOKEN=your-api-token"
    echo "   Get token from: Coolify UI → Settings → API Tokens"
    exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
    echo "❌ Environment file not found: $ENV_FILE"
    echo "   Create it from: cp .env.production.example $ENV_FILE"
    exit 1
fi

echo "📋 Configuration:"
echo "   File:        $ENV_FILE"
echo "   Environment: $ENVIRONMENT"
echo "   App UUID:    $APP_UUID"
echo "   Coolify URL: $COOLIFY_URL"
echo ""

# Confirm action
read -p "🤔 Sync these variables to Coolify? (y/N) " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Sync cancelled"
    exit 0
fi

echo ""
echo "🔄 Syncing environment variables..."
echo ""

# Parse and upload each variable
SUCCESS_COUNT=0
FAIL_COUNT=0
SKIP_COUNT=0

while IFS='=' read -r key value; do
    # Skip comments
    [[ "$key" =~ ^#.*$ ]] && continue
    
    # Skip empty lines
    [[ -z "$key" ]] && continue
    
    # Skip section headers (lines with only comments and ==)
    [[ "$key" =~ ^[#=[:space:]]*$ ]] && continue
    
    # Skip lines without values
    if [[ -z "$value" || "$value" =~ ^\<.*\>$ ]]; then
        echo "⏭️  Skipping (no value): $key"
        ((SKIP_COUNT++))
        continue
    fi
    
    # Clean up key (remove leading/trailing whitespace)
    key=$(echo "$key" | xargs)
    
    # Determine if this should be a secret
    IS_SECRET="false"
    if [[ "$key" =~ (PASSWORD|SECRET|KEY|TOKEN) ]]; then
        IS_SECRET="true"
    fi
    
    # Upload via API
    RESPONSE=$(curl -s -X POST "$COOLIFY_URL/api/v1/applications/$APP_UUID/envs" \
        -H "Authorization: Bearer $COOLIFY_TOKEN" \
        -H "Content-Type: application/json" \
        -d "{\"key\":\"$key\",\"value\":\"$value\",\"is_preview\":$([ "$ENVIRONMENT" = "preview" ] && echo true || echo false),\"is_build_time\":false,\"is_secret\":$IS_SECRET}" \
        -w "\n%{http_code}" || echo "000")
    
    HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
    
    if [[ "$HTTP_CODE" =~ ^(200|201)$ ]]; then
        if [[ "$IS_SECRET" == "true" ]]; then
            echo "✅ Set (secret): $key"
        else
            echo "✅ Set: $key"
        fi
        ((SUCCESS_COUNT++))
    else
        echo "❌ Failed: $key (HTTP $HTTP_CODE)"
        ((FAIL_COUNT++))
    fi
    
done < <(grep -v '^#' "$ENV_FILE" | grep '=')

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary:"
echo "   ✅ Success: $SUCCESS_COUNT"
echo "   ❌ Failed:  $FAIL_COUNT"
echo "   ⏭️  Skipped: $SKIP_COUNT"
echo ""

if [[ $FAIL_COUNT -gt 0 ]]; then
    echo "⚠️  Some variables failed to sync"
    echo "   Check Coolify API token and permissions"
    exit 1
fi

echo "🎉 Environment variables synced successfully!"
echo ""
echo "💡 Next steps:"
echo "   1. Verify in Coolify UI: Application → Environment Variables"
echo "   2. Deploy: ./scripts/deploy-coolify.sh"

#!/bin/bash

# Extract Zitadel credentials from production environment
# This script helps gather the information needed to test introspection

echo "🔍 Extracting Zitadel Configuration from Production"
echo "=================================================="
echo ""

echo "1️⃣  Getting Client ID from environment..."
ssh root@kucharz.net "docker inspect zitadel-t4cok0o4cwwoo8o0ccs8ogkg-160001907802 --format='{{range .Config.Env}}{{println .}}{{end}}' | grep 'ZITADEL_CLIENT_JWT' | head -1" | \
  grep -o '"clientId":"[^"]*"' | cut -d'"' -f4 > /tmp/zitadel_client_id.txt

CLIENT_ID=$(cat /tmp/zitadel_client_id.txt)
echo "   Client ID: $CLIENT_ID"
echo ""

echo "2️⃣  Extracting key ID from ZITADEL_CLIENT_JWT..."
ssh root@kucharz.net "docker inspect zitadel-t4cok0o4cwwoo8o0ccs8ogkg-160001907802 --format='{{range .Config.Env}}{{println .}}{{end}}' | grep 'ZITADEL_CLIENT_JWT' | head -1" | \
  grep -o '"keyId":"[^"]*"' | cut -d'"' -f4 > /tmp/zitadel_key_id.txt

KEY_ID=$(cat /tmp/zitadel_key_id.txt)
echo "   Key ID: $KEY_ID"
echo ""

echo "3️⃣  Getting Introspection URL..."
ssh root@kucharz.net "docker inspect zitadel-t4cok0o4cwwoo8o0ccs8ogkg-160001907802 --format='{{range .Config.Env}}{{println .}}{{end}}' | grep 'ZITADEL_INTROSPECTION_URL'" | \
  cut -d'=' -f2 > /tmp/zitadel_introspection_url.txt

INTROSPECTION_URL=$(cat /tmp/zitadel_introspection_url.txt)
echo "   Introspection URL: $INTROSPECTION_URL"
echo ""

echo "4️⃣  Checking authentication keys in database..."
ssh root@kucharz.net "docker exec db-t4cok0o4cwwoo8o0ccs8ogkg-160001872100 psql -U zitadel -d zitadel -t -c 'SELECT id, identifier, enabled FROM projections.authn_keys2;'" | head -5
echo ""

echo "5️⃣  Checking instance information..."
ssh root@kucharz.net "docker exec db-t4cok0o4cwwoo8o0ccs8ogkg-160001872100 psql -U zitadel -d zitadel -t -c 'SELECT id, name FROM projections.instances;'"
echo ""

echo "=================================================="
echo "📝 Summary:"
echo "   Client ID: $CLIENT_ID"
echo "   Key ID: $KEY_ID"
echo "   Introspection URL: $INTROSPECTION_URL"
echo ""
echo "⚠️  Note: To test introspection, you'll also need:"
echo "   1. A valid access token (get from browser after login)"
echo "   2. The client secret (if testing with JWT assertion)"
echo ""
echo "💡 To get an access token:"
echo "   1. Login to https://spec.kucharz.net"
echo "   2. Open DevTools > Application > Local Storage"
echo "   3. Find the access token in the auth state"
echo ""
echo "🧪 Run the test with:"
echo "   node test-zitadel-introspection.mjs <access_token>"

#!/bin/bash

# Quick script to check production auth status
# Usage: ./check-production-auth.sh

echo "=== Production Auth Diagnostic ==="
echo ""

# Find the latest server container
echo "1. Finding server container..."
CONTAINER=$(ssh root@kucharz.net "docker ps --format '{{.Names}}' | grep server-t4cok0o4c | head -1")
echo "   Container: $CONTAINER"
echo ""

# Check container status
echo "2. Container status..."
ssh root@kucharz.net "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep '$CONTAINER'"
echo ""

# Check for KEY_DEBUG logs
echo "3. Checking RSA key processing logs..."
ssh root@kucharz.net "docker logs $CONTAINER 2>&1 | grep 'KEY_DEBUG' | tail -10"
echo ""

# Check for auth errors
echo "4. Checking for auth errors..."
ssh root@kucharz.net "docker logs --tail 50 $CONTAINER 2>&1 | grep -E 'pkcs8|AUTH.*failed|introspection' | tail -10"
echo ""

# Check Zitadel initialization
echo "5. Checking Zitadel initialization..."
ssh root@kucharz.net "docker logs $CONTAINER 2>&1 | grep 'Zitadel service initialized'"
echo ""

echo "=== Diagnostic Complete ==="
echo ""
echo "Common issues to check:"
echo "1. 'KEY_DEBUG' logs - check if RSA key has actual newlines or literal \\n"
echo "2. 'pkcs8 must be PKCS#8 formatted string' - key format is still wrong"
echo "3. 'column \"zitadel_user_id\" does not exist' - migration 0005 not run yet"
echo ""
echo "To manually run migrations if needed:"
echo "  ssh root@kucharz.net 'docker exec \$CONTAINER npx nx run server-nest:migrate'"

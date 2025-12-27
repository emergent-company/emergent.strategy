#!/bin/bash

# Helper script to run provisioning with guidance
# This script helps gather required information and runs the provisioning

echo "=========================================="
echo "Zitadel Service Account Provisioning"
echo "=========================================="
echo ""
echo "This script will create two service accounts:"
echo "  1. CLIENT - For token introspection (minimal permissions)"
echo "  2. API - For Management API operations (elevated permissions)"
echo ""

# Check if secrets directory exists
if [ ! -d "secrets" ]; then
    echo "Creating secrets directory..."
    mkdir -p secrets
    chmod 700 secrets
fi

# Domain
DOMAIN="spec-zitadel.kucharz.net"
echo "Zitadel Domain: $DOMAIN"
echo ""

# Get Admin Token
echo "Step 1: Get Admin Personal Access Token"
echo "----------------------------------------"
echo "1. Go to: https://$DOMAIN"
echo "2. Login as admin"
echo "3. Click your profile (top right) → Personal Access Tokens"
echo "4. Create new token with name: 'Service Account Provisioning'"
echo "5. Copy the token (starts with 'dEnN...')"
echo ""
read -sp "Paste your Admin Token: " ADMIN_TOKEN
echo ""
echo ""

# Get Organization ID
echo "Step 2: Get Organization ID"
echo "----------------------------------------"
echo "1. In Zitadel Console → Click on your Organization name (top left)"
echo "2. Go to 'General' or 'Settings'"
echo "3. Look for 'Organization ID' (numeric string, e.g. '123456789012345678')"
echo ""
read -p "Enter your Organization ID: " ORG_ID
echo ""

# Get Project ID
echo "Step 3: Get Project ID"
echo "----------------------------------------"
echo "1. In Zitadel Console → Projects"
echo "2. Click on your API project (probably named 'Spec API' or similar)"
echo "3. Look for 'Project ID' in the project details (numeric string)"
echo ""
read -p "Enter your Project ID: " PROJECT_ID
echo ""

# Confirm
echo "=========================================="
echo "Configuration Summary"
echo "=========================================="
echo "Domain:          $DOMAIN"
echo "Organization ID: $ORG_ID"
echo "Project ID:      $PROJECT_ID"
echo "Admin Token:     ${ADMIN_TOKEN:0:20}... (hidden)"
echo ""
read -p "Does this look correct? (y/n): " CONFIRM

if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Aborted. Please run again."
    exit 1
fi

echo ""
echo "=========================================="
echo "Running Provisioning Script"
echo "=========================================="
echo ""

# Export variables and run provisioning script
export ZITADEL_DOMAIN="$DOMAIN"
export ZITADEL_ADMIN_TOKEN="$ADMIN_TOKEN"
export ZITADEL_ORG_ID="$ORG_ID"
export ZITADEL_PROJECT_ID="$PROJECT_ID"

# Run the actual provisioning script
./scripts/setup-zitadel-service-accounts.sh secrets/

# Check exit code
if [ $? -eq 0 ]; then
    echo ""
    echo "=========================================="
    echo "✅ Provisioning Complete!"
    echo "=========================================="
    echo ""
    echo "Files created:"
    ls -lh secrets/*.json 2>/dev/null || echo "Warning: JSON files not found"
    echo ""
    echo "Next steps:"
    echo "1. Review the generated JSON files"
    echo "2. Upload to production server (if deploying to remote)"
    echo "3. Update deployment environment variables"
    echo "4. Deploy and verify"
    echo ""
    echo "See docs/ZITADEL_DUAL_SERVICE_ACCOUNT_SETUP.md for details"
else
    echo ""
    echo "❌ Provisioning failed. Check the error messages above."
    echo ""
    echo "Common issues:"
    echo "- Admin token expired or invalid"
    echo "- Incorrect Organization ID or Project ID"
    echo "- Network connection issues"
    echo "- Missing required tools (curl, jq)"
    echo ""
fi

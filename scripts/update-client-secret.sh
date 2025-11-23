#!/bin/bash

# New client secret from user
NEW_SECRET="d8f4fe2cf200ef5a592fa3450326f7d9d2826bebb6d0600d65e4e3e21e362dca"

# Update .env.local
if [ -f .env.local ]; then
  # Check if INFISICAL_CLIENT_SECRET exists
  if grep -q "^INFISICAL_CLIENT_SECRET=" .env.local; then
    # Update existing
    sed -i.bak "s/^INFISICAL_CLIENT_SECRET=.*/INFISICAL_CLIENT_SECRET=$NEW_SECRET/" .env.local
    echo "✅ Updated INFISICAL_CLIENT_SECRET in .env.local"
  else
    # Add new
    echo "INFISICAL_CLIENT_SECRET=$NEW_SECRET" >> .env.local
    echo "✅ Added INFISICAL_CLIENT_SECRET to .env.local"
  fi
else
  echo "❌ .env.local not found"
  exit 1
fi

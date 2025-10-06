#!/bin/bash
# Manual API endpoint tests for Integrations
# Requires server to be running on localhost:3001

set -e

BASE_URL="http://localhost:3001"
ORG_ID="3d8b6f2a-1c4e-4b5d-9a7f-8e3c2d1b0a9f"
PROJECT_ID="a1b2c3d4-5e6f-7g8h-9i0j-1k2l3m4n5o6p"

echo "=========================================="
echo "Integration API Endpoint Tests"
echo "=========================================="
echo ""

# Test 1: List available integrations
echo "Test 1: GET /integrations/available"
echo "------------------------------------------------------------"
response=$(curl -s -X GET \
  "${BASE_URL}/integrations/available" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}")

if echo "$response" | jq -e '.[] | select(.name == "clickup")' > /dev/null; then
  echo "✅ ClickUp integration found in available list"
  echo "$response" | jq '.[] | select(.name == "clickup")'
else
  echo "❌ ClickUp integration not found"
  exit 1
fi
echo ""

# Test 2: List configured integrations (should be empty initially)
echo "Test 2: GET /integrations"
echo "------------------------------------------------------------"
response=$(curl -s -X GET \
  "${BASE_URL}/integrations" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}")

echo "Configured integrations:"
echo "$response" | jq '.'
echo ""

# Test 3: Create a ClickUp integration
echo "Test 3: POST /integrations"
echo "------------------------------------------------------------"
response=$(curl -s -X POST \
  "${BASE_URL}/integrations" \
  -H "Content-Type: application/json" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}" \
  -d '{
    "integration_name": "clickup",
    "display_name": "My ClickUp Workspace",
    "settings": {
      "api_token": "pk_test_token_12345",
      "workspace_id": "ws_test_workspace",
      "import_completed_tasks": false,
      "import_comments": true
    },
    "enabled": true
  }')

if echo "$response" | jq -e '.id' > /dev/null; then
  echo "✅ Integration created successfully"
  INTEGRATION_ID=$(echo "$response" | jq -r '.id')
  echo "Integration ID: $INTEGRATION_ID"
  echo "$response" | jq '.'
else
  echo "❌ Failed to create integration"
  echo "$response"
  exit 1
fi
echo ""

# Test 4: Get the integration
echo "Test 4: GET /integrations/${INTEGRATION_ID}"
echo "------------------------------------------------------------"
response=$(curl -s -X GET \
  "${BASE_URL}/integrations/${INTEGRATION_ID}" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}")

if echo "$response" | jq -e '.id' > /dev/null; then
  echo "✅ Integration retrieved successfully"
  echo "$response" | jq '.'
else
  echo "❌ Failed to retrieve integration"
  echo "$response"
  exit 1
fi
echo ""

# Test 5: Test connection (will fail with fake token)
echo "Test 5: POST /integrations/${INTEGRATION_ID}/test"
echo "------------------------------------------------------------"
echo "(Expected to fail with fake credentials)"
response=$(curl -s -X POST \
  "${BASE_URL}/integrations/${INTEGRATION_ID}/test" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}")

echo "Test result:"
echo "$response" | jq '.'
echo ""

# Test 6: Update integration
echo "Test 6: PATCH /integrations/${INTEGRATION_ID}"
echo "------------------------------------------------------------"
response=$(curl -s -X PATCH \
  "${BASE_URL}/integrations/${INTEGRATION_ID}" \
  -H "Content-Type: application/json" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}" \
  -d '{
    "display_name": "Updated ClickUp Workspace",
    "enabled": false
  }')

if echo "$response" | jq -e '.display_name == "Updated ClickUp Workspace"' > /dev/null; then
  echo "✅ Integration updated successfully"
  echo "$response" | jq '.'
else
  echo "❌ Failed to update integration"
  echo "$response"
  exit 1
fi
echo ""

# Test 7: Delete integration
echo "Test 7: DELETE /integrations/${INTEGRATION_ID}"
echo "------------------------------------------------------------"
http_code=$(curl -s -o /dev/null -w "%{http_code}" -X DELETE \
  "${BASE_URL}/integrations/${INTEGRATION_ID}" \
  -H "X-Org-Id: ${ORG_ID}" \
  -H "X-Project-Id: ${PROJECT_ID}")

if [ "$http_code" == "204" ]; then
  echo "✅ Integration deleted successfully (HTTP 204)"
else
  echo "❌ Failed to delete integration (HTTP $http_code)"
  exit 1
fi
echo ""

echo "=========================================="
echo "✅ All API endpoint tests passed!"
echo "=========================================="

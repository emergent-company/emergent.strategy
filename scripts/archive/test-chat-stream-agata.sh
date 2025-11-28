#!/bin/bash

# Test chat stream with "Agata" query
# This will show us what SSE events are actually being sent

CONV_ID="70331b17-ce25-487e-b555-8af41296049d"

echo "Testing chat stream with 'Agata' query..."
echo "Conversation ID: $CONV_ID"
echo "Project ID: 342b78f5-2904-4e1a-ae41-9c2d481a3a46"
echo "Org ID: ed2a354d-feac-4de5-8f4a-e419822ac2ab"
echo ""
echo "SSE Events:"
echo "==========="

curl -N "http://localhost:3001/chat/${CONV_ID}/stream?userMessage=Tell%20me%20about%20Agata" \
  -H "X-Project-ID: 342b78f5-2904-4e1a-ae41-9c2d481a3a46" \
  -H "X-Org-ID: ed2a354d-feac-4de5-8f4a-e419822ac2ab" \
  2>&1 | head -100

echo ""
echo "==========="
echo "Done"

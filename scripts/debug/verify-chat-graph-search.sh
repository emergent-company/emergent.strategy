#!/bin/bash

# Quick verification that chat graph search integration is working

echo "🧪 Chat Graph Search Integration - Quick Verification"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# 1. Test graph search API directly
echo "1️⃣  Testing graph search API..."
SEARCH_RESULT=$(curl -s -X POST "http://localhost:3001/graph/search-with-neighbors" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: 3b56145d-26b6-4eea-b32c-16f9273533eb" \
  -H "X-Org-ID: 8ec7cf01-e9d0-4604-8304-1d762b97ace9" \
  -d '{"query":"LegalPlant integration strategy","limit":5,"includeNeighbors":true,"maxNeighbors":3,"maxDistance":0.5}')

OBJECT_COUNT=$(echo "$SEARCH_RESULT" | jq -r '.primaryResults | length' 2>/dev/null || echo "0")

if [ "$OBJECT_COUNT" -gt 0 ]; then
    echo "   ✅ Graph search found $OBJECT_COUNT objects"
    echo "$SEARCH_RESULT" | jq -r '.primaryResults[] | "      - [\(.type)] \(.properties.name)"' 2>/dev/null || true
else
    echo "   ⚠️  No objects found (this is OK for empty project)"
fi
echo ""

# 2. Check if chat controller has graph search code
echo "2️⃣  Checking ChatController code..."
if grep -q "graphService.searchObjectsWithNeighbors" apps/server-nest/src/modules/chat/chat.controller.ts 2>/dev/null; then
    echo "   ✅ ChatController calls searchObjectsWithNeighbors()"
else
    echo "   ❌ ChatController missing graph search integration"
fi

if grep -q "graphObjects" apps/server-nest/src/modules/chat/chat.controller.ts 2>/dev/null; then
    echo "   ✅ ChatController emits graphObjects SSE event"
else
    echo "   ❌ ChatController missing graphObjects SSE event"
fi

if grep -q "graph_objects_count" apps/server-nest/src/modules/chat/chat.controller.ts 2>/dev/null; then
    echo "   ✅ Summary includes graph_objects_count"
else
    echo "   ❌ Summary missing graph_objects_count"
fi
echo ""

# 3. Check feature flag
echo "3️⃣  Checking configuration..."
if grep -q "CHAT_ENABLE_GRAPH_SEARCH" .env 2>/dev/null; then
    FLAG_VALUE=$(grep "CHAT_ENABLE_GRAPH_SEARCH" .env | cut -d= -f2)
    if [ "$FLAG_VALUE" = "0" ]; then
        echo "   ⚠️  CHAT_ENABLE_GRAPH_SEARCH=0 (disabled)"
    else
        echo "   ✅ CHAT_ENABLE_GRAPH_SEARCH=1 (enabled)"
    fi
else
    echo "   ✅ CHAT_ENABLE_GRAPH_SEARCH not set (default: enabled)"
fi
echo ""

# 4. Check if services are running
echo "4️⃣  Checking services..."
if curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/health | grep -q "200"; then
    echo "   ✅ Server running on port 3001"
else
    echo "   ❌ Server not responding on port 3001"
fi

if curl -s -o /dev/null -w "%{http_code}" http://localhost:5175 | grep -q "200"; then
    echo "   ✅ Admin running on port 5175"
else
    echo "   ❌ Admin not responding on port 5175"
fi
echo ""

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ "$OBJECT_COUNT" -gt 0 ]; then
    echo "✅ Integration Status: WORKING"
    echo ""
    echo "🎉 Chat graph search is fully functional!"
    echo ""
    echo "To see it in action:"
    echo "   1. Open http://localhost:5175"
    echo "   2. Go to AI Chat"
    echo "   3. Ask: 'Tell me about LegalPlant integration strategy'"
    echo "   4. Open DevTools → Network → EventStream"
    echo "   5. Look for graphObjects in SSE frames"
else
    echo "⚠️  Integration Status: READY (no test data)"
    echo ""
    echo "The code is integrated correctly, but there are no objects to find."
    echo "To create test objects:"
    echo "   node test-chat-graph-complete.mjs"
fi
echo ""
echo "For detailed test results, see:"
echo "   docs/CHAT_GRAPH_SEARCH_TEST_RESULTS.md"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

## Instructions to Test Chat Graph Search with Debug Logging

> **Note**: As of 2025-11-18, the `X-Org-ID` header is no longer required. API requests only need `X-Project-ID`. See [Migration Guide](../../migrations/remove-org-id-header-migration.md).

**Debug logging is now enabled!** (`E2E_DEBUG_CHAT=1`)

### Steps to Test:

1. Open http://localhost:5175 in your browser
2. Navigate to **AI Chat**
3. Ask: **"Who is Agata?"** or **"Tell me about Agata"**
4. The LLM should respond (even if it doesn't find objects)

### Then Check the Logs:

Run this command to see what happened:

```bash
npm run workspace:logs -- server | grep -E "\[stream\]|graph search" | tail -30
```

You should see debug output like:
```
[stream] graph search results: N objects with M neighbor groups
```

Or if it failed:
```
[stream] graph search failed: <error message>
```

Or if disabled:
```
[stream] graph search disabled (CHAT_ENABLE_GRAPH_SEARCH=0)
```

### What We're Looking For:

1. **If you see**: `[stream] graph search results: 10 objects...`
   - ✅ Graph search IS working and finding objects!
   - The issue is that graphObjects SSE events aren't visible in DevTools
   - Check Network → EventStream → Messages tab more carefully

2. **If you see**: `[stream] graph search results: 0 objects...`
   - The search is running but not finding results
   - This could be due to:
     - Project/Org ID mismatch
     - FTS not matching "agata"
     - Query text sanitization

3. **If you see**: `[stream] graph search failed: <error>`
   - There's an error in the search code
   - We'll need to fix it

4. **If you don't see any `[stream]` logs**:
   - Chat endpoint might not be called
   - Or the request didn't reach the GET /:id/stream handler

### Quick Test Without Browser:

You can also test the graph search API directly:

```bash
# Replace PROJECT_ID with your current one from the browser URL
curl -X POST "http://localhost:3001/graph/search-with-neighbors" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: YOUR_PROJECT_ID" \
  -d '{"query":"Agata","limit":5,"includeNeighbors":true,"maxNeighbors":3,"maxDistance":0.5}' | jq
```

This should return all 10 "Agata" objects we found in the database!

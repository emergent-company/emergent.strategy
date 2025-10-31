# Chat Graph Search Investigation Summary

## The Mystery

**Problem:** User asked about "Agata" in browser chat, but SSE events only show `{"type":"meta"}` and `{"type":"token"}` - no `{"graphObjects": [...]}` frame.

## What We've Verified

### ✅ Code Integration is Complete
- GraphModule imported into ChatModule
- GraphService injected into ChatController
- searchObjectsWithNeighbors() called before LLM generation
- SSE events emit graphObjects and graphNeighbors
- Code deployed and services running

### ✅ Data Exists
- Found 10 "Agata" objects in database
- All in user's project: `342b78f5-2904-4e1a-ae41-9c2d481a3a46`
- All in user's org: `ed2a354d-feac-4de5-8f4a-e419822ac2ab`
- Types: Person (7), Organization (1), Decision (3)

### ✅ Search Works
- Direct FTS query finds 5 objects matching "agata"
- Graph search API endpoint exists
- searchObjectsFts correctly filters by project_id and org_id

### ✅ Debug Mode Enabled
- `E2E_DEBUG_CHAT=1` is set in .env
- Services restarted (19-20s uptime)
- Console.log statements should appear in logs

### ✅ Feature Flag Enabled (by default)
- No `CHAT_ENABLE_GRAPH_SEARCH` in .env (good - uses default)
- Default behavior: `process.env.CHAT_ENABLE_GRAPH_SEARCH !== '0'` → `true`
- Graph search should be enabled

## What We DON'T Know Yet

### ❓ Is the Code Actually Executing?
We haven't seen any logs from the `[stream]` debug statements. This could mean:
1. Chat endpoint not being called when user sends message
2. Error occurring before graph search code runs
3. Logs going somewhere else
4. Debug flag not being read correctly at runtime

### ❓ Are SSE Events Being Sent?
Even if search runs and finds objects, we don't know if:
1. SSE events are being written to response stream
2. Browser is receiving them but not showing them
3. Events are malformed and browser ignores them

### ❓ Is the Search Finding Results?
We know FTS query WOULD find results, but we don't know if:
1. User's actual query text matches what we tested ("agata")
2. searchObjectsWithNeighbors is being called with correct params
3. Results are being returned from the search

## Next Steps - Critical Testing

### 1. Monitor Logs While Testing (MOST IMPORTANT)
```bash
# Terminal 1
npm run workspace:logs -- server | grep -E "\[stream\]|searchObjects"
```

Then in browser: Ask about "Agata"

**What to look for:**
- `[stream] graph search results: 5 objects with X neighbor groups` → SUCCESS!
- `[stream] graph search results: 0 objects` → Search ran but found nothing
- `[stream] graph search failed: <error>` → Error occurred
- `[stream] graph search disabled` → Feature flag off
- **NOTHING** → Endpoint not called OR error before graph search

### 2. Test Graph Search API Directly
```bash
curl -X POST "http://localhost:3001/graph/search-with-neighbors" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: 342b78f5-2904-4e1a-ae41-9c2d481a3a46" \
  -H "X-Org-ID: ed2a354d-feac-4de5-8f4a-e419822ac2ab" \
  -d '{"query":"Agata","limit":5}' | jq '.primaryResults | length'
```

**Expected:** Should return 5 (or similar number > 0)
**If 0:** Search API has an issue

### 3. Verify Runtime Environment
Check if the server is actually reading the debug flag:
```bash
# Check process environment
npm run workspace:logs -- server | grep -i "debug\|CHAT_ENABLE" | head -20
```

## Hypotheses (Ordered by Likelihood)

### 1. Logs Are Appearing But We Missed Them
- **Test:** Monitor logs WHILE testing in browser (simultaneously)
- **If true:** Will see `[stream]` messages appear
- **Fix:** No fix needed - feature is working

### 2. User's Query Text Doesn't Match "Agata"
- **Test:** Check conversation messages in database for exact text
- **If true:** Logs will show `0 objects found`
- **Fix:** Adjust query or test with different question

### 3. Error Before Graph Search Runs
- **Test:** Check full server logs for errors
- **If true:** Will see error messages in logs
- **Fix:** Fix the error

### 4. SSE Events Sent But Browser Not Showing Them
- **Test:** Use curl to test chat stream (requires auth)
- **If true:** curl will show events, browser won't
- **Fix:** Frontend SSE parser issue

### 5. Feature Flag Actually Off
- **Test:** Add explicit log of flag value at startup
- **If true:** Logs will show "disabled"
- **Fix:** Set `CHAT_ENABLE_GRAPH_SEARCH=1` in .env

## User Action Items

See `DEBUG_CHAT_GRAPH_SEARCH_v2.md` for detailed testing instructions.

**Priority Order:**
1. 🔴 **Monitor logs WHILE testing in browser** (most critical)
2. 🟡 **Test graph search API directly** (isolate search functionality)
3. 🟢 **Check full server logs for errors** (if no debug logs appear)

## Expected Outcome

If everything is working correctly:
- Logs should show: `[stream] graph search results: 5 objects with X neighbor groups`
- Browser SSE events should include: `{"graphObjects": [...]}`
- Chat response should reference Agata in some way

If we still don't see graphObjects:
- Need to add MORE logging to find where the flow breaks
- Possibly add logging to: request handler entry, before search call, after search call, before SSE write, after SSE write

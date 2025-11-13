# Debugging Chat Graph Search Integration

## Current Status

✅ **Implementation Complete**: Graph search is fully integrated into ChatController
✅ **Services Running**: All services are online with debug logging enabled
✅ **Debug Mode Enabled**: `E2E_DEBUG_CHAT=1` is set
✅ **Data Verified**: 10 "Agata" objects exist in your project
✅ **FTS Search Works**: Direct database queries find the objects

## Critical Finding

Your conversation is using:
- Project ID: `342b78f5-2904-4e1a-ae41-9c2d481a3a46`
- Org ID: `ed2a354d-feac-4de5-8f4a-e419822ac2ab`

The 10 "Agata" objects are in this SAME project! ✅

So the search SHOULD find them. Let's verify it's actually running.

## What to Test

### 1. Test in Browser & Monitor Logs Simultaneously

**Terminal 1 - Start watching logs:**
```bash
npm run workspace:logs -- server | grep -E "\[stream\]|searchObjects"
```

**Terminal 2 - Or use this for more context:**
```bash
tail -f apps/server/logs/app.log | grep -E "\[stream\]|graph search|searchObjects"
```

**Browser:**
1. Open: http://localhost:5175/admin/apps/chat/c/70331b17-ce25-487e-b555-8af41296049d
2. Ask: "Tell me about Agata"
3. **Immediately check the terminal** to see if any logs appear

### 2. What You Should See in Logs

Look for one of these messages:

- ✅ **Success**: `[stream] graph search results: N objects with M neighbor groups`
  - This means it found graph objects!
  - You should see `{"graphObjects": [...]}` in browser SSE events
  
- ⚠️ **Empty Results**: `[stream] graph search results: 0 objects with 0 neighbor groups`
  - Search ran but found nothing (this would be unexpected given our data)
  
- ❌ **Error**: `[stream] graph search failed: <error message>`
  - Something went wrong during search
  
- 🔕 **Disabled**: `[stream] graph search disabled (CHAT_ENABLE_GRAPH_SEARCH=0)`
  - Feature flag is turned off (but it should be enabled by default)

### 3. If You See NOTHING in Logs

If no logs appear when you send the message, it means:
- The endpoint isn't being called, OR
- There's an error before the graph search code runs

Check the full server logs for any errors:
```bash
npm run workspace:logs -- server | tail -100
```

### 4. Check Browser SSE Events

In Browser DevTools:
1. Network tab → Find the SSE stream request
2. Click on it → Response tab
3. Look for frames with `graphObjects`:

**Expected:**
```json
data: {"type":"meta"}

data: {"graphObjects": [{"id": "...", "type": "Person", "name": "Agata", ...}]}

data: {"type":"token","text":"Based"}
```

**What you reported seeing:**
```json
data: {"type":"meta"}

data: {"type":"token","text":"..."}
```

No `graphObjects` frame! This is the issue we're investigating.

## Alternative Tests

### Test 1: Graph Search API Directly

This bypasses chat and tests just the search:

```bash
curl -X POST "http://localhost:3001/graph/search-with-neighbors" \
  -H "Content-Type: application/json" \
  -H "X-Project-ID: 342b78f5-2904-4e1a-ae41-9c2d481a3a46" \
  -H "X-Org-ID: ed2a354d-feac-4de5-8f4a-e419822ac2ab" \
  -d '{"query":"Agata","limit":5}' | jq '.primaryResults | length'
```

**Expected:** Should return a number > 0 (like 5)
**If it returns 0:** The search itself has an issue

### Test 2: Check Feature Flag at Runtime

Let's verify the feature flag is actually being read correctly:

```bash
grep "CHAT_ENABLE_GRAPH_SEARCH" .env
```

If you see nothing (empty), that's GOOD - it means it's using the default (enabled).
If you see `CHAT_ENABLE_GRAPH_SEARCH=0`, that's the problem - change it to `1` or remove the line.

## Debugging Checklist

Run through this checklist and report back:

- [ ] Started log monitoring (`npm run workspace:logs -- server | grep "\[stream\]"`)
- [ ] Asked about "Agata" in browser chat
- [ ] Saw log messages appear (or didn't see anything)
- [ ] Checked browser SSE events in DevTools Network tab
- [ ] Tested graph search API directly (curl command above)
- [ ] Checked feature flag setting

## What We Know So Far

### ✅ Confirmed Working:
- Graph search integration code is deployed
- Debug logging is enabled  
- Services are running
- 10 Agata objects exist in your project
- Direct FTS query finds them
- searchObjectsFts method exists and should work

### ❓ Still Unknown:
- Are logs appearing when you test?
- Is the graph search code actually being executed?
- Are SSE events being sent but filtered by browser?
- Is there an error earlier in the request flow?

## Next Steps

1. **Start log monitoring** in a terminal
2. **Test in browser** (ask about Agata)
3. **Immediately check logs** - did anything appear?
4. **Check browser DevTools** - any graphObjects frames?
5. **Report back** what you saw (or didn't see)

If you see NOTHING in logs, we need to add more logging earlier in the request flow to find where it's failing.

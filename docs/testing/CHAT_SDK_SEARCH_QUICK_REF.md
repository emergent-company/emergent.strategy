# Chat SDK Search Integration - Quick Reference

## Status: ✅ Already Integrated

The unified search is **already connected** to the Chat SDK. No additional implementation needed!

## How It Works

1. **User selects a project** in the Chat SDK UI
2. **Frontend sends projectId** in chat request
3. **Backend creates search_knowledge_base tool** and passes it to LangGraph
4. **LLM autonomously decides** when to call the search tool
5. **Search executes** across graph objects and document chunks
6. **Results are fused** using RRF (Reciprocal Rank Fusion)
7. **LLM incorporates** search results in its response

## Testing

### Quick Browser Test (Recommended First Step)

1. Start services: `nx run workspace-cli:workspace:start`
2. Open: http://localhost:5176/chat-sdk
3. Login and **select a project** from dropdown
4. Ask: "What documents do we have about authentication?"
5. Watch server logs: `nx run workspace-cli:workspace:logs -- --service=server --follow`

**Look for:**

```
[ChatSDK] Creating search tool for project <uuid> in org <uuid>
```

### Automated API Test

```bash
nx run server:test-e2e
```

### Manual Script Test

```bash
node scripts/test-chat-sdk-search.mjs
```

## Key Files

| File                                                               | Purpose                                            |
| ------------------------------------------------------------------ | -------------------------------------------------- |
| `apps/server/src/modules/chat-sdk/tools/chat-search.tool.ts`       | Search tool definition for LangChain               |
| `apps/server/src/modules/chat-sdk/chat-sdk.service.ts`             | Service that creates and registers the search tool |
| `apps/server/src/modules/unified-search/unified-search.service.ts` | Core search logic (graph + text fusion)            |
| `apps/server/tests/e2e/chat-sdk-search.e2e-spec.ts`                | Automated API tests                                |
| `scripts/test-chat-sdk-search.mjs`                                 | Manual testing script                              |
| `docs/testing/CHAT_SDK_SEARCH_TESTING.md`                          | Comprehensive testing guide                        |

## Common Issues

### "Search not working"

**Most common cause:** No project selected in UI

**Fix:** Ensure the project dropdown shows a selected project before sending messages.

**Debug:**

```bash
# Check server logs for this line:
[ChatSDK] Creating search tool for project <uuid> in org <uuid>

# If missing, projectId wasn't sent or org lookup failed
```

### "Search returns nothing"

**Possible causes:**

- No documents uploaded to the project
- No graph objects created
- Embeddings not indexed

**Fix:**

1. Upload documents via `/documents` page
2. Create graph objects via extraction or manual creation
3. Wait for embeddings to be indexed

### "LLM doesn't use search"

**Explanation:** LangGraph's agent decides autonomously whether to call the search tool. If the LLM can answer from general knowledge, it may not search.

**Fix:** Ask more specific questions about your project data:

- ✅ "What authentication methods are documented in our project?"
- ❌ "What is JWT?" (too generic)

## Search Configuration

Default settings in `chat-search.tool.ts:84-98`:

```typescript
{
  limit: 5,                              // Max results (capped at 10)
  fusionStrategy: RRF,                   // Reciprocal Rank Fusion
  weights: {
    graphWeight: 0.6,                    // Slight preference for graph
    textWeight: 0.4
  },
  relationshipOptions: {
    enabled: true,
    maxDepth: 1,                         // Only immediate neighbors
    direction: 'both',                   // Incoming + outgoing
    maxNeighbors: 3                      // Max 3 relationships per node
  }
}
```

To customize, edit the tool configuration in `chat-search.tool.ts`.

## Next Steps

1. **Test it now:**

   ```bash
   # Quick browser test
   npm run chrome:debug
   # Navigate to http://localhost:5176/chat-sdk
   # Select project, ask "What documents do we have?"
   ```

2. **Check logs:**

   ```bash
   nx run workspace-cli:workspace:logs -- --service=server --follow
   ```

3. **Run automated tests:**

   ```bash
   nx run server:test-e2e
   ```

4. **Read full guide:**
   `docs/testing/CHAT_SDK_SEARCH_TESTING.md`

## Summary

🎉 **You're all set!** The search integration is already working. Just make sure to:

- Select a project before chatting
- Ask questions about your project data
- Check server logs to verify tool calls

For detailed debugging and advanced testing, see `docs/testing/CHAT_SDK_SEARCH_TESTING.md`.

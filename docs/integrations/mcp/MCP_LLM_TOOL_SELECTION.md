# MCP LLM-Based Tool Selection Implementation

## Overview

This document describes the implementation of LLM-based intelligent tool selection for the MCP (Model Context Protocol) chat integration. The LLM selector replaces brittle keyword-based pattern matching with context-aware natural language understanding.

## Problem Statement

### Original Pattern Matching Limitations

The original `McpToolDetectorService` used keyword-based pattern matching to detect user intent:

**Limitations:**
- **Brittle**: Required exact phrases or keywords (`"show me"`, `"list"`, `"what are"`)
- **Maintenance burden**: Every new phrasing required code changes
- **Poor coverage**: Missed natural variations like:
  - `"give me decisions"` vs `"show me decisions"` 
  - `"what decisions do we have"` vs `"list decisions"`
  - `"find all decisions"` vs `"get decisions"`
- **Static entity types**: Hardcoded type list, didn't adapt to database changes

**Discovery:**
During manual testing, the query `"what are the last 5 decisions?"` initially failed detection because the keyword patterns didn't match. This revealed fundamental limitations of pattern matching.

## Solution: LLM-Based Tool Selection

### Architecture

The new `McpToolSelectorService` uses an LLM (Google Gemini 1.5 Flash) to intelligently map user queries to MCP tools:

```
User Message → LLM Selector → Tool + Arguments
              ↓ (if error or low confidence)
           Pattern Matcher (fallback)
```

**Two-Tier Detection Strategy:**
1. **Primary**: LLM-based selection (flexible, context-aware)
2. **Fallback**: Pattern matching (reliable backup)

### Key Features

1. **Dynamic Entity Type Discovery**: Queries database for current entity types with instance counts
2. **Contextual Understanding**: LLM understands natural variations in phrasing
3. **Confidence Scoring**: Only uses LLM selection if confidence > 0.7
4. **Graceful Degradation**: Falls back to pattern matching on error or low confidence
5. **Performance Optimized**: Uses fast Gemini Flash model with low temperature (0.1)

## Implementation Details

### McpToolSelectorService

**Location:** `apps/server/src/modules/chat/mcp-tool-selector.service.ts`

**Key Methods:**

#### `selectTool(userMessage, orgId, projectId)`
Main entry point. Returns structured tool selection result:
```typescript
interface ToolSelectionResult {
    shouldUseMcp: boolean;
    suggestedTool?: string;
    suggestedArguments?: Record<string, any>;
    confidence?: number;
    detectedIntent?: string;
}
```

#### `getAvailableEntityTypes(orgId, projectId)`
Queries database for current entity types:
```sql
SELECT tr.type, tr.description, tr.enabled, COUNT(go.id) as instance_count
FROM kb.project_object_type_registry tr
LEFT JOIN kb.graph_objects go ON go.type = tr.type
WHERE tr.enabled = true
GROUP BY tr.type, tr.description, tr.enabled
```

#### `buildToolSelectionPrompt(message, entityTypes)`
Constructs comprehensive prompt including:
- User's message
- Available entity types with counts and descriptions
- All 5 MCP tool descriptions with parameters
- Instructions for JSON response format
- Matching rules (plural/singular handling, limit extraction)

**Example Prompt Structure:**
```
You are a tool selection assistant...

User message: "what are the last 5 decisions?"

Available entity types:
- Decision (12 instances): Strategic or operational decisions
- Location (5 instances): Geographic locations
- Organization (8 instances): Companies or organizations

Available MCP tools:
1. list_entity_types
2. query_entities (parameters: type, limit, sort)
3. schema_version
4. schema_changes
5. type_info

Select the most appropriate tool and provide confidence score.
```

#### `parseToolSelection(llmResponse)`
Parses LLM's JSON response, handling code blocks:
```typescript
// Handles both raw JSON and ```json blocks
const jsonMatch = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
```

### Chat Controller Integration

**Location:** `apps/server/src/modules/chat/chat.controller.ts`

**Changes:**
1. Injected `McpToolSelectorService` into constructor
2. Added two-tier detection logic in `streamPost()` method
3. Added logging for LLM selection results and fallback behavior

**Detection Flow:**
```typescript
const useLlmSelection = process.env.USE_LLM_TOOL_SELECTION !== '0';

if (useLlmSelection) {
    try {
        const llmSelection = await this.mcpSelector.selectTool(message, orgId, projectId);
        
        if (llmSelection.confidence > 0.7) {
            // Use LLM selection
        } else {
            // Low confidence, fallback to pattern matching
        }
    } catch (error) {
        // Error, fallback to pattern matching
    }
} else {
    // LLM selection disabled, use pattern matching
}
```

## Configuration

### Environment Variables

**`USE_LLM_TOOL_SELECTION`** (default: enabled unless set to `'0'`)
- Controls whether LLM-based selection is used
- If disabled, uses pattern matching directly
- If error occurs during LLM selection, automatically falls back to pattern matching

**`VERTEX_AI_CHAT_MODEL`** (default: `gemini-1.5-flash-002`)
- LLM model used for tool selection
- Fast model optimized for low latency

**`VERTEX_AI_PROJECT_ID`** (required)
- Google Cloud project ID for Vertex AI

**`VERTEX_AI_LOCATION`** (default: `us-central1`)
- Vertex AI region

### LLM Configuration

**Model:** `gemini-1.5-flash-002`
- Fast, efficient model for tool selection
- Optimized for low latency (typically < 1 second)

**Temperature:** `0.1`
- Low temperature for consistent, deterministic selection
- Reduces randomness in tool selection

**Max Output Tokens:** `500`
- Small response size (just tool name + parameters)
- Keeps latency low

**Confidence Threshold:** `0.7`
- Only uses LLM selection if confidence > 70%
- Falls back to pattern matching for uncertain cases

## Testing

### Manual Testing

Test with various phrasings of entity queries:

```bash
# In the chat UI, try these queries:
"what are the last 5 decisions?"
"show me decisions"
"list all decisions"
"give me recent decisions"
"find decisions from last week"
"how many decisions do we have"
```

### Expected Behavior

**High Confidence (>0.7):**
- Uses LLM selection
- Logs: `LLM tool selection: query_entities (confidence: 0.95)`
- Emits SSE event: `{ type: 'mcp_tool', tool: 'query_entities', status: 'started' }`

**Low Confidence (<0.7):**
- Falls back to pattern matching
- Logs: `LLM tool selection low confidence (0.5), falling back to pattern matching`

**Error:**
- Falls back to pattern matching
- Logs: `LLM tool selection failed: [error], falling back to pattern matching`

### Logging

The system logs all selection decisions:

```
[ChatController] LLM tool selection: query_entities (confidence: 0.95)
[ChatController] LLM tool selection low confidence (0.5), falling back to pattern matching
[ChatController] LLM tool selection failed: Network timeout, falling back to pattern matching
```

## Performance Considerations

### Latency

**LLM Selection:**
- Adds ~300-800ms per query
- Database query for entity types: ~50ms
- LLM inference: ~200-700ms (Gemini Flash)
- Parsing: ~1ms

**Pattern Matching:**
- ~1-5ms per query
- No external API calls

**Mitigation:**
- Use fast model (Gemini Flash, not Pro)
- Low temperature (0.1) for faster inference
- Small max tokens (500) to reduce generation time
- Fallback ensures reliability even if LLM is slow

### Cost

**Per Query:**
- Input tokens: ~800-1000 (entity types list + prompt)
- Output tokens: ~50-100 (tool name + parameters)
- Cost: ~$0.0001 per query (Gemini Flash pricing)

**Monthly Estimate:**
- 10,000 queries/month: ~$1
- 100,000 queries/month: ~$10

## Advantages Over Pattern Matching

| Aspect | Pattern Matching | LLM Selection |
|--------|------------------|---------------|
| **Flexibility** | Requires exact keywords | Understands natural variations |
| **Maintenance** | Code changes for new phrases | Automatically adapts |
| **Entity Types** | Hardcoded list | Queries database dynamically |
| **Context** | No understanding | Semantic comprehension |
| **Error Handling** | Fails silently | Graceful fallback |
| **Latency** | 1-5ms | 300-800ms |
| **Cost** | Free | ~$0.0001/query |

## Future Enhancements

### Phase 1 (Current)
- ✅ Basic LLM selection with confidence scoring
- ✅ Fallback to pattern matching
- ✅ Dynamic entity type discovery
- ✅ Logging and observability

### Phase 2 (Future)
- [ ] Cache LLM selections for common queries
- [ ] Use embeddings for query similarity matching
- [ ] Add user feedback loop to improve selection
- [ ] Batch entity type queries for performance
- [ ] Add metrics dashboard for selection accuracy

### Phase 3 (Future)
- [ ] Multi-tool execution (chain multiple tools)
- [ ] Conversation context (remember previous tools used)
- [ ] User preferences (learn from corrections)
- [ ] Advanced prompt engineering based on success rates

## Troubleshooting

### LLM Selection Always Failing

**Symptoms:**
- Logs show: `LLM tool selection failed: [error]`
- Always falls back to pattern matching

**Possible Causes:**
1. **Missing Vertex AI credentials**: Check `VERTEX_AI_PROJECT_ID` env var
2. **Network issues**: Check connectivity to Vertex AI endpoints
3. **Invalid model name**: Verify `VERTEX_AI_CHAT_MODEL` setting
4. **Rate limiting**: Check Vertex AI quota

**Debug Steps:**
```bash
# Check environment variables
echo $VERTEX_AI_PROJECT_ID
echo $VERTEX_AI_CHAT_MODEL

# Check server logs
tail -f apps/server/logs/app.log | grep "LLM tool selection"

# Test Vertex AI connection directly
curl -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  https://us-central1-aiplatform.googleapis.com/v1/projects/$VERTEX_AI_PROJECT_ID/locations/us-central1/models
```

### Low Confidence Scores

**Symptoms:**
- Logs show: `LLM tool selection low confidence (0.5), falling back`
- LLM selects tool but confidence < 0.7

**Possible Causes:**
1. **Ambiguous query**: User message unclear or vague
2. **No matching entity types**: Entity type doesn't exist in database
3. **Complex query**: Multiple intents in one message

**Solutions:**
1. Lower confidence threshold (change `0.7` to `0.5` in controller)
2. Improve prompt with more examples
3. Add more context to entity type descriptions

### Incorrect Tool Selection

**Symptoms:**
- LLM selects wrong tool
- Wrong parameters extracted

**Debug Steps:**
1. Check prompt sent to LLM (add debug logging)
2. Verify entity types in database match expected
3. Check LLM response parsing (add logging before parseToolSelection)

**Example Debug Logging:**
```typescript
this.logger.debug(`LLM Prompt: ${prompt}`);
this.logger.debug(`LLM Response: ${response.text}`);
```

## Migration Guide

### From Pattern Matching Only

Current deployments automatically get LLM selection enabled by default. To disable:

```bash
# In .env or environment variables
USE_LLM_TOOL_SELECTION=0
```

### Testing in Staging

1. Enable debug logging:
```typescript
// In chat.controller.ts, add:
this.logger.debug(`User message: ${message}`);
this.logger.debug(`LLM selection: ${JSON.stringify(llmSelection)}`);
this.logger.debug(`Pattern matching: ${JSON.stringify(patternDetection)}`);
```

2. Monitor selection accuracy:
```bash
# Count LLM successes vs fallbacks
grep "LLM tool selection:" logs/app.log | wc -l
grep "falling back to pattern matching" logs/app.log | wc -l
```

3. Compare response times:
```bash
# Add timing logs in controller
const start = Date.now();
const llmSelection = await this.mcpSelector.selectTool(...);
this.logger.log(`LLM selection took ${Date.now() - start}ms`);
```

## Related Documentation

- [MCP_CHAT_DATA_QUERIES_IMPLEMENTATION.md](./MCP_CHAT_DATA_QUERIES_IMPLEMENTATION.md) - Original pattern matching implementation
- [AUTO_DISCOVERY_LLM_INTEGRATION_COMPLETE.md](./AUTO_DISCOVERY_LLM_INTEGRATION_COMPLETE.md) - LangChain/Vertex AI setup
- [CLICKUP_E2E_TESTS.md](./CLICKUP_E2E_TESTS.md) - E2E testing patterns

## Conclusion

The LLM-based tool selection significantly improves the flexibility and maintainability of the MCP chat integration. By understanding natural language variations and dynamically adapting to database entity types, it provides a much better user experience than rigid pattern matching.

The two-tier approach (LLM primary, pattern fallback) ensures reliability while enabling intelligent behavior. The system gracefully degrades when LLM selection fails, ensuring users always get a response even if the LLM is unavailable.

Future enhancements will add caching, metrics, and multi-tool execution to make the system even more powerful and performant.

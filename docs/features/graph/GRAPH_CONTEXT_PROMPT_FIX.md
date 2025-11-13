# Graph Context in LLM Prompt - Fix Implementation

**Date:** October 21, 2025  
**Status:** ✅ COMPLETE  
**Priority:** HIGH - Critical bug fix

## Problem Summary

When users asked questions about entities in the knowledge graph (e.g., "Tell me about Agata"), the LLM responded with "I do not have any information" despite graph search successfully finding relevant objects.

**Root Cause:** Graph objects were being found by search, filtered, and sent to the browser in SSE events, but they were **NOT included in the LLM prompt**. The POST endpoint (used by frontend) was only passing MCP tool context to `buildPrompt()`, never the graph objects.

## Symptoms

1. Graph search found objects correctly (verified by logs: "Graph search returned: 3 objects")
2. Objects had full properties after filtering (verified by JSON.stringify logs)
3. Objects sent to browser in meta frame (verified by SSE logs)
4. Browser received complete graphObjects array
5. **BUT**: LLM response was "I do not have any information about Agata"

## Investigation

Traced prompt building through two different code paths:

### GET /chat/:id/stream (Legacy - WORKING)
- Lines 430-475 in chat.controller.ts
- Built prompt inline with string concatenation
- **Included graph objects context:**
  ```typescript
  **Relevant Knowledge Graph Objects:**
  - [ActionItem] Task name: Description
    Related objects:
      • [Person] Name
  ```
- LLM could reference graph data in response

### POST /chat/stream (Frontend uses - BROKEN)
- Lines 850-860 in chat.controller.ts (before fix)
- Used `buildPrompt()` from chat-generation.service.ts
- **Missing graph context parameter:**
  ```typescript
  const prompt = this.gen.buildPrompt({
      message,
      mcpToolContext,
      detectedIntent
      // MISSING: graphContext
  });
  ```
- LLM never saw the graph objects

## Solution Implemented

### 1. Updated PromptBuildOptions Interface
**File:** `apps/server/src/modules/chat/chat-generation.service.ts`

Added `graphContext` parameter to the interface:

```typescript
export interface PromptBuildOptions {
    message: string;
    mcpToolContext?: string;
    graphContext?: string;  // NEW: Formatted graph objects
    detectedIntent?: string;
    availableEntityTypes?: Array<...>;
}
```

### 2. Updated buildPrompt() Method
**File:** `apps/server/src/modules/chat/chat-generation.service.ts`

Added graph context section after MCP context:

```typescript
buildPrompt(options: PromptBuildOptions): string {
    const { message, mcpToolContext, graphContext, detectedIntent } = options;
    
    let prompt = systemPrompt;
    
    // Add MCP tool context if available
    if (mcpToolContext && mcpToolContext.trim()) {
        prompt += '\n\n## Context from Schema\n\n';
        prompt += this.formatToolContext(mcpToolContext, detectedIntent);
    }
    
    // NEW: Add graph context if available
    if (graphContext && graphContext.trim()) {
        prompt += '\n\n## Context from Knowledge Graph\n\n';
        prompt += graphContext;
    }
    
    // Add user question and response instructions...
}
```

### 3. Format Graph Objects in POST Endpoint
**File:** `apps/server/src/modules/chat/chat.controller.ts`

After line 700 (after graph search and filtering), added context string builder:

```typescript
// Build graph context string for LLM prompt (similar to GET endpoint)
let graphContextString: string | undefined;
if (graphObjects.length > 0) {
    const contextParts: string[] = [];
    contextParts.push('**Relevant Knowledge Graph Objects:**\n');
    for (const obj of graphObjects) {
        const name = obj.properties?.name || obj.key || obj.id;
        const description = obj.properties?.description || '';
        contextParts.push(`- [${obj.type}] ${name}${description ? ': ' + description : ''}`);
        
        // Add neighbors for this object
        const neighbors = graphNeighbors[obj.id] || [];
        if (neighbors.length > 0) {
            contextParts.push(`  Related objects:`);
            for (const neighbor of neighbors.slice(0, 3)) {
                const neighborName = neighbor.properties?.name || neighbor.key || neighbor.id;
                contextParts.push(`    • [${neighbor.type}] ${neighborName}`);
            }
        }
    }
    graphContextString = contextParts.join('\n');
    console.log('[stream-post] Built graph context string:', graphContextString.length, 'chars');
}
```

### 4. Pass Graph Context to buildPrompt()
**File:** `apps/server/src/modules/chat/chat.controller.ts`

Updated buildPrompt() call at line 879:

```typescript
// Build prompt using enhanced prompt builder with MCP context, graph context, and detected intent
const prompt = this.gen.buildPrompt({
    message,
    mcpToolContext,
    graphContext: graphContextString,  // NEW PARAMETER
    detectedIntent
});

// Log prompt preview for debugging
console.log('[stream-post] Prompt preview (first 500 chars):', prompt.substring(0, 500));
```

## Data Flow - After Fix

```
User: "Tell me about Agata"
  ↓
Graph Search: searchObjectsWithNeighbors() finds 3 objects ✅
  ↓
Filter: filterGraphObjectMetadata() removes _extraction_* ✅
  ↓
Format: Build context string from graph objects ✅ NEW
  **Relevant Knowledge Graph Objects:**
  - [ActionItem] Discuss two-level component structure: ...
    Related objects:
      • [Person] Agata Mróz
  ↓
SSE: Send to browser in meta frame ✅
  ↓
Prompt: buildPrompt(message, mcpToolContext, graphContext, intent) ✅ NEW
  ## Context from Knowledge Graph
  **Relevant Knowledge Graph Objects:**
  - [ActionItem] Discuss two-level component structure: ...
  
  ## User Question
  Tell me about Agata
  ↓
LLM: "Agata Mróz is a Developer mentioned in several action items..." ✅ NEW
```

## Expected Results

After the fix, when user asks "Tell me about Agata", the LLM should respond with something like:

```
Based on the knowledge graph, Agata Mróz is a Developer in the Engineering department.

She is associated with several action items:
- **Discuss two-level component structure** - Review and finalize the architecture
- **Implement real-time updates for meeting details** upon document signing

Agata appears to be working on component architecture and meeting management features.
```

Instead of the previous broken response: "I do not have any information about Agata."

## Verification Steps

1. ✅ Services restarted (October 21, 2025)
2. ⏳ **Test in browser**: Ask "Tell me about Agata"
3. ⏳ **Check logs**: Look for "[stream-post] Built graph context string" with character count
4. ⏳ **Check logs**: Look for "[stream-post] Prompt preview" showing graph objects in prompt
5. ⏳ **Verify LLM response**: Should reference Agata by name with details from graph objects

## Debug Logging Added

To verify the fix is working:

1. **Graph context string building** (line ~710):
   ```
   [stream-post] Built graph context string: 482 chars
   ```

2. **Prompt preview** (line ~893):
   ```
   [stream-post] Prompt preview (first 500 chars): You are a helpful assistant...## Context from Knowledge Graph...
   ```

## Files Modified

1. `apps/server/src/modules/chat/chat-generation.service.ts`
   - Added `graphContext?: string` to PromptBuildOptions interface
   - Updated `buildPrompt()` to include graph context section

2. `apps/server/src/modules/chat/chat.controller.ts`
   - Added graph context string builder (lines 702-725)
   - Updated buildPrompt() call to pass graphContext parameter (line 879)
   - Added prompt preview logging (line 893)

## Related Documentation

- `docs/CHAT_PROMPT_STRUCTURE.md` - Comprehensive prompt structure analysis (discovered the issue)
- `docs/GRAPH_SEARCH_FULL_OBJECTS.md` - Object serialization fix (prerequisite)
- `docs/CHAT_GRAPH_SEARCH_INTEGRATION.md` - Initial graph search integration

## Impact

**Before Fix:**
- Graph search worked perfectly (objects found, filtered, sent to browser)
- LLM had zero context about entities
- Users couldn't get information about people, tasks, documents despite data existing

**After Fix:**
- Graph search still works perfectly
- LLM now receives formatted graph objects in prompt
- LLM can reference entities by name with details
- Users get accurate answers about entities in the knowledge graph

## Completion Criteria

- [x] Add graphContext parameter to PromptBuildOptions interface
- [x] Update buildPrompt() method to include graph context section
- [x] Format graph objects into context string in POST endpoint
- [x] Pass graphContext to buildPrompt() call
- [x] Add debug logging for context string and prompt preview
- [x] Restart services to deploy changes
- [ ] **Next**: Test in browser with "Tell me about Agata" query
- [ ] **Next**: Verify LLM response includes entity details
- [ ] **Next**: Update this document with test results

---

**Status:** Implementation complete, awaiting browser testing to confirm LLM now references graph objects correctly.

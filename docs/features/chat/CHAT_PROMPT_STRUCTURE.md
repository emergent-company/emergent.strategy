# Chat Prompt Structure - Complete Reference

## Overview

This document explains how prompts are constructed when a user sends a message to the chat system. There are **two different prompt structures** depending on which endpoint is used:

1. **POST /chat/stream** (Used by admin frontend) - Uses `buildPrompt()` with MCP tool context
2. **GET /chat/:id/stream** (Legacy endpoint) - Uses inline prompt with graph objects context

---

## POST /chat/stream Prompt (Current Frontend)

**Location**: `chat.controller.ts` line 854 + `chat-generation.service.ts` line 44

### Structure

```typescript
const prompt = this.gen.buildPrompt({
    message,           // User's question
    mcpToolContext,    // Optional: Result from MCP tool execution
    detectedIntent     // Auto-detected: 'schema-version' | 'schema-changes' | 'type-info' | 'entity-query' | 'entity-list' | 'general'
});
```

### Full Prompt Template

```markdown
You are a helpful assistant specialized in knowledge graphs and data schemas. IMPORTANT: Always respond using proper markdown formatting.

[INTENT-SPECIFIC INSTRUCTIONS - varies by detectedIntent]

## Context from Schema

[MCP_TOOL_CONTEXT - if available]
- Formatted JSON data from MCP tools (schema info, entity lists, etc.)

## User Question

[USER_MESSAGE]

## Your Response

Provide a helpful, accurate answer based on the context above. Use proper markdown formatting:
- Use ### for headings
- Use - or * for unordered lists (with space after)
- Use 1. 2. 3. for ordered lists
- Use **text** for bold
- Use `code` for inline code
- Use proper blank lines between sections

Your markdown formatted answer:
```

### Intent-Specific Instructions

**schema-version:**
```
When answering questions about schema versions, provide clear version information and explain what it means. Use markdown headings, bold text, and lists.
```

**schema-changes:**
```
When describing schema changes, organize them chronologically using markdown headings (###) and bullet points (-). Highlight important modifications with **bold text**.
```

**type-info:**
```
When explaining entity types, use markdown headings (###) for the type name, bullet lists (-) for properties and relationships.
```

**entity-list:**
```
When listing available entity types, use numbered lists (1., 2., 3.) and **bold** for type names.
```

**entity-query:**
```
When presenting entity query results, respond with a brief introduction and then format each entity as a structured object reference using this EXACT format:

```object-ref
{
  "id": "entity-uuid-here",
  "type": "EntityType",
  "name": "Display Name",
  "summary": "Brief one-line description or key detail"
}
```

Use one ```object-ref block per entity. The summary should be the most important detail from the entity properties (e.g., status, date, key attribute). Do NOT include full property lists - the user will click to see details.
```

**general (default):**
```
Answer questions clearly using markdown formatting: headings (# ## ###), lists (- or 1.), **bold**, `code`, etc.
```

### MCP Tool Context Examples

When MCP tools are executed, their results are formatted and added to the prompt:

**Schema Version Query:**
```
Current schema version: 1.2.0
Last updated: 2025-10-15T10:30:00Z
```

**Entity List Query:**
```
Available Entity Types (5 total):

• **Person**: 15 instances - Individuals mentioned in documents
• **Organization**: 8 instances - Companies and institutions
• **Location**: 12 instances - Geographic locations
• **ActionItem**: 23 instances - Tasks and action items
• **Document**: 45 instances - Files and documents
```

**Entity Query Results:**
```json
{
  "entities": [
    {
      "id": "c44ec019-71e5-4006-a21a-35ab157d9d4d",
      "key": "person-agata",
      "name": "Agata",
      "type": "Person",
      "properties": {
        "name": "Agata",
        "role": "Developer",
        "department": "Engineering"
      }
    }
  ]
}
```

### What's Missing from POST Prompt

**⚠️ IMPORTANT**: The POST endpoint does NOT currently include graph search results in the prompt!

The graph objects retrieved via `graphService.searchObjectsWithNeighbors()` are:
- ✅ Sent to browser in SSE meta frame (`graphObjects`, `graphNeighbors`)
- ❌ NOT included in the LLM prompt

This means the LLM cannot reference the graph objects in its response. Only MCP tool results are included.

---

## GET /chat/:id/stream Prompt (Legacy)

**Location**: `chat.controller.ts` lines 430-475

### Structure

This endpoint builds the prompt **inline** with graph objects context:

```typescript
// Build enhanced context from graph objects and neighbors
let contextParts: string[] = [];

// Add graph objects context
if (graphObjects.length > 0) {
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
    contextParts.push('');
}

// Add citations context if available
if (citations.length > 0) {
    contextParts.push('**Relevant Documents:**\n');
    for (const citation of citations) {
        contextParts.push(`- ${citation.text}`);
    }
    contextParts.push('');
}

const contextString = contextParts.length > 0 
    ? `\n\nContext:\n${contextParts.join('\n')}\n`
    : '';

const prompt = `You are a helpful assistant for querying knowledge graphs and schemas. Answer questions clearly and concisely based on the provided context.${contextString}\nQuestion: ${userQuestion}\nAnswer:`;
```

### Full GET Prompt Template

```markdown
You are a helpful assistant for querying knowledge graphs and schemas. Answer questions clearly and concisely based on the provided context.

Context:
**Relevant Knowledge Graph Objects:**

- [ActionItem] Discuss two-level component structure with Agata Mróz: Review and finalize the architecture
  Related objects:
    • [Person] Agata Mróz
    • [Document] Architecture Spec
    • [Meeting] Component Review Session

- [Person] Agata Mróz: Senior Developer in Engineering team
  Related objects:
    • [ActionItem] Discuss two-level component structure
    • [Organization] Engineering Department

**Relevant Documents:**

- [Document excerpt about component architecture...]
- [Document excerpt about team structure...]

Question: Tell me about Agata
Answer:
```

### Key Differences: GET vs POST

| Feature | GET /chat/:id/stream | POST /chat/stream |
|---------|---------------------|-------------------|
| **Graph Objects** | ✅ Included in prompt | ❌ NOT in prompt (only SSE) |
| **MCP Tools** | ❌ Not available | ✅ Included in prompt |
| **Citations** | ✅ Included in prompt | ❌ Disabled by default |
| **Intent Detection** | ❌ Not used | ✅ Auto-detected |
| **Markdown Instructions** | ❌ Not specified | ✅ Detailed formatting rules |
| **Neighbors** | ✅ Max 3 per object | ✅ Max 3 per object |

---

## Example: Full Prompt for "Tell me about Agata"

### POST Endpoint (Current)

```markdown
You are a helpful assistant specialized in knowledge graphs and data schemas. IMPORTANT: Always respond using proper markdown formatting. Answer questions clearly using markdown formatting: headings (# ## ###), lists (- or 1.), **bold**, `code`, etc.

## Context from Schema

{
  "entities": [
    {
      "id": "c44ec019-71e5-4006-a21a-35ab157d9d4d",
      "key": "person-agata",
      "name": "Agata",
      "type": "Person",
      "properties": {
        "name": "Agata",
        "role": "Developer",
        "full_name": "Agata Mróz",
        "department": "Engineering"
      }
    }
  ]
}

## User Question

Tell me about Agata

## Your Response

Provide a helpful, accurate answer based on the context above. Use proper markdown formatting:
- Use ### for headings
- Use - or * for unordered lists (with space after)
- Use 1. 2. 3. for ordered lists
- Use **text** for bold
- Use `code` for inline code
- Use proper blank lines between sections

Your markdown formatted answer:
```

### GET Endpoint (Legacy)

```markdown
You are a helpful assistant for querying knowledge graphs and schemas. Answer questions clearly and concisely based on the provided context.

Context:
**Relevant Knowledge Graph Objects:**

- [ActionItem] Discuss two-level component structure with Agata Mróz: Review and finalize the architecture for the new component hierarchy
  Related objects:
    • [Person] Agata Mróz
    • [Document] Component Architecture Spec
    • [Meeting] Architecture Review

- [Person] Agata Mróz: Senior Developer in Engineering department
  Related objects:
    • [ActionItem] Discuss two-level component structure with Agata Mróz
    • [Organization] Engineering

- [ActionItem] Implement real-time updates for meeting details upon document signing
  Related objects:
    • [Person] Agata Mróz
    • [Document] Meeting Protocol

Question: Tell me about Agata
Answer:
```

---

## Graph Search Integration

### Current Flow (POST /chat/stream)

```
1. User sends message: "Tell me about Agata"
2. Graph search executes: searchObjectsWithNeighbors(message)
3. Results filtered: filterGraphObjectMetadata() removes _extraction_* fields
4. Results sent to browser: SSE meta frame with graphObjects + graphNeighbors
5. Prompt built: buildPrompt(message, mcpToolContext, detectedIntent)
   - Graph objects NOT included in prompt
   - Only MCP tool results included
6. LLM generates response based on prompt
7. Response streamed to browser as tokens
```

### What the Browser Receives

**SSE Meta Frame:**
```json
{
  "type": "meta",
  "conversationId": "7de79f3a-4762-4e95-9637-949fdd7ff69a",
  "graphObjects": [
    {
      "id": "2a00a6ce-9064-4ed3-9a6e-955a85ef4472",
      "type": "ActionItem",
      "key": "actionitem-discuss-two-level-a1b2c3d4",
      "properties": {
        "name": "Discuss two-level component structure with Agata Mróz",
        "description": "Review and finalize the architecture",
        "status": "open",
        "priority": "high"
      },
      "labels": ["action-item"],
      "created_at": "2025-10-18T14:23:45.123Z",
      "version": 1
    }
  ],
  "graphNeighbors": {
    "2a00a6ce-9064-4ed3-9a6e-955a85ef4472": [
      {
        "id": "c44ec019-71e5-4006-a21a-35ab157d9d4d",
        "type": "Person",
        "key": "person-agata",
        "properties": {
          "name": "Agata",
          "role": "Developer"
        }
      }
    ]
  }
}
```

**Token Stream:**
```json
{"type":"token","token":"I"}
{"type":"token","token":" do"}
{"type":"token","token":" not"}
{"type":"token","token":" have"}
{"type":"token","token":" any"}
{"type":"token","token":" information"}
{"type":"token","token":" about"}
{"type":"token","token":" Agata"}
{"type":"done"}
```

### The Problem

The LLM responds "I do not have any information about Agata" because:
1. Graph objects ARE found (3 objects including 2 ActionItems about Agata)
2. Graph objects ARE sent to browser in meta frame
3. ❌ Graph objects are NOT included in the LLM prompt
4. LLM only sees user question, no context
5. LLM truthfully says it has no information

---

## Solution Options

### Option 1: Add Graph Objects to POST Prompt (Recommended)

Modify `chat.controller.ts` POST endpoint to include graph objects in prompt, similar to GET endpoint:

```typescript
// After graph search (line ~680)
const graphContext = await this.graphService.searchObjectsWithNeighbors(...);
graphObjects = graphContext.primaryResults.map(filterGraphObjectMetadata);
graphNeighbors = Object.fromEntries(...);

// Build context string from graph objects
let contextParts: string[] = [];
if (graphObjects.length > 0) {
    contextParts.push('**Relevant Knowledge Graph Objects:**\n');
    for (const obj of graphObjects) {
        const name = obj.properties?.name || obj.key || obj.id;
        const description = obj.properties?.description || '';
        contextParts.push(`- [${obj.type}] ${name}${description ? ': ' + description : ''}`);
        
        const neighbors = graphNeighbors[obj.id] || [];
        if (neighbors.length > 0) {
            contextParts.push(`  Related objects:`);
            for (const neighbor of neighbors.slice(0, 3)) {
                const neighborName = neighbor.properties?.name || neighbor.key || neighbor.id;
                contextParts.push(`    • [${neighbor.type}] ${neighborName}`);
            }
        }
    }
}

const graphContextString = contextParts.length > 0 
    ? contextParts.join('\n') 
    : undefined;

// Pass to buildPrompt
const prompt = this.gen.buildPrompt({
    message,
    mcpToolContext,
    detectedIntent,
    graphContext: graphContextString  // NEW PARAMETER
});
```

### Option 2: Enhance buildPrompt to Accept Graph Objects

Add new parameter to `PromptBuildOptions`:

```typescript
export interface PromptBuildOptions {
    message: string;
    mcpToolContext?: string;
    detectedIntent?: '...';
    graphContext?: string;  // NEW: Formatted graph objects context
}
```

Update `buildPrompt()` to include graph context after MCP context:

```typescript
buildPrompt(options: PromptBuildOptions): string {
    const { message, mcpToolContext, detectedIntent, graphContext } = options;
    
    let prompt = systemPrompt;
    
    // Add MCP tool context
    if (mcpToolContext) {
        prompt += '\n\n## Context from Schema\n\n' + mcpToolContext;
    }
    
    // Add graph objects context
    if (graphContext) {
        prompt += '\n\n## Relevant Knowledge Graph Objects\n\n' + graphContext;
    }
    
    // Add user question...
}
```

### Option 3: Use GET Endpoint for Graph-Rich Queries

Keep POST for MCP/schema queries, use GET for entity/graph queries. But this requires frontend changes and is less elegant.

---

## Recommendation

**Implement Option 1 + Option 2 combined:**

1. Add `graphContext` parameter to `PromptBuildOptions`
2. Update `buildPrompt()` to include graph objects section
3. Modify POST endpoint to format graph objects and pass to buildPrompt
4. Keep GET endpoint as-is for backward compatibility

This will ensure graph search results are actually used by the LLM instead of just being decorative SSE events.

---

## Current Status Summary

✅ **Working:**
- Graph search finds relevant objects (verified by logs)
- Objects filtered to remove metadata (verified by logs)
- Objects sent to browser in SSE meta frame (verified by logs)
- MCP tools execute and results included in prompt

❌ **Not Working:**
- Graph objects not included in LLM prompt (POST endpoint)
- LLM cannot reference graph objects in response
- Frontend receives graph objects but LLM says "no information"

🔧 **Fix Required:**
- Add graph objects to POST endpoint prompt
- Update buildPrompt() to accept and format graph context
- Test that LLM can now reference found entities

---

## Files to Modify

1. **`apps/server/src/modules/chat/chat-generation.service.ts`**
   - Line 14: Add `graphContext?: string` to `PromptBuildOptions`
   - Line 44: Update `buildPrompt()` to include graph context section

2. **`apps/server/src/modules/chat/chat.controller.ts`**
   - Line 647-680: Format graph objects into context string
   - Line 854: Pass `graphContext` to `buildPrompt()`

3. **Testing**
   - Ask "Tell me about Agata" in browser
   - Verify logs show full graph objects found
   - Verify LLM response references Agata with details
   - Verify both graph objects AND MCP tools work together

# MCP Chat - Decision Object Queries

## Overview

Queries about **Decision objects** will trigger the MCP `type_info` tool, which provides information about entity types in the schema.

## ✅ Queries That Will Trigger MCP for Decisions

### Pattern 1: "Tell me about the Decision type"
```
Query: "Tell me about the Decision type"
Query: "What is the Decision entity?"
Query: "Show me the Decision type"
Query: "Explain the Decision type"
```

**Why it works**: 
- Matches pattern: "the [TypeName] type/entity"
- Triggers: `type_info` tool
- Confidence: **0.9** (high)
- Tool args: `{ type_name: "Decision" }`

### Pattern 2: "Decision type" or "Decision entity"
```
Query: "Decision type"
Query: "Decision entity"
Query: "What's the Decision type?"
```

**Why it works**:
- Matches pattern: "[TypeName] type/entity"
- Triggers: `type_info` tool
- Confidence: **0.9** (high)
- Tool args: `{ type_name: "Decision" }`

### Pattern 3: General type queries (will list all types including Decision)
```
Query: "What types are in the schema?"
Query: "List all entity types"
Query: "Show me all available types"
Query: "What object types exist?"
```

**Why it works**:
- Matches keywords: "types", "entity types", "object types"
- Triggers: `type_info` tool
- Confidence: **0.9** (high)
- Tool args: `{}` (no specific type, returns all)

## ❌ Queries That Will NOT Trigger MCP

### Too Generic (Missing Context)
```
Query: "List of last 5 decisions"        ❌ No "type" or "schema" keywords
Query: "Show me recent decisions"        ❌ No "type" or "schema" keywords
Query: "What decisions do we have?"      ❌ No "type" or "schema" keywords
```

**Why it doesn't work**: 
- The detector requires **"type"**, **"entity"**, or **"schema"** keywords
- Generic queries about data instances (not metadata) won't trigger MCP
- These would be normal chat queries (no MCP badge)

### Solution: Add Context Keywords
```
Query: "Tell me about the Decision type"                      ✅ Triggers MCP
Query: "What properties does the Decision entity have?"       ✅ Triggers MCP
Query: "What are the Decision entity types in the schema?"    ✅ Triggers MCP
```

## 🔍 How to Verify MCP is Being Used

### 1. Watch for Blue Badge
When MCP is triggered, you'll see a **blue badge** appear above your message:

```
"Querying type info..." 🔵
```

The badge appears for ~100-200ms, then disappears when the tool completes.

### 2. Check SSE Stream (Network Tab)

Open Chrome DevTools → Network tab → Look for `/chat/stream` request → Preview tab

**Expected SSE events when MCP is used**:
```
data: {"type":"meta","conversationId":"..."}
data: {"type":"mcp_tool","tool":"type_info","status":"started"}           ← MCP STARTED
data: {"type":"mcp_tool","tool":"type_info","status":"completed","result":{...}}  ← MCP COMPLETED
data: {"type":"token","token":"The"}
data: {"type":"token","token":" Decision"}
... (more tokens)
data: {"type":"done"}
```

**If NO MCP used** (regular chat):
```
data: {"type":"meta","conversationId":"..."}
data: {"type":"token","token":"To"}        ← Tokens start immediately (no mcp_tool events)
data: {"type":"token","token":" create"}
... (more tokens)
data: {"type":"done"}
```

### 3. Check Server Logs (Optional)

Enable debug logging:
```bash
# Add to .env
E2E_DEBUG_CHAT=1

# Restart
npm run workspace:restart

# Watch logs
npm run workspace:logs -- --follow | grep -E "(MCP|type_info|Detecting)"
```

Expected logs when MCP triggers:
```
[McpToolDetectorService] Detecting MCP intent for message: "Tell me about the Decision type..."
[McpToolDetectorService] Detected intent: type-info (confidence: 0.9, tool: type_info)
[ChatController] MCP tool detected: type_info with args: {"type_name":"Decision"}
```

## 📝 Recommended Test Queries (In Order)

### Test 1: Specific Decision Type Info
```
Query: "Tell me about the Decision type"

Expected:
✅ Blue badge: "Querying type info..."
✅ SSE: mcp_tool event with tool="type_info"
✅ Response: Properties, relationships, and details of Decision entity
```

### Test 2: General Types List
```
Query: "What entity types are available in the schema?"

Expected:
✅ Blue badge: "Querying type info..."
✅ SSE: mcp_tool event with tool="type_info"  
✅ Response: List of all types including Decision, Project, Document, etc.
```

### Test 3: Decision Type with Different Wording
```
Query: "What is the Decision entity?"
Query: "Explain the Decision object type"
Query: "Show me Decision type information"

Expected:
✅ All should trigger MCP type_info tool
✅ All should show blue badge
```

### Test 4: Control Test (No MCP)
```
Query: "How do I create a decision?"

Expected:
❌ NO blue badge (regular chat)
❌ NO mcp_tool events in SSE stream
✅ Normal LLM response about creating decisions
```

## 🎯 Complete Test Flow

1. **Open Chat**: http://localhost:5175/admin/apps/chat/c/new

2. **Test MCP Detection**: 
   ```
   Type: "Tell me about the Decision type"
   Watch: Blue badge should appear
   Observe: SSE stream shows mcp_tool events
   ```

3. **Test Control (No MCP)**:
   ```
   Type: "How do I create a decision?"
   Watch: NO badge appears
   Observe: Direct token streaming (no mcp_tool events)
   ```

4. **Test General Types**:
   ```
   Type: "What types exist in the schema?"
   Watch: Blue badge appears
   Observe: Response lists multiple types including Decision
   ```

## 🛠️ Troubleshooting

### Badge Doesn't Appear
**Problem**: Query doesn't trigger MCP

**Solution**: Add explicit keywords:
- ❌ "List decisions" → ✅ "Tell me about the Decision type"
- ❌ "Recent decisions" → ✅ "What is the Decision entity?"

### Badge Appears But No Response
**Problem**: MCP tool executing but LLM not responding

**Check**:
1. Vertex AI authentication: `gcloud auth application-default print-access-token`
2. Server logs: `npm run workspace:logs -- --follow`
3. SSE stream for errors

### Want MCP for Data Queries (Not Just Metadata)
**Current Limitation**: MCP tools are for **schema metadata** only:
- ✅ "What properties does Decision have?" (metadata)
- ❌ "List my decisions" (data query)

**Why**: The current MCP tools (`schema_version`, `schema_changelog`, `type_info`) only provide schema information, not data queries.

**Future Enhancement**: Would need new MCP tools like `query_entities` to support data queries.

## 📚 Keywords That Trigger MCP

### Type-Info Intent Keywords (Current)
```typescript
// Exact matches (confidence 0.9)
- "object types"
- "available types"
- "list types"
- "show types"
- "type information"
- "type details"
- "schema types"
- "entity types"
- "data types"
- "[TypeName] type"        // e.g., "Decision type"
- "[TypeName] entity"      // e.g., "Decision entity"

// With context required (confidence 0.8)
- "entities" (must also have "schema", "entity", or "object")
```

### Other MCP Intents
```typescript
// Schema Version
- "schema version"
- "current schema"
- "schema info"

// Schema Changes
- "schema changes"
- "schema changelog"
- "recent changes"
- "what changed"
```

## 🔮 Future: Adding Decision Data Queries

If you want MCP to handle queries like **"list of last 5 decisions"**, you'd need to:

1. **Add new MCP tool**: `query_entities` in MCP server
2. **Update detector**: Add pattern for data queries:
   ```typescript
   {
     intent: 'entity-query',
     tool: 'query_entities',
     keywords: [
       'list decisions',
       'show decisions',
       'recent decisions',
       'last N decisions'
     ],
     confidence: 0.9
   }
   ```
3. **Implement tool**: Query database for entity instances
4. **Update prompts**: Format results for LLM

Currently, MCP is **metadata-focused**, not data-focused.

## Summary

### ✅ Use These Queries for MCP with Decisions:
```
1. "Tell me about the Decision type"
2. "What is the Decision entity?"
3. "Show me the Decision type information"
4. "What properties does Decision have?"
5. "What entity types are in the schema?" (lists all including Decision)
```

### 🔵 MCP Detection Signs:
1. **Blue badge** appears (100-200ms)
2. **SSE stream** shows `mcp_tool` events
3. **Server logs** show "Detected intent: type-info"

### ❌ These Won't Trigger MCP (Yet):
```
1. "List of last 5 decisions"
2. "Show me recent decisions"
3. "What decisions do we have?"
```
(Would need new MCP tool for data queries)

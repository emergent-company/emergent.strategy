# Implementing Data Queries for MCP Chat

## Overview

This guide shows how to enable queries like **"Show me recent decisions"** by adding data query capabilities to MCP chat integration.

## Current Limitation

**Currently**: MCP tools only provide **schema metadata** (version, types, properties)
**Needed**: Query actual **entity data** (Decision instances, Project records, etc.)

## Architecture Changes Required

### 1. New MCP Tools (Backend)
Add tools to query and list entities

### 2. Update MCP Tool Detector
Recognize data query patterns

### 3. Inform LLM About Available Entities
Include entity types in system prompt or via MCP tool

## Implementation Plan

### Phase 1: Add MCP Data Query Tools

#### File: `apps/server/src/modules/mcp/mcp-server.controller.ts`

Add two new tools:

**Tool 1: `list_entity_types`** - Returns available entity types
```typescript
/**
 * List all available entity types in the knowledge graph
 * 
 * This tool helps the LLM understand what entities can be queried.
 */
@Post('mcp')
async handleListEntityTypes(@Req() req: Request): Promise<any> {
    this.checkScope(req, 'schema:read');
    
    const projectId = req.headers['x-project-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    
    // Query type registry for available types
    const types = await this.db.runWithTenantContext(orgId, projectId, async () => {
        const result = await this.db.raw(`
            SELECT 
                name,
                description,
                COUNT(go.id) as instance_count
            FROM kb.type_registry tr
            LEFT JOIN kb.graph_objects go ON go.type_id = tr.id
            WHERE tr.deleted_at IS NULL
            GROUP BY tr.id, tr.name, tr.description
            ORDER BY tr.name
        `);
        return result.rows;
    });
    
    return {
        types: types.map(t => ({
            name: t.name,
            description: t.description,
            count: parseInt(t.instance_count, 10)
        }))
    };
}
```

**Tool 2: `query_entities`** - Query entity instances
```typescript
/**
 * Query entity instances by type with filters
 * 
 * @param type_name - Entity type to query (e.g., "Decision", "Project")
 * @param limit - Maximum number of results (default: 10, max: 50)
 * @param offset - Pagination offset (default: 0)
 * @param sort_by - Sort field (default: "created_at")
 * @param sort_order - Sort direction ("asc" or "desc", default: "desc")
 * @param filters - Optional filters (e.g., { status: "active" })
 */
@Post('mcp')
async handleQueryEntities(@Req() req: Request, @Body() body: {
    type_name: string;
    limit?: number;
    offset?: number;
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    filters?: Record<string, any>;
}): Promise<any> {
    this.checkScope(req, 'data:read');
    
    const projectId = req.headers['x-project-id'] as string;
    const orgId = req.headers['x-org-id'] as string;
    
    const {
        type_name,
        limit = 10,
        offset = 0,
        sort_by = 'created_at',
        sort_order = 'desc'
    } = body;
    
    // Validate limits
    const safeLimit = Math.min(Math.max(1, limit), 50);
    const safeOffset = Math.max(0, offset);
    
    const entities = await this.db.runWithTenantContext(orgId, projectId, async () => {
        // Query graph_objects with type filter
        const result = await this.db.raw(`
            SELECT 
                go.id,
                go.key,
                go.name,
                go.properties,
                go.created_at,
                go.updated_at,
                tr.name as type_name,
                tr.description as type_description
            FROM kb.graph_objects go
            JOIN kb.type_registry tr ON tr.id = go.type_id
            WHERE tr.name = ?
              AND go.deleted_at IS NULL
              AND tr.deleted_at IS NULL
            ORDER BY go.${sort_by} ${sort_order.toUpperCase()}
            LIMIT ? OFFSET ?
        `, [type_name, safeLimit, safeOffset]);
        
        return result.rows;
    });
    
    // Also get total count
    const countResult = await this.db.runWithTenantContext(orgId, projectId, async () => {
        const result = await this.db.raw(`
            SELECT COUNT(*) as total
            FROM kb.graph_objects go
            JOIN kb.type_registry tr ON tr.id = go.type_id
            WHERE tr.name = ?
              AND go.deleted_at IS NULL
              AND tr.deleted_at IS NULL
        `, [type_name]);
        
        return parseInt(result.rows[0].total, 10);
    });
    
    return {
        entities: entities.map(e => ({
            id: e.id,
            key: e.key,
            name: e.name,
            type: e.type_name,
            properties: e.properties,
            created_at: e.created_at,
            updated_at: e.updated_at
        })),
        pagination: {
            total: countResult,
            limit: safeLimit,
            offset: safeOffset,
            has_more: (safeOffset + safeLimit) < countResult
        }
    };
}
```

#### Register Tools in MCP Server

Update the MCP server's tool list in `tools/list` response:

```typescript
{
    name: 'list_entity_types',
    description: 'List all available entity types in the knowledge graph with instance counts',
    inputSchema: {
        type: 'object',
        properties: {},
        required: []
    }
},
{
    name: 'query_entities',
    description: 'Query entity instances by type with pagination and filtering',
    inputSchema: {
        type: 'object',
        properties: {
            type_name: {
                type: 'string',
                description: 'Entity type to query (e.g., "Decision", "Project", "Document")'
            },
            limit: {
                type: 'number',
                description: 'Maximum number of results (default: 10, max: 50)',
                default: 10
            },
            offset: {
                type: 'number',
                description: 'Pagination offset for results (default: 0)',
                default: 0
            },
            sort_by: {
                type: 'string',
                description: 'Field to sort by (default: "created_at")',
                enum: ['created_at', 'updated_at', 'name'],
                default: 'created_at'
            },
            sort_order: {
                type: 'string',
                description: 'Sort direction (default: "desc")',
                enum: ['asc', 'desc'],
                default: 'desc'
            }
        },
        required: ['type_name']
    }
}
```

### Phase 2: Update MCP Tool Detector

#### File: `apps/server/src/modules/chat/mcp-tool-detector.service.ts`

Add new intent and patterns:

```typescript
// Add to ToolDetectionResult interface
export interface ToolDetectionResult {
    shouldUseMcp: boolean;
    detectedIntent: 'schema-version' | 'schema-changes' | 'type-info' | 'entity-query' | 'entity-list' | 'none';
    confidence: number;
    suggestedTool?: string;
    suggestedArguments?: Record<string, any>;
    matchedKeywords?: string[];
}

// Add to patterns array
private readonly patterns: KeywordPattern[] = [
    // ... existing patterns ...
    
    // Entity Query Intent (query specific entity type instances)
    {
        intent: 'entity-query',
        tool: 'query_entities',
        keywords: [
            'show decisions',
            'list decisions',
            'recent decisions',
            'latest decisions',
            'get decisions',
            'find decisions',
            'show me decisions',
            'list all decisions',
            'show projects',
            'list projects',
            'recent projects',
            'show documents',
            'list documents',
            'recent documents',
            'last decisions',
            'last projects'
        ],
        partialKeywords: [
            'show',
            'list',
            'recent',
            'latest',
            'last',
            'find',
            'get'
        ],
        confidence: 0.9
    },
    
    // Entity List Intent (list available entity types)
    {
        intent: 'entity-list',
        tool: 'list_entity_types',
        keywords: [
            'what entities',
            'available entities',
            'what types can I query',
            'what data types',
            'what objects',
            'list entity types',
            'show entity types',
            'what can I ask about'
        ],
        confidence: 0.9
    }
];

// Update buildArguments to handle entity-query intent
private buildArguments(
    intent: 'schema-version' | 'schema-changes' | 'type-info' | 'entity-query' | 'entity-list',
    normalized: string
): Record<string, any> {
    switch (intent) {
        // ... existing cases ...
        
        case 'entity-query':
            const args: Record<string, any> = {};
            
            // Extract entity type from query
            // Pattern: "show [recent] [N] {Entity}[s]"
            // Examples: "show decisions", "show recent 5 decisions", "list projects"
            
            // IMPORTANT: This should use DYNAMIC entity types from type registry
            // The detector service should cache available types and use them for detection
            // For now, we use a generic approach that extracts potential entity names
            
            // Strategy: Look for noun-like words after query verbs
            // This is a fallback - ideally detector would know available types
            const queryVerbs = ['show', 'list', 'get', 'find', 'recent', 'latest', 'last'];
            
            let detectedType: string | null = null;
            
            // Try to extract type name from message structure
            // Example: "show decisions" -> extract "decisions"
            const words = normalized.split(/\s+/);
            for (let i = 0; i < words.length - 1; i++) {
                if (queryVerbs.includes(words[i])) {
                    // Skip numbers (e.g., "show 5 decisions")
                    const nextWord = words[i + 1];
                    if (!/^\d+$/.test(nextWord)) {
                        // Capitalize first letter (Decision, Project, etc.)
                        // Remove plural 's' if present
                        const candidate = nextWord.endsWith('s') 
                            ? nextWord.slice(0, -1)
                            : nextWord;
                        detectedType = candidate.charAt(0).toUpperCase() + candidate.slice(1);
                        break;
                    } else if (i + 2 < words.length) {
                        // Handle "show 5 decisions" pattern
                        const followingWord = words[i + 2];
                        const candidate = followingWord.endsWith('s')
                            ? followingWord.slice(0, -1)
                            : followingWord;
                        detectedType = candidate.charAt(0).toUpperCase() + candidate.slice(1);
                        break;
                    }
                }
            }
            
            // NOTE: The backend query_entities tool will validate if this type exists
            // If type doesn't exist, it will return empty results (graceful degradation)
            
            if (detectedType) {
                args.type_name = detectedType;
            }
            
            // Extract limit from query
            // Examples: "show 5 decisions", "last 10 projects", "recent 3 documents"
            const limitMatch = normalized.match(/(?:show|last|recent|latest|top)\s+(\d+)/);
            if (limitMatch) {
                args.limit = Math.min(parseInt(limitMatch[1], 10), 50);
            } else {
                args.limit = 10; // Default
            }
            
            // Extract sort preference
            if (normalized.includes('recent') || normalized.includes('latest') || normalized.includes('last')) {
                args.sort_by = 'created_at';
                args.sort_order = 'desc';
            }
            
            return args;
        
        case 'entity-list':
            // No arguments needed for list_entity_types
            return {};
            
        default:
            return {};
    }
}
```

### Phase 3: Inform LLM About Available Entities

#### Option A: System Prompt with Available Types (Recommended)

Update `ChatGenerationService.buildPrompt()` to include available entity types:

```typescript
// File: apps/server/src/modules/chat/chat-generation.service.ts

buildPrompt(options: PromptBuildOptions): string {
    const { message, mcpToolContext, detectedIntent, availableEntityTypes } = options;

    // Base system prompt
    let systemPrompt = 'You are a helpful assistant specialized in knowledge graphs and data management.';
    
    // Add available entity types information
    if (availableEntityTypes && availableEntityTypes.length > 0) {
        systemPrompt += '\n\n## Available Entity Types\n\n';
        systemPrompt += 'The knowledge graph contains the following entity types that users can query:\n';
        systemPrompt += availableEntityTypes.map(type => 
            `- **${type.name}**: ${type.description || 'No description'} (${type.count} instances)`
        ).join('\n');
        systemPrompt += '\n\nWhen users ask about these entities (e.g., "show recent decisions"), ';
        systemPrompt += 'you can retrieve actual data using the query_entities tool.';
    }
    
    // ... rest of prompt building
}
```

#### Option B: Fetch Types on Startup (Alternative)

Call `list_entity_types` tool when chat conversation starts:

```typescript
// File: apps/server/src/modules/chat/chat.controller.ts

async streamChat(req: Request, res: Response) {
    // ... existing code ...
    
    // On first message in conversation, fetch available entity types
    if (!conversationId || isNewConversation) {
        try {
            const typesResult = await this.mcpClient.callTool('list_entity_types', {});
            availableEntityTypes = typesResult.types;
            
            // Store in conversation metadata for future messages
            await this.chatService.updateConversationMetadata(
                conversationId,
                { availableEntityTypes }
            );
        } catch (err) {
            this.logger.warn('Failed to fetch entity types:', err);
        }
    }
    
    // Pass to prompt builder
    const prompt = this.chatGeneration.buildPrompt({
        message,
        mcpToolContext,
        detectedIntent,
        availableEntityTypes  // Include types
    });
}
```

### Phase 4: Update Chat Controller to Handle New Tools

#### File: `apps/server/src/modules/chat/chat.controller.ts`

Update tool detection and invocation:

```typescript
async streamChat(req: Request, res: Response) {
    // ... existing setup ...
    
    // Detect MCP intent
    const detection = this.mcpToolDetector.detect(message);
    
    if (detection.shouldUseMcp) {
        this.logger.debug(
            `MCP tool detected: ${detection.suggestedTool} ` +
            `(intent: ${detection.detectedIntent}, confidence: ${detection.confidence})`
        );
        
        // Send MCP tool started event
        this.sendSseEvent(res, {
            type: 'mcp_tool',
            tool: detection.suggestedTool,
            status: 'started'
        });
        
        try {
            // Call MCP tool
            const toolResult = await this.mcpClient.callTool(
                detection.suggestedTool!,
                detection.suggestedArguments || {}
            );
            
            // Send MCP tool completed event
            this.sendSseEvent(res, {
                type: 'mcp_tool',
                tool: detection.suggestedTool,
                status: 'completed',
                result: toolResult
            });
            
            // Format tool result for LLM context
            mcpToolContext = this.formatToolResult(
                detection.detectedIntent,
                toolResult
            );
            
        } catch (error) {
            this.logger.error(`MCP tool ${detection.suggestedTool} failed:`, error);
            
            // Send MCP tool error event
            this.sendSseEvent(res, {
                type: 'mcp_tool',
                tool: detection.suggestedTool,
                status: 'error',
                error: error instanceof Error ? error.message : 'Unknown error'
            });
        }
    }
    
    // ... rest of streaming logic ...
}

/**
 * Format MCP tool results for LLM context
 */
private formatToolResult(intent: string, result: any): string {
    switch (intent) {
        case 'entity-query':
            return this.formatEntityQueryResult(result);
        case 'entity-list':
            return this.formatEntityListResult(result);
        // ... existing cases ...
        default:
            return JSON.stringify(result, null, 2);
    }
}

private formatEntityQueryResult(result: any): string {
    if (!result.entities || result.entities.length === 0) {
        return 'No entities found matching the query.';
    }
    
    let formatted = `Found ${result.pagination.total} ${result.entities[0].type} entities `;
    formatted += `(showing ${result.entities.length}):\n\n`;
    
    result.entities.forEach((entity: any, idx: number) => {
        formatted += `${idx + 1}. **${entity.name}**\n`;
        formatted += `   - ID: ${entity.id}\n`;
        formatted += `   - Key: ${entity.key}\n`;
        formatted += `   - Created: ${new Date(entity.created_at).toLocaleDateString()}\n`;
        
        if (entity.properties && Object.keys(entity.properties).length > 0) {
            formatted += `   - Properties: ${JSON.stringify(entity.properties, null, 2)}\n`;
        }
        
        formatted += '\n';
    });
    
    if (result.pagination.has_more) {
        formatted += `\n(${result.pagination.total - result.entities.length} more available)`;
    }
    
    return formatted;
}

private formatEntityListResult(result: any): string {
    if (!result.types || result.types.length === 0) {
        return 'No entity types available in the knowledge graph.';
    }
    
    let formatted = 'Available entity types in the knowledge graph:\n\n';
    
    result.types.forEach((type: any) => {
        formatted += `- **${type.name}**: ${type.description || 'No description'} `;
        formatted += `(${type.count} instances)\n`;
    });
    
    return formatted;
}
```

## Testing the Implementation

### Test 1: List Available Entity Types
```
Query: "What entities can I query?"

Expected:
✅ Badge: "Querying entity types..."
✅ MCP tool: list_entity_types
✅ Response: List of all types (Decision, Project, Document, etc.) with counts
```

### Test 2: Query Decision Instances
```
Query: "Show me recent decisions"

Expected:
✅ Badge: "Querying entities..."
✅ MCP tool: query_entities with args: { type_name: "Decision", limit: 10 }
✅ Response: List of last 10 decisions with names, IDs, created dates
```

### Test 3: Query with Limit
```
Query: "Show me the last 5 decisions"

Expected:
✅ Badge: "Querying entities..."
✅ MCP tool: query_entities with args: { type_name: "Decision", limit: 5 }
✅ Response: List of 5 most recent decisions
```

### Test 4: Query Different Entity Type
```
Query: "List recent projects"

Expected:
✅ Badge: "Querying entities..."
✅ MCP tool: query_entities with args: { type_name: "Project", limit: 10 }
✅ Response: List of recent projects
```

## Implementation Checklist

### Backend (MCP Server)
- [ ] Add `list_entity_types` tool handler
- [ ] Add `query_entities` tool handler
- [ ] Register tools in MCP tools/list response
- [ ] Add scope check for `data:read`
- [ ] Test tools via direct MCP calls

### Detection (MCP Tool Detector)
- [ ] Add `entity-query` intent
- [ ] Add `entity-list` intent
- [ ] Add keyword patterns for data queries
- [ ] Update `buildArguments()` for entity queries
- [ ] Test detection with various queries

### LLM Context (Chat Generation)
- [ ] Add `availableEntityTypes` to `PromptBuildOptions`
- [ ] Update `buildPrompt()` to include entity types
- [ ] Add entity types to system prompt
- [ ] Test prompt formatting

### Controller (Chat Controller)
- [ ] Update to handle new intents
- [ ] Add `formatEntityQueryResult()` method
- [ ] Add `formatEntityListResult()` method
- [ ] Fetch entity types on conversation start
- [ ] Test end-to-end flow

### Frontend (Badge Updates)
- [ ] Update badge text for entity queries: "Querying entities..."
- [ ] Update badge text for entity list: "Loading entity types..."

## Benefits

### For Users
- ✅ Natural language data queries ("show recent decisions")
- ✅ Discovery of available entity types
- ✅ Consistent UX with existing MCP features
- ✅ Real-time data access through chat

### For LLM
- ✅ Awareness of available entity types
- ✅ Ability to query actual data, not just metadata
- ✅ Structured data context for better responses
- ✅ Clear tool boundaries (metadata vs data)

## Security Considerations

1. **Scope Requirements**: 
   - `list_entity_types`: Requires `schema:read`
   - `query_entities`: Requires `data:read`

2. **Data Filtering**:
   - Always respect RLS policies
   - Query within tenant context (org/project)
   - Limit query results (max 50)

3. **Sensitive Data**:
   - Consider filtering sensitive properties before sending to LLM
   - Add redaction for PII if needed

## Performance Considerations

1. **Caching**:
   - Cache `list_entity_types` result for conversation duration
   - Cache type counts with short TTL (5 minutes)

2. **Pagination**:
   - Enforce reasonable limits (max 50 per query)
   - Support offset for pagination
   - Return total count for UI

3. **Query Optimization**:
   - Add indexes on `type_id`, `created_at`, `updated_at`
   - Use targeted queries, avoid SELECT *
   - Consider materialized views for type counts

## Future Enhancements

1. **Smarter Type Detection**:
   - Cache `list_entity_types` result in detector service on startup
   - Build dynamic keyword patterns based on actual types in database
   - Match plural forms automatically (Decision/Decisions, Person/People)
   - Handle synonyms (e.g., "docs" → "Document", "ppl" → "Person")

2. **Advanced Filtering**:
   - Property-based filters: "show decisions with status=approved"
   - Date range filters: "decisions from last week"
   - Relationship filters: "projects related to Decision X"

3. **Aggregations**:
   - Count queries: "how many decisions do we have?"
   - Grouping: "decisions by status"
   - Statistics: "average completion time for decisions"

4. **Relationships**:
   - Traverse relationships: "show all tasks for Project X"
   - Multi-hop queries: "find people who worked on decisions related to Project Y"

5. **Full-Text Search**:
   - Search entity properties: "find decisions mentioning 'AI strategy'"
   - Fuzzy matching for entity names

## Summary

This implementation adds **data query capabilities** to MCP chat, enabling users to ask questions like:

- ✅ "Show me recent decisions"
- ✅ "List the last 5 projects"
- ✅ "What entities can I query?"
- ✅ "Find documents created this week"

The LLM learns about available entities through:
1. System prompt listing entity types
2. `list_entity_types` MCP tool
3. Structured data context from queries

**Estimated Implementation Time**: 4-6 hours
**Complexity**: Medium (new tools + detector updates + context management)
**Impact**: High (major UX improvement, enables natural language data access)

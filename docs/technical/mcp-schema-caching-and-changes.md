# MCP Schema Caching and Change Detection

**Created**: 2025-10-20  
**Status**: Design Document

## Problem Statement

When an AI agent connects to an MCP server, it typically:
1. Discovers available tools via `tools/list` 
2. Caches tool definitions for performance
3. Uses cached tools for subsequent requests

**Question**: What happens when the schema changes (new object types, modified properties, new relationships)? How does the agent know to refresh its cache?

---

## How MCP Handles Schema Changes

### 1. MCP Protocol Standard Approach

According to the [MCP specification](https://modelcontextprotocol.io/docs), the protocol includes:

#### **Server Capabilities Notification**
```json
// Server can send notifications to clients
{
  "jsonrpc": "2.0",
  "method": "notifications/tools/list_changed",
  "params": {}
}
```

When this notification is sent:
- Client should invalidate its tool cache
- Client should re-fetch tools via `tools/list`
- Client should re-fetch any relevant resources

#### **Resource Change Notifications**
```json
{
  "jsonrpc": "2.0",
  "method": "notifications/resources/updated",
  "params": {
    "uri": "schema://project-mgmt-pack-v1"
  }
}
```

#### **Tool Versioning**
Tools can include version metadata:
```typescript
{
  name: "getPersons",
  version: "1.2.0",
  description: "..."
}
```

### 2. Common Caching Strategies

#### Strategy A: **No Caching** (Simplest)
```
Agent Request → MCP Server
  ↓
Fresh tool definitions every time
  ↓
Always up-to-date
```

**Pros**: Always fresh, no cache invalidation needed  
**Cons**: Slower, more network overhead  
**When to use**: Development, low-traffic scenarios

#### Strategy B: **Time-Based Expiration** (TTL)
```typescript
// Agent side
interface CachedTools {
  tools: Tool[];
  cachedAt: Date;
  ttl: number; // seconds
}

function getTools(): Tool[] {
  const cached = cache.get('mcp-tools');
  
  if (!cached || Date.now() - cached.cachedAt > cached.ttl * 1000) {
    // Cache expired, fetch fresh
    const fresh = await mcpServer.listTools();
    cache.set('mcp-tools', {
      tools: fresh,
      cachedAt: new Date(),
      ttl: 300 // 5 minutes
    });
    return fresh;
  }
  
  return cached.tools;
}
```

**Pros**: Simple to implement, reduces load  
**Cons**: May serve stale data within TTL window  
**When to use**: Schemas change infrequently (hours/days)

#### Strategy C: **Event-Driven Invalidation** (Recommended)
```typescript
// Server side - send notification when schema changes
class McpServer {
  async updateSchema(newSchema: Schema) {
    await this.schemaService.save(newSchema);
    
    // Notify all connected clients
    this.notifyClients({
      method: "notifications/tools/list_changed",
      params: {}
    });
  }
}

// Agent side - listen for notifications
mcpClient.on('notifications/tools/list_changed', async () => {
  console.log('Tools changed, invalidating cache');
  cache.delete('mcp-tools');
  
  // Optionally pre-fetch new tools
  await this.refreshTools();
});
```

**Pros**: Instant updates, efficient, no stale data  
**Cons**: Requires persistent connection, more complex  
**When to use**: Production systems, frequent schema changes

#### Strategy D: **Version-Based Caching** (Hybrid)
```typescript
// Server includes schema version in responses
interface ToolResponse {
  tools: Tool[];
  schema_version: string; // "1.2.3"
  schema_hash: string;    // "abc123def456"
}

// Agent checks version before using cache
async function getTools(): Tool[] {
  const serverVersion = await mcpServer.getSchemaVersion();
  const cached = cache.get('mcp-tools');
  
  if (cached && cached.schema_version === serverVersion) {
    return cached.tools;
  }
  
  // Version mismatch or no cache, fetch fresh
  const response = await mcpServer.listTools();
  cache.set('mcp-tools', response);
  return response.tools;
}
```

**Pros**: Efficient, accurate, works with stateless connections  
**Cons**: Extra version check call  
**When to use**: Mix of long and short connections

---

## Implementation for Our MCP Server

### Recommended: **Hybrid Approach (C + D)**

Combine event-driven notifications with version checks for robustness.

### 1. Add Schema Versioning

#### Database Schema
```sql
-- Track schema versions
CREATE TABLE kb.template_pack_versions (
  pack_id TEXT NOT NULL,
  version TEXT NOT NULL,
  schema_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (pack_id, version)
);

-- Track current active version
CREATE TABLE kb.template_pack_current (
  pack_id TEXT PRIMARY KEY,
  current_version TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Service Method
```typescript
// apps/server/src/modules/template-packs/template-pack.service.ts

@Injectable()
export class TemplatePackService {
  async getSchemaVersion(): Promise<string> {
    // Return hash of all current schema versions
    const packs = await this.listTemplatePacks();
    const versions = packs.map(p => `${p.id}:${p.version}`).sort();
    const hash = crypto.createHash('sha256')
      .update(versions.join(','))
      .digest('hex');
    return hash.substring(0, 16); // e.g., "a1b2c3d4e5f6g7h8"
  }
  
  async updateTemplatePack(packId: string, schema: TemplatePackSchema) {
    await this.db.transaction(async (trx) => {
      // Save new version
      await trx('kb.template_packs').update({
        schema: schema,
        version: schema.version,
        updated_at: new Date(),
      }).where({ id: packId });
      
      // Record version history
      await trx('kb.template_pack_versions').insert({
        pack_id: packId,
        version: schema.version,
        schema_hash: this.hashSchema(schema),
      });
      
      // Update current version pointer
      await trx('kb.template_pack_current').upsert({
        pack_id: packId,
        current_version: schema.version,
        updated_at: new Date(),
      });
    });
    
    // Notify connected clients (if using WebSocket/SSE)
    await this.notifySchemaChanged(packId);
  }
  
  private hashSchema(schema: TemplatePackSchema): string {
    const normalized = JSON.stringify(schema, Object.keys(schema).sort());
    return crypto.createHash('sha256').update(normalized).digest('hex');
  }
}
```

### 2. Add Schema Version Endpoints

```typescript
// apps/server/src/modules/mcp/mcp.controller.ts

@Controller('mcp')
@ApiTags('MCP')
export class McpController {
  constructor(
    private readonly templatePackService: TemplatePackService,
  ) {}
  
  @Get('schema/version')
  @ApiOperation({ summary: 'Get current schema version hash' })
  async getSchemaVersion(): Promise<{ version: string; updated_at: string }> {
    const version = await this.templatePackService.getSchemaVersion();
    const updatedAt = await this.templatePackService.getSchemaLastUpdated();
    
    return {
      version,
      updated_at: updatedAt.toISOString(),
    };
  }
  
  @Get('schema/changelog')
  @ApiOperation({ summary: 'Get schema change history' })
  async getSchemaChangelog(
    @Query('since') since?: string,
    @Query('limit') limit: number = 10,
  ): Promise<SchemaChange[]> {
    return this.templatePackService.getSchemaChangelog(since, limit);
  }
}
```

### 3. Add Version to Tool Responses

```typescript
// apps/server/src/modules/mcp/tools/schema.tool.ts

@Injectable()
export class SchemaTool {
  @McpTool({
    name: 'schema.getTemplatePacks',
    description: 'Returns a list of all available template packs',
  })
  async getTemplatePacks(): Promise<ToolResult<TemplatePackSummary[]>> {
    const packs = await this.templatePackService.listTemplatePacks();
    const schemaVersion = await this.templatePackService.getSchemaVersion();
    
    return {
      success: true,
      data: packs.map(p => ({
        id: p.id,
        name: p.name,
        version: p.version,
        description: p.description,
      })),
      metadata: {
        schema_version: schemaVersion, // Add version to response
        cached_until: Date.now() + 300000, // 5 min TTL hint
      },
    };
  }
}
```

### 4. Implement Change Notifications (Optional WebSocket)

```typescript
// apps/server/src/modules/mcp/mcp.gateway.ts

@WebSocketGateway({
  namespace: '/mcp',
  cors: { origin: '*' },
})
export class McpGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;
  
  constructor(
    private readonly templatePackService: TemplatePackService,
  ) {
    // Listen for schema changes
    this.templatePackService.on('schema:changed', (event) => {
      this.notifySchemaChanged(event);
    });
  }
  
  handleConnection(client: Socket) {
    console.log(`MCP client connected: ${client.id}`);
  }
  
  private notifySchemaChanged(event: SchemaChangeEvent) {
    // Notify all connected clients
    this.server.emit('schema:changed', {
      type: 'schema_updated',
      pack_id: event.packId,
      old_version: event.oldVersion,
      new_version: event.newVersion,
      timestamp: new Date().toISOString(),
    });
  }
}
```

### 5. AI Agent Client Implementation

```typescript
// AI Agent side (example implementation)

class McpClient {
  private toolsCache: Map<string, CachedTools> = new Map();
  private schemaVersion: string | null = null;
  
  constructor(private serverUrl: string) {
    // Optional: Connect to WebSocket for live updates
    this.connectWebSocket();
  }
  
  private connectWebSocket() {
    const ws = new WebSocket(`${this.serverUrl}/mcp`);
    
    ws.on('schema:changed', (event) => {
      console.log('Schema changed:', event);
      this.invalidateCache();
    });
  }
  
  async getTools(packId: string): Promise<Tool[]> {
    // Strategy 1: Check version first
    const serverVersion = await this.getSchemaVersion();
    
    if (this.schemaVersion === serverVersion) {
      const cached = this.toolsCache.get(packId);
      if (cached && Date.now() - cached.timestamp < 300000) { // 5 min TTL
        console.log('Using cached tools');
        return cached.tools;
      }
    }
    
    // Version changed or cache expired, fetch fresh
    console.log('Fetching fresh tools');
    const tools = await this.fetchTools(packId);
    
    this.toolsCache.set(packId, {
      tools,
      timestamp: Date.now(),
    });
    this.schemaVersion = serverVersion;
    
    return tools;
  }
  
  private async getSchemaVersion(): Promise<string> {
    const response = await fetch(`${this.serverUrl}/mcp/schema/version`);
    const data = await response.json();
    return data.version;
  }
  
  private invalidateCache() {
    console.log('Cache invalidated due to schema change');
    this.toolsCache.clear();
    this.schemaVersion = null;
  }
}
```

---

## Best Practices

### 1. Cache Headers (HTTP-based MCP)
```typescript
@Get('tools/list')
async listTools(@Res() res: Response) {
  const tools = await this.getTools();
  const schemaVersion = await this.getSchemaVersion();
  
  res.set({
    'Cache-Control': 'private, max-age=300', // 5 min
    'ETag': schemaVersion, // Use schema version as ETag
    'Last-Modified': await this.getSchemaLastModified(),
  });
  
  return res.json(tools);
}

// Client can use If-None-Match header
async getTools() {
  const response = await fetch('/tools/list', {
    headers: {
      'If-None-Match': this.cachedETag,
    },
  });
  
  if (response.status === 304) {
    // Not modified, use cache
    return this.cachedTools;
  }
  
  // Updated, cache new tools
  const tools = await response.json();
  this.cachedETag = response.headers.get('ETag');
  this.cachedTools = tools;
  return tools;
}
```

### 2. Schema Migration Tracking
```typescript
// Track what changed between versions
interface SchemaChange {
  type: 'added' | 'modified' | 'removed';
  object: 'object_type' | 'relationship_type' | 'property';
  path: string; // e.g., "Person.properties.email"
  old_value?: any;
  new_value?: any;
}

// Example changelog
[
  {
    type: 'added',
    object: 'object_type',
    path: 'Project',
    new_value: { name: 'Project', properties: {...} }
  },
  {
    type: 'modified',
    object: 'property',
    path: 'Person.properties.email',
    old_value: { type: 'string' },
    new_value: { type: 'string', required: true }
  },
  {
    type: 'removed',
    object: 'relationship_type',
    path: 'old_relationship',
    old_value: {...}
  }
]
```

### 3. Graceful Schema Evolution
```typescript
// Support multiple schema versions simultaneously
@McpTool({
  name: 'getPersons',
  version: '2.0.0', // Current version
  deprecated_versions: ['1.0.0', '1.1.0'],
})
async getPersons(
  params: PersonFilters,
  @Context() context: { schema_version?: string }
) {
  if (context.schema_version === '1.0.0') {
    // Handle old schema
    return this.getPersonsV1(params);
  }
  
  // Handle current schema
  return this.getPersonsV2(params);
}
```

---

## Recommendations for Our System

### Phase 1: Basic Versioning (Week 1)
```typescript
✅ Add schema version hash endpoint
✅ Include version in tool responses
✅ Document expected cache behavior
```

### Phase 2: Change Detection (Week 2)
```typescript
✅ Add schema changelog endpoint
✅ Track schema changes in database
✅ Add Cache-Control and ETag headers
```

### Phase 3: Real-Time Notifications (Week 3, Optional)
```typescript
✅ Implement WebSocket gateway
✅ Send schema:changed events
✅ Update AI Agent Service to listen for changes
```

### Phase 4: Advanced Features (Future)
```typescript
✅ Schema migration tracking
✅ Multiple version support
✅ Automatic cache warming
✅ Schema diff visualization
```

---

## Configuration Options

### Environment Variables
```env
# Schema caching behavior
MCP_SCHEMA_CACHE_TTL=300          # 5 minutes
MCP_SCHEMA_ENABLE_NOTIFICATIONS=true
MCP_SCHEMA_VERSION_CHECK_INTERVAL=60  # Check every 60 seconds

# Client-side hints
MCP_SCHEMA_SUGGEST_CACHE_DURATION=300  # Suggest 5 min cache to clients
```

### Client Configuration
```typescript
// AI Agent config
{
  mcp: {
    serverUrl: 'http://localhost:3001',
    cache: {
      enabled: true,
      ttl: 300, // seconds
      strategy: 'version-check', // or 'event-driven' or 'ttl-only'
    },
    notifications: {
      enabled: true,
      reconnect: true,
    }
  }
}
```

---

## Testing Strategy

### Test Scenarios

#### 1. Schema Version Changes
```typescript
describe('Schema Version Caching', () => {
  it('should invalidate cache when schema version changes', async () => {
    // Get tools with version 1
    const tools1 = await agent.getTools();
    expect(agent.cacheSize).toBe(1);
    
    // Update schema on server
    await server.updateSchema({ version: '2.0.0', ... });
    
    // Get tools again - should detect version change
    const tools2 = await agent.getTools();
    expect(tools2).not.toEqual(tools1);
  });
});
```

#### 2. WebSocket Notifications
```typescript
describe('Real-Time Schema Updates', () => {
  it('should receive notification when schema changes', async (done) => {
    agent.on('schema:changed', (event) => {
      expect(event.new_version).toBe('2.0.0');
      done();
    });
    
    // Trigger schema update
    await server.updateSchema({ version: '2.0.0', ... });
  });
});
```

#### 3. Cache Expiration
```typescript
describe('TTL-based Caching', () => {
  it('should expire cache after TTL', async () => {
    const tools1 = await agent.getTools();
    
    // Wait for TTL to expire
    await sleep(6000); // 6 seconds (TTL = 5 sec)
    
    // Should fetch fresh
    const tools2 = await agent.getTools();
    expect(agent.fetchCount).toBe(2);
  });
});
```

---

## Summary

### How Agents Know About Schema Changes

1. **Version Checks** (Recommended)
   - Server includes schema version in responses
   - Agent checks version before using cache
   - Efficient and reliable

2. **Event Notifications** (Optional, Advanced)
   - Server sends WebSocket events on changes
   - Agent invalidates cache immediately
   - Best for real-time requirements

3. **TTL Expiration** (Fallback)
   - Cache expires after fixed duration
   - Simple but may serve stale data
   - Good safety net

### Implementation Priority

**Must Have**:
- Schema version endpoint
- Version in tool responses
- TTL-based cache expiration

**Should Have**:
- ETag support
- Schema changelog endpoint
- Cache-Control headers

**Nice to Have**:
- WebSocket notifications
- Schema diff tracking
- Multi-version support

---

## Related Standards

- [HTTP Caching RFC 7234](https://tools.ietf.org/html/rfc7234)
- [ETag RFC 7232](https://tools.ietf.org/html/rfc7232)
- [Model Context Protocol Spec](https://modelcontextprotocol.io/docs)
- [JSON-RPC 2.0 Notifications](https://www.jsonrpc.org/specification#notification)

---

## Next Steps

1. ✅ Review this design with team
2. ✅ Decide on caching strategy (recommend: Version Check + TTL)
3. ✅ Implement schema versioning in TemplatePackService
4. ✅ Add version endpoints to MCP controller
5. ✅ Update tool responses to include version
6. ✅ Document client-side caching behavior
7. ✅ (Optional) Implement WebSocket notifications

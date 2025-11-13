# MCP Chat Integration - Revised Architecture (JSON-RPC 2.0)

**Date**: October 20, 2025  
**Status**: Design Approved - Implementation Starting  
**Previous Version**: MCP_CHAT_INTEGRATION_DESIGN.md (REST-based, now superseded)

## Executive Summary

After validating against the official MCP specification, we've revised the architecture to use **proper MCP protocol (JSON-RPC 2.0)** instead of REST endpoints.

**Phase 1 (Now)**: Our chat consumes **our own MCP server** (schema tools)  
**Phase 2 (Future)**: Our chat can also consume **external MCP servers** (filesystem, databases, APIs)

This approach gives immediate value while building towards a flexible MCP host architecture.

---

## Key Architectural Changes

### ❌ Previous (Incorrect) Design:
- Phase 4 endpoints as REST APIs (GET /mcp/schema/version)
- Direct HTTP calls from chat to internal endpoints
- No MCP protocol compliance

### ✅ New (Correct) Design:
- **MCP Server**: Phase 4 endpoints converted to JSON-RPC 2.0 MCP server
- **MCP Client**: New service to consume MCP servers (ours + future external)
- **Chat Integration**: Chat uses MCP Client to invoke tools
- **Protocol Compliant**: Lifecycle management, capability negotiation, tools/list, tools/call

---

## MCP Protocol Overview

### JSON-RPC 2.0 Message Format

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": {
    "name": "schema_version",
    "arguments": {}
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"version\": \"1.2.3\", \"timestamp\": \"2025-10-20T10:00:00Z\"}"
      }
    ]
  }
}
```

### Lifecycle Management

1. **Initialize**: Client sends `initialize` request with capabilities
2. **Negotiation**: Server responds with its capabilities
3. **Ready**: Client sends `notifications/initialized`
4. **Operation**: Client can now call `tools/list`, `tools/call`

---

## Architecture Components

### 1. MCP Server (JSON-RPC 2.0)

**File**: `apps/server/src/modules/mcp/mcp-server.controller.ts`

**Endpoints**:
- `POST /mcp/rpc` - Single JSON-RPC 2.0 endpoint for all methods

**Supported Methods**:
- `initialize` - Lifecycle management, capability negotiation
- `tools/list` - Discover available tools
- `tools/call` - Execute tools (schema_version, schema_changelog, type_info)

**Example Initialize Request:**
```typescript
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "sampling": {}
    },
    "clientInfo": {
      "name": "nexus-chat",
      "version": "1.0.0"
    }
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-06-18",
    "capabilities": {
      "tools": {
        "listChanged": false
      }
    },
    "serverInfo": {
      "name": "nexus-mcp-server",
      "version": "1.0.0"
    }
  }
}
```

**Example tools/list:**
```typescript
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "tools/list"
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "tools": [
      {
        "name": "schema_version",
        "description": "Get the current schema version and metadata",
        "inputSchema": {
          "type": "object",
          "properties": {},
          "required": []
        }
      },
      {
        "name": "schema_changelog",
        "description": "Get schema changes since a specific version or date",
        "inputSchema": {
          "type": "object",
          "properties": {
            "since": {
              "type": "string",
              "description": "Version number or ISO date (e.g., '1.2.0' or '2025-10-15')"
            },
            "limit": {
              "type": "number",
              "description": "Maximum number of changes to return (default: 10)"
            }
          },
          "required": []
        }
      },
      {
        "name": "type_info",
        "description": "Get information about available object types in the schema",
        "inputSchema": {
          "type": "object",
          "properties": {
            "type_name": {
              "type": "string",
              "description": "Specific type name to get details for (optional)"
            }
          },
          "required": []
        }
      }
    ]
  }
}
```

**Example tools/call:**
```typescript
// Client → Server
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "tools/call",
  "params": {
    "name": "schema_version",
    "arguments": {}
  }
}

// Server → Client
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"version\": \"1.2.3\", \"timestamp\": \"2025-10-20T10:00:00Z\", \"total_types\": 42, \"total_relationships\": 156}"
      }
    ]
  }
}
```

**Authorization**:
- Read `Authorization` header from HTTP request
- Validate token using existing AuthGuard
- Check `schema:read` scope for schema tools
- Return 401/403 JSON-RPC errors if unauthorized

---

### 2. MCP Client Service

**File**: `apps/server/src/modules/chat/mcp-client.service.ts`

**Purpose**: Connect to MCP servers (ours + future external) and invoke tools

**Interface**:
```typescript
interface McpClientConfig {
  serverUrl: string;          // e.g., 'http://localhost:3001/mcp/rpc'
  authToken?: string;         // User's auth token
  clientInfo: {
    name: string;
    version: string;
  };
}

interface McpTool {
  name: string;
  description: string;
  inputSchema: Record<string, any>;
}

interface McpToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    uri?: string;
  }>;
}

@Injectable()
export class McpClientService {
  private requestIdCounter = 0;
  private initialized = false;
  private serverCapabilities: any = null;

  /**
   * Initialize connection to MCP server
   * Performs capability negotiation
   */
  async initialize(config: McpClientConfig): Promise<void>;

  /**
   * List available tools from MCP server
   */
  async listTools(): Promise<McpTool[]>;

  /**
   * Execute a tool on the MCP server
   */
  async callTool(
    toolName: string,
    arguments: Record<string, any>
  ): Promise<McpToolResult>;

  /**
   * Send JSON-RPC 2.0 request
   */
  private async sendRequest(
    method: string,
    params?: any
  ): Promise<any>;

  /**
   * Generate next request ID
   */
  private nextRequestId(): number;
}
```

**Implementation Details**:
```typescript
async initialize(config: McpClientConfig): Promise<void> {
  this.config = config;
  
  // Send initialize request
  const response = await this.sendRequest('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {
      sampling: {}  // We support sampling/complete
    },
    clientInfo: config.clientInfo
  });
  
  this.serverCapabilities = response.capabilities;
  this.initialized = true;
  
  // Send initialized notification (no response expected)
  await this.sendNotification('notifications/initialized');
}

async listTools(): Promise<McpTool[]> {
  if (!this.initialized) {
    throw new Error('MCP client not initialized');
  }
  
  const response = await this.sendRequest('tools/list');
  return response.tools;
}

async callTool(
  toolName: string,
  arguments: Record<string, any>
): Promise<McpToolResult> {
  if (!this.initialized) {
    throw new Error('MCP client not initialized');
  }
  
  const response = await this.sendRequest('tools/call', {
    name: toolName,
    arguments: arguments || {}
  });
  
  return response;
}

private async sendRequest(method: string, params?: any): Promise<any> {
  const request = {
    jsonrpc: '2.0',
    id: this.nextRequestId(),
    method,
    params
  };
  
  const response = await fetch(this.config.serverUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(this.config.authToken && {
        'Authorization': `Bearer ${this.config.authToken}`
      })
    },
    body: JSON.stringify(request)
  });
  
  const json = await response.json();
  
  if (json.error) {
    throw new McpError(json.error.code, json.error.message, json.error.data);
  }
  
  return json.result;
}
```

---

### 3. MCP Tool Detector (Unchanged)

**File**: `apps/server/src/modules/chat/mcp-tool-detector.service.ts`

Keyword-based detection to identify when user queries need MCP tools:

```typescript
interface ToolDetectionResult {
  shouldUseMcp: boolean;
  detectedIntent: 'schema-version' | 'schema-changes' | 'type-info' | 'none';
  confidence: number;
  suggestedTool?: string;
  suggestedArguments?: Record<string, any>;
}

@Injectable()
export class McpToolDetectorService {
  private readonly schemaKeywords = [
    'schema', 'structure', 'types', 'objects', 'relationships',
    'what types', 'show types', 'list types', 'available types',
    'recent changes', 'changelog', 'updates', 'what changed',
    'version', 'schema version'
  ];

  detect(userMessage: string): ToolDetectionResult {
    const lowerMessage = userMessage.toLowerCase();
    
    // Schema version detection
    if (this.containsKeywords(lowerMessage, ['version', 'schema'])) {
      return {
        shouldUseMcp: true,
        detectedIntent: 'schema-version',
        confidence: 0.9,
        suggestedTool: 'schema_version',
        suggestedArguments: {}
      };
    }
    
    // Changelog detection
    if (this.containsKeywords(lowerMessage, ['change', 'recent', 'update'])) {
      return {
        shouldUseMcp: true,
        detectedIntent: 'schema-changes',
        confidence: 0.85,
        suggestedTool: 'schema_changelog',
        suggestedArguments: { limit: 10 }
      };
    }
    
    // Type info detection
    if (this.containsKeywords(lowerMessage, ['type', 'object', 'list'])) {
      return {
        shouldUseMcp: true,
        detectedIntent: 'type-info',
        confidence: 0.8,
        suggestedTool: 'type_info',
        suggestedArguments: {}
      };
    }
    
    return {
      shouldUseMcp: false,
      detectedIntent: 'none',
      confidence: 0
    };
  }
  
  private containsKeywords(text: string, keywords: string[]): boolean {
    return keywords.some(kw => text.includes(kw));
  }
}
```

---

### 4. Chat Controller Integration

**File**: `apps/server/src/modules/chat/chat.controller.ts`

**Changes to streamPost()**:

```typescript
@Post('stream')
@Scopes('chat:use')
async streamPost(
  @Body() body: { conversationId?: string; message: string },
  @Req() req: Request,
  @Res() res: Response
) {
  // ... existing setup ...
  
  // NEW: Detect MCP intent
  const detection = await this.mcpToolDetector.detect(body.message);
  
  let mcpToolResult: any = null;
  
  if (detection.shouldUseMcp && detection.suggestedTool) {
    try {
      // Emit: Tool started
      res.write(`data: ${JSON.stringify({
        type: 'mcp_tool',
        tool: detection.suggestedTool,
        status: 'started',
        intent: detection.detectedIntent
      })}\n\n`);
      
      // Initialize MCP client (for our server)
      const mcpClient = new McpClientService();
      await mcpClient.initialize({
        serverUrl: 'http://localhost:3001/mcp/rpc',
        authToken: req.headers['authorization']?.replace('Bearer ', ''),
        clientInfo: {
          name: 'nexus-chat',
          version: '1.0.0'
        }
      });
      
      // Call tool
      mcpToolResult = await mcpClient.callTool(
        detection.suggestedTool,
        detection.suggestedArguments || {}
      );
      
      // Emit: Tool completed
      res.write(`data: ${JSON.stringify({
        type: 'mcp_tool',
        tool: detection.suggestedTool,
        status: 'completed',
        result: mcpToolResult.content
      })}\n\n`);
      
    } catch (error) {
      // Emit: Tool error
      res.write(`data: ${JSON.stringify({
        type: 'mcp_tool',
        tool: detection.suggestedTool,
        status: 'error',
        error: error.message
      })}\n\n`);
    }
  }
  
  // Assemble enhanced prompt with MCP context
  let prompt = body.message;
  if (mcpToolResult) {
    const toolContext = mcpToolResult.content
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('\n');
    
    prompt = `Context from knowledge base:\n${toolContext}\n\nUser question: ${body.message}\n\nAnswer:`;
  }
  
  // Call generation service with enhanced prompt
  await this.generation.generateStreaming(
    prompt,
    (token) => res.write(`data: ${JSON.stringify({ type: 'token', token })}\n\n`),
    convId
  );
  
  // ... rest of existing code ...
}
```

---

## SSE Event Flow

### New Event Type: `mcp_tool`

**Tool Started:**
```json
{
  "type": "mcp_tool",
  "tool": "schema_version",
  "status": "started",
  "intent": "schema-version"
}
```

**Tool Completed:**
```json
{
  "type": "mcp_tool",
  "tool": "schema_version",
  "status": "completed",
  "result": [
    {
      "type": "text",
      "text": "{\"version\": \"1.2.3\", ...}"
    }
  ]
}
```

**Tool Error:**
```json
{
  "type": "mcp_tool",
  "tool": "schema_version",
  "status": "error",
  "error": "Missing scope: schema:read"
}
```

---

## Implementation Timeline

### Week 1: MCP Server + Client Foundation (12 hours)

**Task 5**: Convert Phase 4 to MCP Server (4 hours)
- Implement JSON-RPC 2.0 controller
- Methods: initialize, tools/list, tools/call
- Authorization integration

**Task 6**: Implement MCP Client (3 hours)
- Connection lifecycle management
- JSON-RPC 2.0 protocol handling
- Tool listing and execution

**Task 7**: MCP Tool Detector (2 hours)
- Keyword-based intent detection
- Confidence scoring

**Task 8**: Chat Integration (3 hours)
- Use MCP client in ChatController
- SSE events for tool progress
- Enhanced prompt assembly

### Week 2: Generation + UI (6 hours)

**Task 9**: Enhanced Generation Service (2 hours)
- generateWithTools() method
- Schema context injection

**Task 11**: Admin UI Updates (4 hours)
- Handle mcp_tool events
- Display tool status
- Render structured responses

### Week 3: Testing + Documentation (6 hours)

**Task 10**: E2E Tests (3 hours)
- MCP server tests
- Chat integration tests
- Authorization tests

**Task 12**: User Testing + Docs (3 hours)
- Manual testing
- Documentation updates
- Demo creation

**Total**: 24 hours (3 weeks at 8 hours/week)

---

## Future: External MCP Servers (Phase 2)

Once Phase 1 is complete, adding external MCP servers is straightforward:

1. **MCP Server Registry**: User configures which external servers to connect to
2. **Multi-Server Support**: MCP Client supports multiple server connections
3. **Tool Routing**: Tool detector routes to appropriate server
4. **Unified Interface**: Chat sees all tools from all servers

Example external servers:
- Filesystem: Read/write local files
- Database: Query production databases
- Notion: Access Notion workspaces
- ClickUp: Query ClickUp tasks
- GitHub: Access repositories
- Google Calendar: Check appointments

---

## Benefits of This Architecture

✅ **Standards Compliant**: Proper MCP protocol implementation  
✅ **Future-Proof**: Easy to add external MCP servers  
✅ **Testable**: MCP server can be tested independently  
✅ **Extensible**: Can add Resources and Prompts later  
✅ **Secure**: Authorization passed through to MCP server  
✅ **Maintainable**: Clear separation of concerns

---

## Error Handling

### MCP Server Errors

JSON-RPC 2.0 error format:
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32001,
    "message": "Missing required scope: schema:read",
    "data": {
      "required_scope": "schema:read",
      "user_scopes": ["chat:use"]
    }
  }
}
```

**Error Codes**:
- `-32600`: Invalid Request
- `-32601`: Method not found
- `-32602`: Invalid params
- `-32001`: Authorization error (custom)
- `-32002`: Resource not found (custom)
- `-32003`: Rate limit exceeded (custom)

### Chat Integration Error Handling

1. **No Scope**: Emit error event, continue with regular chat
2. **Server Down**: Emit error event, use cached schema if available
3. **Invalid Params**: Emit error event, ask user for clarification
4. **Timeout**: Emit error event after 30s, continue without MCP

---

## Testing Strategy

### Unit Tests

**MCP Server Controller**:
- Test initialize request/response
- Test tools/list returns all tools
- Test tools/call executes correctly
- Test authorization enforcement

**MCP Client Service**:
- Test connection lifecycle
- Test JSON-RPC 2.0 protocol
- Test error handling
- Test request/response mapping

**MCP Tool Detector**:
- Test keyword detection accuracy
- Test confidence scoring
- Test edge cases (ambiguous queries)

### E2E Tests

**Scenario 1**: User asks "What's the schema version?"
```typescript
it('should detect schema version query and invoke MCP tool', async () => {
  const response = await request(app.getHttpServer())
    .post('/chat/stream')
    .set('Authorization', `Bearer ${userToken}`)
    .send({ message: "What's the schema version?" });
  
  // Verify SSE events
  expect(response.events).toContainEqual({
    type: 'mcp_tool',
    tool: 'schema_version',
    status: 'started'
  });
  
  expect(response.events).toContainEqual({
    type: 'mcp_tool',
    tool: 'schema_version',
    status: 'completed',
    result: expect.arrayContaining([
      expect.objectContaining({ type: 'text' })
    ])
  });
});
```

**Scenario 2**: User without schema:read scope
```typescript
it('should handle missing scope gracefully', async () => {
  const response = await request(app.getHttpServer())
    .post('/chat/stream')
    .set('Authorization', `Bearer ${tokenWithoutSchemaScope}`)
    .send({ message: "Show recent schema changes" });
  
  expect(response.events).toContainEqual({
    type: 'mcp_tool',
    tool: 'schema_changelog',
    status: 'error',
    error: expect.stringContaining('schema:read')
  });
  
  // Should still get regular chat response
  expect(response.events).toContainEqual({
    type: 'token',
    token: expect.any(String)
  });
});
```

---

## Migration from Previous Design

**No Breaking Changes**:
- Chat API remains the same (POST /chat/stream)
- SSE event structure extended (new mcp_tool type)
- Existing chat functionality unchanged
- Phase 4 endpoints converted but externally transparent

**Rollback Plan**:
- Feature flag: `CHAT_ENABLE_MCP_TOOLS=0` to disable
- MCP server can run alongside old REST endpoints
- Zero-downtime migration possible

---

## Success Metrics

**Week 1 Completion**:
- [ ] MCP server passes protocol compliance tests
- [ ] MCP client connects and calls tools successfully
- [ ] Chat integration shows tool events in SSE stream

**Week 2 Completion**:
- [ ] UI displays tool invocation status
- [ ] Structured schema responses render correctly
- [ ] Error states handled gracefully

**Week 3 Completion**:
- [ ] All E2E tests passing
- [ ] Documentation complete
- [ ] Demo video created
- [ ] Ready for production deployment

---

## Next Steps

1. ✅ Design validated against official MCP spec
2. ✅ User approved architecture (Phase 1 → Phase 2)
3. 🔄 **NOW**: Implement Task 5 (Convert Phase 4 to MCP Server)
4. ⏳ Implement Task 6-12

**Ready to start implementation!** 🚀

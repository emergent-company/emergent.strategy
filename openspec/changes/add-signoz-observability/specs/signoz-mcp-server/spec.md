# Capability: SigNoz MCP Server

## ADDED Requirements

### Requirement: MCP Server Standalone Application
A standalone Node.js application MUST be created in tools/signoz-mcp-server/ that exposes MCP tools via stdio transport for VS Code integration.

#### Scenario: MCP server starts and registers tools
```bash
# Given: MCP server installed
cd tools/signoz-mcp-server && npm install

# When: Server started via stdio
node dist/index.js

# Then: Server announces available tools
# Output includes: query_logs, get_traces, query_metrics, get_service_map, get_errors
```

#### Scenario: VS Code discovers MCP server
```json
// Given: .vscode/mcp.json configured
{
  "mcpServers": {
    "signoz": {
      "type": "stdio",
      "command": "node",
      "args": ["tools/signoz-mcp-server/dist/index.js"],
      "env": {
        "SIGNOZ_API_ENDPOINT": "http://localhost:3301",
        "SIGNOZ_API_TOKEN": "your-api-token"
      }
    }
  }
}

// When: VS Code loads MCP servers
// Then: AI agent has access to signoz tools
```

### Requirement: query_logs Tool
The MCP server MUST expose a query_logs tool that searches application logs with filters for service, level, text query, time range, and limit.

#### Scenario: Search logs by service and level
```typescript
// When: AI agent calls query_logs
const result = await mcpClient.callTool('query_logs', {
  service: 'spec-server',
  level: 'error',
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
  limit: 50,
});

// Then: Returns matching error logs
expect(result.logs).toBeArray();
expect(result.logs[0]).toMatchObject({
  timestamp: expect.any(String),
  level: 'error',
  body: expect.any(String),
  attributes: { 'service.name': 'spec-server' },
});
```

#### Scenario: Full-text search across logs
```typescript
// When: AI agent searches for specific text
const result = await mcpClient.callTool('query_logs', {
  service: 'spec-server',
  query: 'Database connection failed',
  limit: 10,
});

// Then: Returns logs containing text
expect(result.logs.every(log => log.body.includes('Database connection'))).toBe(true);
```

### Requirement: get_traces Tool
The MCP server MUST expose a get_traces tool that retrieves distributed traces with filters for trace ID, service, operation, duration range, time range, and limit.

#### Scenario: Get specific trace by ID
```typescript
// When: AI agent requests trace by ID
const result = await mcpClient.callTool('get_traces', {
  traceId: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6',
});

// Then: Returns trace with all spans
expect(result.traces).toHaveLength(1);
expect(result.traces[0].traceId).toBe('a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6');
expect(result.traces[0].spans).toBeArray();
```

#### Scenario: Find slow traces
```typescript
// When: AI agent searches for slow operations
const result = await mcpClient.callTool('get_traces', {
  service: 'spec-server',
  operation: 'extraction.processJob',
  minDuration: 30000, // 30 seconds
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
  limit: 20,
});

// Then: Returns traces exceeding duration threshold
expect(result.traces.every(trace => trace.duration >= 30000)).toBe(true);
```

### Requirement: query_metrics Tool
The MCP server MUST expose a query_metrics tool that queries custom metrics with filters for metric name, aggregation, group-by dimensions, time range, and interval.

#### Scenario: Get LLM call count
```typescript
// When: AI agent queries metric
const result = await mcpClient.callTool('query_metrics', {
  metricName: 'llm_calls_total',
  aggregation: 'sum',
  groupBy: ['provider', 'model'],
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
});

// Then: Returns aggregated metric data
expect(result.series).toBeArray();
expect(result.series[0]).toMatchObject({
  labels: { provider: 'vertexai', model: 'gemini-1.5-pro' },
  value: expect.any(Number),
});
```

#### Scenario: Get extraction duration percentiles
```typescript
// When: AI agent queries histogram metric
const result = await mcpClient.callTool('query_metrics', {
  metricName: 'extraction_jobs_duration',
  aggregation: 'avg',
  groupBy: ['source_type'],
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
  interval: '1h', // 1-hour buckets
});

// Then: Returns time series data
expect(result.timeSeries).toBeArray();
expect(result.timeSeries[0].dataPoints).toBeArray();
```

### Requirement: get_service_map Tool
The MCP server MUST expose a get_service_map tool that retrieves the service dependency graph showing relationships between services and external systems.

#### Scenario: Get service map
```typescript
// When: AI agent requests service map
const result = await mcpClient.callTool('get_service_map', {
  service: 'spec-server',
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
});

// Then: Returns service nodes and edges
expect(result.nodes).toBeArray();
expect(result.edges).toBeArray();
expect(result.nodes.find(n => n.name === 'spec-server')).toBeDefined();
expect(result.nodes.find(n => n.name === 'postgresql')).toBeDefined();
```

### Requirement: get_errors Tool
The MCP server MUST expose a get_errors tool that retrieves error traces and exceptions with filters for service, error type, time range, and limit.

#### Scenario: Get recent errors
```typescript
// When: AI agent requests recent errors
const result = await mcpClient.callTool('get_errors', {
  service: 'spec-server',
  timeRange: { start: '2025-01-10T00:00:00Z', end: '2025-01-10T23:59:59Z' },
  limit: 100,
});

// Then: Returns error traces
expect(result.errors).toBeArray();
expect(result.errors[0]).toMatchObject({
  traceId: expect.any(String),
  errorType: expect.any(String),
  errorMessage: expect.any(String),
  stackTrace: expect.any(String),
});
```

#### Scenario: Get errors by type
```typescript
// When: AI agent filters by error type
const result = await mcpClient.callTool('get_errors', {
  service: 'spec-server',
  errorType: 'DatabaseConnectionError',
  limit: 50,
});

// Then: Returns matching errors
expect(result.errors.every(e => e.errorType === 'DatabaseConnectionError')).toBe(true);
```

### Requirement: SigNoz API Client
The MCP server MUST include a SigNoz API client that authenticates with bearer token and makes HTTP requests to SigNoz Query API (:3301/api/v1).

#### Scenario: API client authenticates
```typescript
// Given: SigNoz API token configured
const client = new SigNozClient('http://localhost:3301', 'your-api-token');

// When: Client makes request
const logs = await client.queryLogs({ service: 'spec-server' });

// Then: Request includes Authorization header
expect(mockAxios.lastRequest.headers['Authorization']).toBe('Bearer your-api-token');
```

#### Scenario: API client handles errors
```typescript
// Given: SigNoz API returns 500 error
mockAxios.post.mockRejectedValue({ response: { status: 500, data: { error: 'Internal error' } } });

// When: Client makes request
const result = await client.queryLogs({ service: 'spec-server' });

// Then: Returns error message
expect(result.error).toBe('SigNoz API error: Internal error');
```

## Context

Langfuse is used for LLM observability in this project. The existing `langfuse-docs` MCP server provides documentation search but not trace browsing. AI assistants need programmatic access to traces for debugging extraction jobs, analyzing token usage, and verifying LLM behavior.

## Goals / Non-Goals

### Goals

- Enable AI assistants to list and inspect Langfuse traces
- Provide filtering for efficient trace discovery (by name, time, tags)
- Return structured data suitable for AI analysis (JSON format)
- Use existing Langfuse credentials (no new secrets management)

### Non-Goals

- Writing/mutating traces (read-only)
- Real-time streaming of traces
- Full Langfuse feature parity (focus on core browsing)
- Web UI replacement

## Decisions

### Decision: Use stdio-based MCP server (TypeScript)

**Rationale**: Aligns with existing workspace CLI tooling, uses familiar TypeScript stack, and stdio transport is well-supported by both OpenCode and VS Code MCP clients.

**Alternatives considered**:

- HTTP-based MCP: Would require running a persistent server, more complex setup
- Python MCP: Would introduce new language dependency

### Decision: Direct Langfuse API calls (not SDK)

**Rationale**: The Langfuse Node SDK (`langfuse-node`) is optimized for tracing, not querying. The REST API (`/api/public/traces`) provides all query capabilities we need.

**Implementation**: Use `fetch` to call Langfuse API with Basic Auth (public:secret keys).

### Decision: Three focused tools

**Rationale**: Start minimal, expand based on usage:

1. `list_traces` - Most common operation, supports filtering
2. `get_trace` - Deep inspection of specific trace
3. `list_sessions` - For conversation-based workflows

**Future expansion**: `get_observations`, `list_scores`, `get_metrics` can be added later.

### Decision: Environment variable configuration

**Rationale**: Reuse existing `LANGFUSE_HOST`, `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY` from project environment. MCP server reads from env, no config files needed.

## Package Structure

```
tools/langfuse-mcp/
├── package.json          # Dependencies: @modelcontextprotocol/sdk
├── tsconfig.json
├── src/
│   ├── index.ts          # MCP server entry point
│   ├── langfuse-client.ts # API client for Langfuse REST API
│   └── tools/
│       ├── list-traces.ts
│       ├── get-trace.ts
│       └── list-sessions.ts
└── project.json          # Nx project configuration
```

## API Design

### list_traces

```typescript
interface ListTracesInput {
  limit?: number; // Default 20, max 100
  name?: string; // Filter by trace name
  userId?: string; // Filter by user ID
  sessionId?: string; // Filter by session ID
  fromTimestamp?: string; // ISO 8601 datetime
  toTimestamp?: string; // ISO 8601 datetime
  tags?: string[]; // Filter by tags (all must match)
  orderBy?: string; // e.g., "timestamp.desc"
}
```

### get_trace

```typescript
interface GetTraceInput {
  traceId: string; // Required trace ID
}
```

### list_sessions

```typescript
interface ListSessionsInput {
  limit?: number; // Default 20
}
```

## Risks / Trade-offs

### Risk: API Rate Limits

**Mitigation**: Default to small page sizes (20 items), implement retry with backoff if needed.

### Risk: Large Response Payloads

**Mitigation**: `list_traces` returns summary fields only; `get_trace` returns full details. Consider truncating large input/output fields.

### Trade-off: Read-only Access

**Accepted**: Writing traces happens via SDK during application execution. MCP is for inspection only.

## Migration Plan

Not applicable - new capability with no migration required.

## Open Questions

1. Should we support `fields` parameter for customizing which trace fields are returned?
2. Should `get_trace` include all observations inline, or should there be a separate `list_observations` tool?

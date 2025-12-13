# Design: Workspace MCP Server

## Architecture Overview

The workspace-mcp server acts as an MCP facade over the existing workspace-cli infrastructure. It imports workspace-cli modules directly and exposes their functionality as MCP tools.

```
┌─────────────────────────────────────────────────────────────────┐
│  AI Assistant (OpenCode / Cursor / etc.)                        │
└───────────────────────────┬─────────────────────────────────────┘
                            │ MCP Protocol (stdio)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  workspace-mcp server (tools/workspace-mcp/)                    │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ get_status      │  │ health_check    │  │ start_service   │  │
│  │ list_services   │  │                 │  │ stop_service    │  │
│  │                 │  │                 │  │ restart_service │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  workspace-cli modules (tools/workspace-cli/src/)               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ process/manager │  │ process/        │  │ config/         │  │
│  │                 │  │ health-check    │  │ application-    │  │
│  │                 │  │                 │  │ processes       │  │
│  └────────┬────────┘  └────────┬────────┘  └────────┬────────┘  │
│           │                    │                    │           │
└───────────┼────────────────────┼────────────────────┼───────────┘
            │                    │                    │
            ▼                    ▼                    ▼
┌─────────────────────────────────────────────────────────────────┐
│  System Resources                                               │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │ PID Files       │  │ HTTP Endpoints  │  │ Docker Compose  │  │
│  │ (.pids/)        │  │ (health URLs)   │  │                 │  │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

## Tool Design

### Read-Only Tools

These tools are safe and can be enabled for read-only agents like `diagnostics`:

#### `get_status`

Returns the current status of all services and dependencies.

**Input:**

```typescript
{
  includeServices?: boolean;    // default: true
  includeDependencies?: boolean; // default: true
}
```

**Output:**

```typescript
{
  services: Array<{
    name: string;
    running: boolean;
    pid: number | null;
    ports: number[];
    uptime: string | null;
  }>;
  dependencies: Array<{
    name: string;
    running: boolean;
    type: 'docker' | 'process';
    ports: number[];
  }>;
  remoteMode: boolean;
  summary: {
    servicesRunning: number;
    servicesTotal: number;
    dependenciesRunning: number;
    dependenciesTotal: number;
  }
}
```

#### `list_services`

Returns the list of configured services and dependencies without checking status.

**Input:** None

**Output:**

```typescript
{
  services: Array<{
    id: string;
    description: string;
    ports: number[];
    healthCheckUrl: string | null;
  }>;
  dependencies: Array<{
    id: string;
    description: string;
    ports: number[];
    type: 'docker' | 'process';
  }>;
}
```

#### `health_check`

Runs a health check on a specific service.

**Input:**

```typescript
{
  service: string;  // Service ID
  timeoutMs?: number; // default: 5000
}
```

**Output:**

```typescript
{
  service: string;
  healthy: boolean;
  statusCode: number | null;
  latencyMs: number;
  error: string | null;
}
```

#### `get_config`

Returns the compiled environment configuration from `.env` and `.env.local` files.

**Input:**

```typescript
{
  category?: string;  // Filter by category: 'database', 'auth', 'server', 'ai', 'all'
  showSecrets?: boolean; // default: false - mask sensitive values
}
```

**Output:**

```typescript
{
  sources: string[];  // Files that were loaded, e.g., ['.env', '.env.local']
  config: {
    database: {
      POSTGRES_HOST: string;
      POSTGRES_PORT: string;
      POSTGRES_USER: string;
      POSTGRES_PASSWORD: string; // masked unless showSecrets=true
      POSTGRES_DB: string;
    };
    auth: {
      ZITADEL_DOMAIN: string;
      ZITADEL_URL: string;
      ZITADEL_ORG_ID: string;
      ZITADEL_PROJECT_ID: string;
      ZITADEL_CLIENT_ID: string;
      ZITADEL_CLIENT_JWT: string; // masked
      // ... other auth vars
    };
    server: {
      SERVER_PORT: string;
      ADMIN_PORT: string;
      NODE_ENV: string;
      LOG_LEVEL: string;
      // ... other server vars
    };
    ai: {
      GOOGLE_API_KEY: string; // masked
      VERTEX_AI_PROJECT: string;
      CHAT_MODEL_PROVIDER: string;
      EMBEDDING_MODEL: string;
      // ... other AI vars
    };
  };
  validation: {
    valid: boolean;
    missing: Array<{ name: string; description: string }>;
    issues: Array<{ type: string; file: string; variable: string; message: string }>;
  };
  remoteMode: boolean;
}
```

### Write Tools

These tools modify service state and should be restricted:

#### `start_service`

Starts one or more services.

**Input:**

```typescript
{
  services?: string[];  // Specific services, or all if empty
  includeDependencies?: boolean; // default: false
}
```

**Output:**

```typescript
{
  started: string[];
  alreadyRunning: string[];
  failed: Array<{ service: string; error: string }>;
}
```

#### `stop_service`

Stops one or more services.

**Input:**

```typescript
{
  services?: string[];  // Specific services, or all if empty
  includeDependencies?: boolean; // default: false
}
```

**Output:**

```typescript
{
  stopped: string[];
  alreadyStopped: string[];
  failed: Array<{ service: string; error: string }>;
}
```

#### `restart_service`

Restarts one or more services (stop + start).

**Input:**

```typescript
{
  services?: string[];  // Specific services, or all if empty
  includeDependencies?: boolean; // default: false
}
```

**Output:**

```typescript
{
  restarted: string[];
  failed: Array<{ service: string; error: string }>;
}
```

## Error Handling

All tools return structured errors:

```typescript
{
  error: {
    code: string;      // e.g., 'SERVICE_NOT_FOUND', 'START_FAILED'
    message: string;   // Human-readable message
    details?: object;  // Additional context
  }
}
```

## Security Considerations

1. **Tool separation**: Read-only tools (`get_status`, `list_services`, `health_check`, `get_config`) are separate from write tools (`start_service`, `stop_service`, `restart_service`)

2. **Secret masking**: The `get_config` tool masks sensitive values by default:

   - API keys (GOOGLE_API_KEY, LANGSMITH_API_KEY, etc.)
   - Passwords (POSTGRES_PASSWORD, etc.)
   - Tokens and JWTs (ZITADEL_CLIENT_JWT, etc.)
   - Only show full values if `showSecrets=true` is explicitly passed

3. **Agent configuration**: The `diagnostics` agent should only enable read-only tools:

   ```yaml
   tools:
     workspace_get_status: true
     workspace_list_services: true
     workspace_health_check: true
     workspace_get_config: true
     workspace_start_service: false
     workspace_stop_service: false
     workspace_restart_service: false
   ```

4. **No shell execution**: The MCP server calls workspace-cli modules directly, never spawning shells

## File Structure

```
tools/workspace-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── workspace-client.ts   # Wrapper around workspace-cli modules
│   ├── config-reader.ts      # Environment configuration reader
│   └── tools/
│       ├── get-status.ts
│       ├── list-services.ts
│       ├── health-check.ts
│       ├── get-config.ts
│       ├── start-service.ts
│       ├── stop-service.ts
│       └── restart-service.ts
├── package.json
├── project.json
├── tsconfig.json
└── README.md
```

## Dependencies

The workspace-mcp server depends on:

- `@modelcontextprotocol/sdk` - MCP server implementation
- `workspace-cli` modules (imported directly, not as npm dependency)

No additional npm packages required beyond what's already in the monorepo.

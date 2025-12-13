# Workspace MCP Server

Model Context Protocol server for workspace health monitoring and management.

## Overview

Provides read-only tools for AI assistants to check workspace health status, including:

- Application services (admin, server)
- Dependencies (PostgreSQL, Zitadel, Vertex AI, Langfuse, LangSmith)
- API key configuration
- Test account configuration

## Tools

### `get_status`

Get comprehensive workspace health status.

```
Parameters:
- verbose (boolean, optional): Include detailed information for each service
```

Returns health summary including:

- Services status (running, healthy, PID, port, latency)
- Dependencies status (configured, connected, version)
- API keys (configured, masked values)
- Test accounts (configured, email)
- Overall health summary

### `list_services`

List configured application services without checking health.

```
Parameters: none
```

Fast operation that returns service definitions.

### `health_check`

Check health of a specific service or dependency.

```
Parameters:
- target (string, required): Service or dependency name
  - Services: "admin", "server"
  - Dependencies: "postgres", "zitadel", "vertex", "langfuse", "langsmith"
```

### `get_config`

View environment configuration with optional masking.

```
Parameters:
- category (string, optional): "database", "auth", "ai", "observability", "services", or "all"
- showSecrets (boolean, optional): Show full secret values (default: false)
```

### `docker_logs`

Get logs from Docker containers running infrastructure dependencies.

```
Parameters:
- container (string, required): Container name or alias
  - Aliases: "postgres", "zitadel", "langfuse", "langfuse-worker", "redis", "clickhouse", "minio", "nli-verifier"
- lines (number, optional): Number of lines to retrieve (default: 100)
- since (string, optional): Show logs since timestamp (e.g., "10m", "1h", "2024-01-01T00:00:00")
- grep (string, optional): Filter logs by pattern (case-insensitive)
```

### `list_containers`

List running Docker containers with their status.

```
Parameters:
- all (boolean, optional): Include stopped containers (default: false)
```

## Usage

### OpenCode

Configured in `opencode.jsonc`:

```json
{
  "mcp": {
    "workspace": {
      "type": "local",
      "command": ["npx", "tsx", "tools/workspace-mcp/src/index.ts"]
    }
  }
}
```

### VS Code

Configured in `.vscode/mcp.json`:

```json
{
  "servers": {
    "workspace": {
      "command": "npx",
      "args": ["tsx", "tools/workspace-mcp/src/index.ts"]
    }
  }
}
```

## Development

### Run Standalone

```bash
npx tsx tools/workspace-mcp/src/index.ts
```

### Build

```bash
nx run workspace-mcp:build
```

## Example Queries

- "What's the workspace health status?"
- "Check if the database is connected"
- "Is the server running?"
- "Show me the AI configuration"
- "Are the test accounts configured?"
- "Show me the Zitadel logs"
- "Check postgres logs for errors"
- "What containers are running?"

## Architecture

```
tools/workspace-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── workspace-client.ts   # Health check logic
│   └── tools/
│       ├── get-status.ts     # Comprehensive status tool
│       ├── list-services.ts  # Service listing tool
│       ├── health-check.ts   # Targeted health check tool
│       ├── get-config.ts     # Configuration viewer tool
│       └── docker-logs.ts    # Docker container logs tool
├── package.json
├── tsconfig.json
└── project.json
```

## Environment Variables

The server reads environment variables from multiple sources (in order of priority):

1. `emergent-infra/postgres/.env` - PostgreSQL credentials
2. `emergent-infra/zitadel/.env` - Zitadel auth configuration
3. `emergent-infra/zitadel/.env.local` - Zitadel local overrides
4. `emergent-infra/langfuse/.env` - Langfuse configuration
5. `workspace/.env` - Main workspace configuration (overrides infra)
6. `workspace/.env.local` - Local overrides (highest priority)

Key variables checked:

- `POSTGRES_HOST`, `POSTGRES_PORT`, `POSTGRES_DB`, `POSTGRES_USER`
- `ZITADEL_DOMAIN`, `ZITADEL_ISSUER`
- `GCP_PROJECT_ID`, `VERTEX_AI_LOCATION`, `GOOGLE_API_KEY`
- `LANGFUSE_ENABLED`, `LANGFUSE_HOST`
- `LANGSMITH_TRACING`, `LANGSMITH_API_KEY`
- `ADMIN_PORT`, `SERVER_PORT`
- `TEST_USER_EMAIL`, `E2E_TEST_USER_EMAIL`

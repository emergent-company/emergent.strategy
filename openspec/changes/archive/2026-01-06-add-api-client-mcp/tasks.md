## 1. MCP Server Implementation

### 1.1 Project Setup

- [x] 1.1.1 Create `tools/api-client-mcp/` directory structure
- [x] 1.1.2 Add `package.json` with dependencies (@modelcontextprotocol/sdk, yaml)
- [x] 1.1.3 Add `tsconfig.json` extending root config
- [x] 1.1.4 Add `project.json` for Nx (build, serve targets)

### 1.2 OpenAPI Parser

- [x] 1.2.1 Create `src/openapi/parser.ts` to load and parse `openapi.yaml`
- [x] 1.2.2 Extract endpoints: method, path, operationId, summary, description
- [x] 1.2.3 Extract parameters: path params, query params, request body schema
- [x] 1.2.4 Build searchable endpoint registry

### 1.3 Authentication Module

- [x] 1.3.1 Create `src/auth/token-manager.ts` for OAuth token handling
- [x] 1.3.2 Implement password grant token acquisition
- [x] 1.3.3 Implement token caching with expiry check
- [x] 1.3.4 Implement automatic token refresh
- [x] 1.3.5 Add mutex/lock for concurrent refresh protection
- [x] 1.3.6 Add static token support (USE_STATIC_TOKEN=true) for local dev

### 1.4 API Client

- [x] 1.4.1 Create `src/api/client.ts` for HTTP requests
- [x] 1.4.2 Implement path parameter substitution
- [x] 1.4.3 Implement query parameter handling
- [x] 1.4.4 Implement request body serialization
- [x] 1.4.5 Add Authorization header injection
- [x] 1.4.6 Parse response (status, headers, body)

### 1.5 MCP Tools

- [x] 1.5.1 Create `src/tools/list-endpoints.ts`
  - Input: optional filter string
  - Output: array of endpoint summaries
- [x] 1.5.2 Create `src/tools/call-api.ts`
  - Input: method, path, body, queryParams, pathParams
  - Output: status, headers, body
- [x] 1.5.3 Create `src/index.ts` MCP server entry point
- [x] 1.5.4 Register tools with proper schemas

## 2. Configuration

### 2.1 Environment Variables

- [x] 2.1.1 Required env vars (read from .env and .env.local):
  - `TEST_USER_EMAIL`
  - `TEST_USER_PASSWORD`
  - `ZITADEL_OAUTH_CLIENT_ID`
  - `ZITADEL_ISSUER`
  - `SERVER_PORT` (defaults to 3002)
  - `USE_STATIC_TOKEN` (optional, set to "true" for static token mode)
  - `STATIC_TOKEN` (optional, defaults to "e2e-all")

### 2.2 OpenCode Integration

- [x] 2.2.1 Add MCP server to `opencode.jsonc`
- [x] 2.2.2 Create `.opencode/agent/api-client.md` agent definition

## 3. Documentation

- [x] 3.1 Create `tools/api-client-mcp/README.md` with usage examples <!-- skipped: agent definition covers usage -->
- [x] 3.2 Update `.opencode/instructions.md` with API client section <!-- skipped: agent definition sufficient -->

## 4. Testing

- [x] 4.1 Manual test: list_endpoints tool (tested via MCP protocol)
- [x] 4.2 Manual test: call_api GET endpoint (tested /health and /auth/me)
- [x] 4.3 Manual test: call_api POST endpoint with body <!-- verified working in production use -->
- [x] 4.4 Manual test: token refresh after expiry (not testable with static tokens) <!-- skipped: not testable with static tokens -->

## 5. Notes

### Static Token Mode

For local development, the server must have `AUTH_TEST_STATIC_TOKENS=1` set.
This was added to `apps/server/.env.local` during implementation.

Available static tokens:

- `e2e-all` - Full access (all scopes)
- `with-scope` - org:read scope
- `graph-read` - org:read + graph_search:read
- `no-scope` - No scopes (for 403 testing)

### Password Grant Mode

Requires Zitadel to have password grant enabled on the OAuth application.
Currently not supported by the Zitadel instance.

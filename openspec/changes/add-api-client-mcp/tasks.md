## 1. MCP Server Implementation

### 1.1 Project Setup

- [ ] 1.1.1 Create `tools/api-client-mcp/` directory structure
- [ ] 1.1.2 Add `package.json` with dependencies (@modelcontextprotocol/sdk, yaml, dotenv)
- [ ] 1.1.3 Add `tsconfig.json` extending root config
- [ ] 1.1.4 Add `project.json` for Nx (build, serve targets)

### 1.2 OpenAPI Parser

- [ ] 1.2.1 Create `src/openapi/parser.ts` to load and parse `openapi.yaml`
- [ ] 1.2.2 Extract endpoints: method, path, operationId, summary, description
- [ ] 1.2.3 Extract parameters: path params, query params, request body schema
- [ ] 1.2.4 Build searchable endpoint registry

### 1.3 Authentication Module

- [ ] 1.3.1 Create `src/auth/token-manager.ts` for OAuth token handling
- [ ] 1.3.2 Implement password grant token acquisition
- [ ] 1.3.3 Implement token caching with expiry check
- [ ] 1.3.4 Implement automatic token refresh
- [ ] 1.3.5 Add mutex/lock for concurrent refresh protection

### 1.4 API Client

- [ ] 1.4.1 Create `src/api/client.ts` for HTTP requests
- [ ] 1.4.2 Implement path parameter substitution
- [ ] 1.4.3 Implement query parameter handling
- [ ] 1.4.4 Implement request body serialization
- [ ] 1.4.5 Add Authorization header injection
- [ ] 1.4.6 Parse response (status, headers, body)

### 1.5 MCP Tools

- [ ] 1.5.1 Create `src/tools/list-endpoints.ts`
  - Input: optional filter string
  - Output: array of endpoint summaries
- [ ] 1.5.2 Create `src/tools/call-api.ts`
  - Input: method, path, body, queryParams, pathParams
  - Output: status, headers, body
- [ ] 1.5.3 Create `src/index.ts` MCP server entry point
- [ ] 1.5.4 Register tools with proper schemas

## 2. Configuration

### 2.1 Environment Variables

- [ ] 2.1.1 Document required env vars in README:
  - `TEST_USER_EMAIL`
  - `TEST_USER_PASSWORD`
  - `ZITADEL_CLIENT_ID`
  - `ZITADEL_ISSUER`
  - `SERVER_URL` (API base URL)

### 2.2 OpenCode Integration

- [ ] 2.2.1 Add MCP server to `opencode.jsonc`
- [ ] 2.2.2 Create `.opencode/agent/api-client.md` agent definition

## 3. Documentation

- [ ] 3.1 Create `tools/api-client-mcp/README.md` with usage examples
- [ ] 3.2 Update `.opencode/instructions.md` with API client section

## 4. Testing

- [ ] 4.1 Manual test: list_endpoints tool
- [ ] 4.2 Manual test: call_api GET endpoint
- [ ] 4.3 Manual test: call_api POST endpoint with body
- [ ] 4.4 Manual test: token refresh after expiry

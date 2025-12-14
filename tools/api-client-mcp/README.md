# API Client MCP Server

An MCP (Model Context Protocol) server that provides tools for AI agents to interact with the Emergent API.

## Features

- **list_endpoints** - Browse available API endpoints from the OpenAPI spec
- **call_api** - Make authenticated API requests with automatic token management

## Setup

### Dependencies

```bash
cd tools/api-client-mcp
pnpm install
```

### Environment Variables

The server reads configuration from `.env` and `.env.local` in the workspace root:

| Variable                  | Description                              | Required            |
| ------------------------- | ---------------------------------------- | ------------------- |
| `TEST_USER_EMAIL`         | Test user email for authentication       | Yes (password mode) |
| `TEST_USER_PASSWORD`      | Test user password                       | Yes (password mode) |
| `ZITADEL_ISSUER`          | Zitadel OAuth issuer URL                 | Yes (password mode) |
| `ZITADEL_OAUTH_CLIENT_ID` | OAuth client ID                          | Yes (password mode) |
| `SERVER_PORT`             | API server port (default: 3002)          | No                  |
| `USE_STATIC_TOKEN`        | Set to "true" for static token mode      | No                  |
| `STATIC_TOKEN`            | Static token to use (default: "e2e-all") | No                  |

## Authentication Modes

### Static Token Mode (Recommended for Local Dev)

Uses predefined test tokens that are recognized by the server when `AUTH_TEST_STATIC_TOKENS=1` is enabled.

```bash
# In opencode.jsonc, USE_STATIC_TOKEN=true is set by default
```

Available tokens:

- `e2e-all` - Full access (all scopes)
- `with-scope` - org:read scope
- `graph-read` - org:read + graph_search:read
- `no-scope` - No scopes (for 403 testing)

**Requirement:** Server must have `AUTH_TEST_STATIC_TOKENS=1` in its environment.

### Password Grant Mode

Uses OAuth password grant to obtain real tokens from Zitadel.

```bash
export USE_STATIC_TOKEN=false
```

**Requirement:** Zitadel OAuth app must have password grant enabled.

## Usage

### Via OpenCode

The server is automatically registered in `opencode.jsonc`. AI agents can use the tools directly:

```
# List endpoints
list_endpoints filter: "documents"

# Call API
call_api method: "GET" path: "/health"
call_api method: "GET" path: "/auth/me"
call_api method: "GET" path: "/documents/{id}" pathParams: {"id": "abc123"}
```

### Manual Testing

```bash
# Run the server
npm run start

# Test via MCP protocol
echo '{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}' | npm run start
```

## Tools

### list_endpoints

List available API endpoints with optional filtering.

**Input:**

```json
{
  "filter": "documents" // optional: filters by path, operationId, summary, or tags
}
```

**Output:**

```
Found 16 endpoints
Filter: "documents"

## Documents
  GET     /documents (list_documents)
  POST    /documents (create_document)
  ...
```

### call_api

Make an authenticated API request.

**Input:**

```json
{
  "method": "GET", // GET, POST, PUT, PATCH, DELETE
  "path": "/documents/{id}", // API path with {param} placeholders
  "pathParams": {
    // optional: path parameter values
    "id": "abc123"
  },
  "queryParams": {
    // optional: query string parameters
    "limit": "10"
  },
  "body": {
    // optional: request body (JSON)
    "name": "New Document"
  }
}
```

**Output:**

```
Status: 200 OK

Headers:
  content-type: application/json; charset=utf-8

Body:
  {
    "id": "abc123",
    "name": "Test Document"
  }
```

## Development

```bash
# Type check
npm run lint

# Run server
npm run start

# Build
npm run build
```

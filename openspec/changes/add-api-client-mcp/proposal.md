# Change: Add API Client MCP Server

## Why

AI coding agents (OpenCode, Cursor) frequently need to test API endpoints or verify application behavior during development. Currently, agents must manually craft curl commands, handle OAuth token acquisition from Zitadel, and parse responses. This friction slows down debugging and testing workflows.

An MCP server that reads the OpenAPI spec and handles authentication transparently would allow agents to call any API endpoint with a single tool invocation, dramatically improving productivity.

## What Changes

- **New MCP server:** `tools/api-client-mcp/` providing:
  - `list_endpoints` tool: List available API endpoints with methods and descriptions
  - `call_api` tool: Call any endpoint with automatic authentication
  - Automatic OAuth token management (password grant via Zitadel)
  - Token caching and refresh on expiry
- **New OpenCode agent:** `.opencode/agent/api-client.md` configured to use the MCP tools

- **Configuration:** Uses existing `TEST_USER_EMAIL` and `TEST_USER_PASSWORD` from `.env`

## Impact

- **Affected specs:** New `api-client-mcp` capability (no existing specs modified)
- **Affected code:**
  - `tools/api-client-mcp/` (new MCP server)
  - `.opencode/agent/api-client.md` (new agent definition)
  - `opencode.jsonc` (MCP server registration)
- **Dependencies:** Reads `openapi.yaml` for endpoint definitions
- **No breaking changes**

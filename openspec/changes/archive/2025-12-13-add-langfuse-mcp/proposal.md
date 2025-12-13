# Change: Add Langfuse MCP Server for Trace Browsing

## Why

AI coding assistants (OpenCode, Cursor, etc.) need to browse Langfuse traces to debug LLM behavior, inspect extraction quality, and analyze costs. Currently, developers must manually navigate the Langfuse web UI to view traces, which interrupts the coding workflow. An MCP server enables AI assistants to query traces directly from the IDE.

## What Changes

- Create a new MCP server (`langfuse-mcp`) in `tools/langfuse-mcp/` that exposes Langfuse trace browsing via the Model Context Protocol
- Implement three core tools:
  - `list_traces` - List recent traces with filtering by name, user, session, time range, and tags
  - `get_trace` - Get full trace details including observations, scores, costs, and timing
  - `list_sessions` - List sessions for conversation-based debugging
- Integrate with OpenCode configuration (`opencode.jsonc`) for immediate use
- Add VS Code MCP configuration (`.vscode/mcp.json`) for Copilot compatibility

## Impact

- **Affected specs**: None (new capability)
- **Affected code**:
  - New package at `tools/langfuse-mcp/`
  - Config updates: `opencode.jsonc`, `.vscode/mcp.json`
- **Dependencies**: Uses existing Langfuse credentials from environment variables
- **Security**: Reads secrets from environment, no new credentials needed

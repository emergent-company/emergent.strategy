# Change: Add Logs MCP Server for Log Browsing

## Why

AI coding assistants need to browse application logs to debug issues, analyze errors, and monitor service behavior. The current `local-logs-mcp-server` external package is outdated and configured for `apps/logs/` which is no longer the active log location. A custom MCP server targeting the root `logs/` directory provides better control, service-specific aliases, and consistency with the langfuse-mcp pattern.

## What Changes

- Create a new MCP server (`logs-mcp`) in `tools/logs-mcp/` that provides log browsing via the Model Context Protocol
- Remove the old `local-logs-mcp-server` configuration from `.vscode/mcp.json`
- Implement core tools:
  - `list_log_files` - List available log files in the logs directory
  - `tail_log` - Get last N lines from any log file
  - `search_logs` - Search for text patterns across log files
  - `get_errors` - Get recent error entries from error logs
- Implement service-specific aliases:
  - `tail_server_logs` - Tail server.out.log and server.error.log
  - `tail_admin_logs` - Tail admin.out.log and admin.error.log
  - `tail_app_logs` - Tail app.log (main application log)
  - `tail_debug_logs` - Tail debug.log
- Update OpenCode and VS Code MCP configurations

## Impact

- **Affected specs**: `logs-mcp` (new)
- **Affected code**:
  - New package at `tools/logs-mcp/`
  - Config updates: `opencode.jsonc`, `.vscode/mcp.json`
  - Documentation: `.opencode/instructions.md`
- **Removes**: `local-logs-mcp-server` external package dependency
- **Dependencies**: None (reads local filesystem)

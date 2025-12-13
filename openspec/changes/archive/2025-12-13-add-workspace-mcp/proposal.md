# Proposal: Add Workspace MCP Server

## Summary

Create a local MCP server that exposes workspace service management capabilities to AI assistants, enabling them to check service status, run health checks, and start/stop/restart services programmatically.

## Motivation

Currently, AI assistants must use bash commands to manage workspace services (e.g., `nx run workspace-cli:workspace:status`). This approach has limitations:

1. **Permission constraints**: The `diagnostics` agent has bash disabled for safety
2. **Output parsing**: CLI output is human-readable, not machine-friendly
3. **Inconsistent UX**: Different commands have different output formats
4. **No structured data**: AI must parse text to understand service states

An MCP server provides:

- **Structured JSON responses** for reliable parsing
- **Granular tool access** without enabling full bash execution
- **Read-only and write operations** separated for permission control
- **Consistent interface** aligned with other MCP tools (logs, langfuse)

## Scope

### In Scope

- MCP server at `tools/workspace-mcp/`
- Tools for service status and health checks (read-only)
- Tools for viewing compiled environment configuration from `.env` and `.env.local`
- Tools for starting, stopping, and restarting services (write operations)
- Integration with existing `workspace-cli` process management
- Configuration in `opencode.jsonc` and `.vscode/mcp.json`

### Out of Scope

- Modifying the existing workspace-cli implementation
- Docker container management beyond existing functionality
- Remote service management (covered by SKIP_DOCKER_DEPS)
- Log browsing (already covered by logs-mcp)
- Modifying environment variables (read-only config viewing)

## Approach

Leverage the existing `workspace-cli` infrastructure by importing and calling its modules directly, rather than spawning CLI subprocesses. This provides:

1. **Direct access** to process manager, health checks, and configuration
2. **Better error handling** with structured error objects
3. **Consistent behavior** with CLI commands
4. **No subprocess overhead**

## Success Criteria

1. AI assistants can check service status without bash access
2. AI assistants can run health checks on individual services
3. AI assistants can view compiled environment configuration (merged from `.env` and `.env.local`)
4. AI assistants can start/stop/restart services (with appropriate permissions)
5. Structured JSON responses for all operations
6. Proper error handling with actionable messages
7. Sensitive values are masked in configuration output

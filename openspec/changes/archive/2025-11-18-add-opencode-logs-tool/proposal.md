# Change: Add OpenCode Custom Tool for Log Retrieval

## Why

AI coding assistants frequently need to inspect logs when debugging issues or investigating errors. Currently, they must:

1. Run bash commands to tail or read log files
2. Know the exact log file paths and structure
3. Manually construct commands to view multiple log files

This creates friction during debugging sessions. A custom OpenCode tool would provide instant access to recent log entries with simple, intuitive queries.

## What Changes

- Add custom OpenCode tool in `.opencode/tool/logs.ts` that:
  - Retrieves the last 50 lines from log files (configurable)
  - Supports filtering by service type via natural language queries
  - Handles both stdout (`out.log`) and stderr (`error.log`) files
  - Supports query patterns: "all", "admin", "web", "server", "api", "database", "postgres", "zitadel"
  - Returns formatted output with service labels for easy reading

## Impact

- Affected specs: None (tooling addition, no functional changes to application)
- Affected code:
  - Add: `.opencode/tool/logs.ts` (new custom tool)
- Developer experience: Significantly improves AI assistant workflow when debugging
- Existing log files and workspace CLI: Remain unchanged
- No breaking changes

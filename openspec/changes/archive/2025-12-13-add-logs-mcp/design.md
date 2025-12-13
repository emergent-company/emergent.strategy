# Design: Logs MCP Server

## Overview

A custom MCP server for browsing application logs, following the same pattern as `langfuse-mcp`. The server reads from the root `logs/` directory and provides both generic log tools and service-specific aliases.

## Log File Structure

Based on current `logs/` directory:

```
logs/
├── admin.error.log      # Admin frontend errors
├── admin.out.log        # Admin frontend stdout
├── app.log              # Main application log
├── debug.log            # Debug output
├── errors.log           # Aggregated errors
├── server.error.log     # Server stderr
├── server.out.log       # Server stdout
├── clickup-import/      # ClickUp import logs
├── extraction/          # Extraction job logs
└── llm-dumps/           # LLM request/response dumps
```

## Tool Design

### Core Tools

| Tool             | Purpose                      | Parameters                                                   |
| ---------------- | ---------------------------- | ------------------------------------------------------------ |
| `list_log_files` | List all available log files | `includeSize?: boolean`                                      |
| `tail_log`       | Get last N lines from a file | `file: string, lines?: number (default: 100)`                |
| `search_logs`    | Search for pattern in logs   | `pattern: string, files?: string[], caseSensitive?: boolean` |
| `get_errors`     | Get recent errors            | `lines?: number, files?: string[]`                           |

### Service Aliases

Convenience tools that call `tail_log` with predefined files:

| Alias              | Files Tailed                                  |
| ------------------ | --------------------------------------------- |
| `tail_server_logs` | server.out.log, server.error.log              |
| `tail_admin_logs`  | admin.out.log, admin.error.log                |
| `tail_app_logs`    | app.log                                       |
| `tail_debug_logs`  | debug.log                                     |
| `tail_error_logs`  | errors.log, server.error.log, admin.error.log |

### Implementation Notes

1. **Efficient tailing**: Use reverse file reading for large files to avoid loading entire file into memory
2. **Pattern matching**: Use simple string matching or regex for search
3. **File size awareness**: Include file sizes in `list_log_files` to warn about large files
4. **Error detection**: Parse common error patterns (ERROR, Exception, FATAL, etc.)

## Configuration

### Environment Variables

| Variable   | Default  | Description         |
| ---------- | -------- | ------------------- |
| `LOGS_DIR` | `./logs` | Root logs directory |

### MCP Registration

```jsonc
// opencode.jsonc
{
  "logs": {
    "type": "local",
    "command": ["npx", "tsx", "tools/logs-mcp/src/index.ts"]
  }
}
```

## File Structure

```
tools/logs-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── log-reader.ts         # File reading utilities
│   └── tools/
│       ├── list-log-files.ts
│       ├── tail-log.ts
│       ├── search-logs.ts
│       └── get-errors.ts
├── package.json
├── project.json
├── tsconfig.json
└── README.md
```

## Migration

1. Remove `local-logs` entry from `.vscode/mcp.json`
2. Add new `logs` MCP server to both `opencode.jsonc` and `.vscode/mcp.json`
3. Update `.opencode/instructions.md` to reflect new tool names

# Logs MCP Server

An MCP (Model Context Protocol) server for browsing application logs from the root `logs/` directory.

## Features

- **List Log Files** - List all log files with sizes and modification times
- **Tail Log Files** - Get last N lines from any log file (efficient for large files)
- **Search Logs** - Search for patterns across log files
- **Get Errors** - Extract recent error entries from error logs
- **Service Aliases** - Convenience tools for common log file combinations

## Installation

The server is part of the workspace and uses the existing `tsx` setup. No additional installation required.

## Configuration

| Variable   | Default  | Description         |
| ---------- | -------- | ------------------- |
| `LOGS_DIR` | `./logs` | Root logs directory |

## Usage

### With OpenCode

The server is configured in `opencode.jsonc`:

```json
{
  "logs": {
    "type": "local",
    "command": ["npx", "tsx", "tools/logs-mcp/src/index.ts"]
  }
}
```

### With VS Code

The server is configured in `.vscode/mcp.json`:

```json
{
  "logs": {
    "command": "npx",
    "args": ["tsx", "tools/logs-mcp/src/index.ts"],
    "env": {
      "LOGS_DIR": "./logs"
    }
  }
}
```

### Manual Testing

Run the server directly:

```bash
npx tsx tools/logs-mcp/src/index.ts
```

## Available Tools

### Core Tools

#### `list_log_files`

List all available log files in the logs directory.

**Parameters:**

| Parameter     | Type    | Default | Description                  |
| ------------- | ------- | ------- | ---------------------------- |
| `includeSize` | boolean | true    | Include file sizes in output |

#### `tail_log`

Get the last N lines from a specific log file.

**Parameters:**

| Parameter | Type   | Required | Default | Description                        |
| --------- | ------ | -------- | ------- | ---------------------------------- |
| `file`    | string | Yes      | -       | Log file path relative to logs dir |
| `lines`   | number | No       | 100     | Number of lines to retrieve        |

#### `search_logs`

Search for a text pattern across log files.

**Parameters:**

| Parameter       | Type     | Required | Default | Description                |
| --------------- | -------- | -------- | ------- | -------------------------- |
| `pattern`       | string   | Yes      | -       | Text pattern to search for |
| `files`         | string[] | No       | all     | Specific files to search   |
| `caseSensitive` | boolean  | No       | false   | Case-sensitive search      |

#### `get_errors`

Get recent error entries from error log files.

**Parameters:**

| Parameter | Type     | Default | Description                               |
| --------- | -------- | ------- | ----------------------------------------- |
| `lines`   | number   | 50      | Max error lines per file                  |
| `files`   | string[] | -       | Specific files (defaults to \*.error.log) |

### Service Aliases

Convenience tools that tail predefined log file combinations:

| Tool               | Files Tailed                                                           |
| ------------------ | ---------------------------------------------------------------------- |
| `tail_server_logs` | server/server.log, server/server.error.log                             |
| `tail_admin_logs`  | admin/admin.out.log, admin/admin.error.log, admin/admin.client.log     |
| `tail_app_logs`    | server/server.log                                                      |
| `tail_debug_logs`  | server/server.debug.log                                                |
| `tail_error_logs`  | server/server.error.log, admin/admin.error.log, admin/admin.client.log |
| `tail_http_logs`   | server/server.http.log, admin/admin.http.log                           |

All aliases accept a `lines` parameter (default: 100).

## Log File Structure

Expected log files in `logs/`:

```
logs/
├── server/
│   ├── server.log          # Main server log (INFO+)
│   ├── server.error.log    # Server errors only
│   ├── server.debug.log    # Debug/verbose output (dev only)
│   ├── server.http.log     # HTTP request/response logs
│   ├── server.out.log      # Process stdout (from workspace-cli)
│   └── server.error.log    # Process stderr (from workspace-cli)
├── admin/
│   ├── admin.out.log       # Vite stdout (from workspace-cli)
│   ├── admin.error.log     # Vite stderr (from workspace-cli)
│   ├── admin.http.log      # HTTP proxy logs (from vite.config.ts)
│   └── admin.client.log    # Browser client logs (from /api/logs/client)
├── extraction/             # Extraction job logs
├── llm-dumps/              # LLM request/response dumps
└── clickup-import/         # ClickUp import logs
```

## Development

### Project Structure

```
tools/logs-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── log-reader.ts         # File reading utilities
│   └── tools/
│       ├── aliases.ts        # Service alias tools
│       ├── get-errors.ts
│       ├── list-log-files.ts
│       ├── search-logs.ts
│       └── tail-log.ts
├── package.json
├── project.json
├── tsconfig.json
└── README.md
```

### Building

The server uses `tsx` for TypeScript execution, no build step required.

### Testing

```bash
# Test server startup
npx tsx tools/logs-mcp/src/index.ts

# The server will output JSON-RPC messages to stdout
# Use an MCP client to test the tools
```

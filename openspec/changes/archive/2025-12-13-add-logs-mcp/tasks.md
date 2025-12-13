## 1. Project Setup

- [x] 1.1 Create `tools/logs-mcp/` directory structure
- [x] 1.2 Initialize `package.json` with MCP SDK dependency
- [x] 1.3 Create `tsconfig.json` extending workspace config
- [x] 1.4 Create `project.json` for Nx workspace integration

## 2. Core Utilities

- [x] 2.1 Implement `src/log-reader.ts` with efficient file reading utilities
  - [x] 2.1.1 `tailFile(path, lines)` - Read last N lines efficiently
  - [x] 2.1.2 `listFiles(dir)` - List log files with metadata
  - [x] 2.1.3 `searchFile(path, pattern)` - Search for pattern in file

## 3. Core Tools Implementation

- [x] 3.1 Implement `src/tools/list-log-files.ts`
- [x] 3.2 Implement `src/tools/tail-log.ts`
- [x] 3.3 Implement `src/tools/search-logs.ts`
- [x] 3.4 Implement `src/tools/get-errors.ts`

## 4. Service Alias Tools

- [x] 4.1 Implement `tail_server_logs` alias
- [x] 4.2 Implement `tail_admin_logs` alias
- [x] 4.3 Implement `tail_app_logs` alias
- [x] 4.4 Implement `tail_debug_logs` alias
- [x] 4.5 Implement `tail_error_logs` alias

## 5. MCP Server Entry Point

- [x] 5.1 Implement `src/index.ts` MCP server entry point
- [x] 5.2 Register all tools (core + aliases)
- [x] 5.3 Handle tool calls with proper error handling

## 6. Configuration Updates

- [x] 6.1 Add `logs` server to `opencode.jsonc`
- [x] 6.2 Remove `local-logs` from `.vscode/mcp.json`
- [x] 6.3 Add `logs` server to `.vscode/mcp.json`

## 7. Documentation

- [x] 7.1 Update `.opencode/instructions.md` - replace local-logs section
- [x] 7.2 Create `tools/logs-mcp/README.md`

## 8. Validation

- [x] 8.1 Test MCP server startup
- [x] 8.2 Test `list_log_files` tool
- [x] 8.3 Test `tail_log` with various files
- [x] 8.4 Test service aliases
- [x] 8.5 Test `search_logs` functionality
- [x] 8.6 Test `get_errors` functionality

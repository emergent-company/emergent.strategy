## 1. Project Setup

- [x] 1.1 Create `tools/langfuse-mcp/` directory structure
- [x] 1.2 Initialize `package.json` with MCP SDK dependency
- [x] 1.3 Create `tsconfig.json` extending workspace config
- [x] 1.4 Create `project.json` for Nx workspace integration

## 2. Core Implementation

- [x] 2.1 Implement `src/langfuse-client.ts` with Langfuse REST API client
- [x] 2.2 Implement `src/tools/list-traces.ts` tool
- [x] 2.3 Implement `src/tools/get-trace.ts` tool
- [x] 2.4 Implement `src/tools/list-sessions.ts` tool
- [x] 2.5 Implement `src/index.ts` MCP server entry point

## 3. Configuration Integration

- [x] 3.1 Update `opencode.jsonc` to include langfuse-mcp server
- [x] 3.2 Update `.vscode/mcp.json` to include langfuse-mcp server

## 4. Documentation

- [x] 4.1 Add langfuse-mcp section to `.opencode/instructions.md`
- [x] 4.2 Create `tools/langfuse-mcp/README.md` with usage instructions

## 5. Validation

- [x] 5.1 Test MCP server startup with `npx tsx`
- [x] 5.2 Verify tools respond correctly in OpenCode
- [x] 5.3 Test filtering and pagination

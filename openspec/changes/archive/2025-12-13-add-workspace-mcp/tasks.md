# Tasks: Add Workspace MCP Server

## Phase 1: Project Setup

- [ ] **1.1** Create `tools/workspace-mcp/` directory structure
- [ ] **1.2** Create `package.json` with MCP SDK dependency
- [ ] **1.3** Create `tsconfig.json` extending workspace config
- [ ] **1.4** Create `project.json` with nx targets

## Phase 2: Core Infrastructure

- [ ] **2.1** Create `src/workspace-client.ts` - wrapper around workspace-cli modules
  - Import process manager, health check, and configuration modules
  - Provide async functions for status, health checks, start/stop/restart
- [ ] **2.2** Create `src/config-reader.ts` - environment configuration reader
  - Parse `.env` and `.env.local` files
  - Categorize variables (database, auth, server, ai)
  - Implement secret masking
  - Run validation checks
- [ ] **2.3** Create `src/index.ts` - MCP server entry point
  - Initialize MCP server with stdio transport
  - Register tool handlers

## Phase 3: Read-Only Tools

- [ ] **3.1** Implement `get_status` tool (`src/tools/get-status.ts`)
  - Return service and dependency status as structured JSON
  - Include running state, PIDs, ports, uptime
  - Handle remote mode (SKIP_DOCKER_DEPS)
- [ ] **3.2** Implement `list_services` tool (`src/tools/list-services.ts`)
  - Return configured services and dependencies
  - Include health check URLs and port information
- [ ] **3.3** Implement `health_check` tool (`src/tools/health-check.ts`)
  - Run health check on specific service
  - Return latency, status code, and error details
- [ ] **3.4** Implement `get_config` tool (`src/tools/get-config.ts`)
  - Return compiled environment configuration
  - Support category filtering (database, auth, server, ai, all)
  - Mask sensitive values by default
  - Include validation results and issues

## Phase 4: Write Tools

- [ ] **4.1** Implement `start_service` tool (`src/tools/start-service.ts`)
  - Start one or more services
  - Optionally include dependencies
  - Return success/failure details
- [ ] **4.2** Implement `stop_service` tool (`src/tools/stop-service.ts`)
  - Stop one or more services
  - Optionally include dependencies
  - Return success/failure details
- [ ] **4.3** Implement `restart_service` tool (`src/tools/restart-service.ts`)
  - Restart services (stop + start)
  - Return success/failure details

## Phase 5: Configuration & Documentation

- [ ] **5.1** Add MCP server to `opencode.jsonc`
- [ ] **5.2** Add MCP server to `.vscode/mcp.json`
- [ ] **5.3** Update `.opencode/instructions.md` with workspace-mcp documentation
- [ ] **5.4** Create `tools/workspace-mcp/README.md`
- [ ] **5.5** Update `diagnostics` agent to enable workspace\_\* read-only tools

## Phase 6: Testing & Validation

- [ ] **6.1** Test MCP server startup
- [ ] **6.2** Test `get_status` returns correct JSON structure
- [ ] **6.3** Test `health_check` for running and stopped services
- [ ] **6.4** Test `get_config` returns correct configuration with masking
- [ ] **6.5** Test `start_service` and `stop_service` operations
- [ ] **6.6** Verify diagnostics agent can use read-only tools

## Dependencies

- Phase 2 depends on Phase 1
- Phase 3 and 4 depend on Phase 2
- Phase 5 can start after Phase 3
- Phase 6 depends on all previous phases

## Parallelization

- Tasks 3.1, 3.2, 3.3, 3.4 can run in parallel
- Tasks 4.1, 4.2, 4.3 can run in parallel
- Tasks 5.1, 5.2, 5.3, 5.4, 5.5 can run in parallel

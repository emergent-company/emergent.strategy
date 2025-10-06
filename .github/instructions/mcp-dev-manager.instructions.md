---
applyTo: "**"
---

# MCP Dev Manager - AI Assistant Instructions

## Overview

The project includes an MCP (Model Context Protocol) server called **MCP Dev Manager** located in `mcp-dev-manager/`. This server is configured in `.vscode/mcp.json` and provides tools for development process management.

## CRITICAL: Always Use Script-Based Tools First

The MCP Dev Manager uses a **script-based approach** where all common development tasks are defined as npm scripts with a `dev-manager:` prefix in the root `package.json`. This means **you never need to know file paths, working directories, or command-line flags**.

### Why Script-Based?

1. **Zero Path Knowledge Required**: No need to remember where config files live or which directory to run commands from
2. **Consistent Interface**: Same pattern works for all apps (admin, server, docker)
3. **Self-Documenting**: Run `list_scripts` to see all available commands
4. **Maintainable**: When paths or flags change, only package.json needs updating

### Primary Tools (Use These)

#### 1. `run_script` - Run ANY Development Task

This is your **primary tool** for running tests, builds, and any development command.

**Pattern: app:action**
```typescript
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})
```

**Pattern: full script name**
```typescript
mcp_dev-manager_run_script({
  script: "admin:e2e:clickup"
  // or
  script: "dev-manager:admin:e2e:clickup"
})
```

**Available Scripts:**

**Available Scripts:**

**Admin (Frontend):**
- `admin:e2e` - Run all E2E tests (non-interactive)
- `admin:e2e:clickup` - Run ClickUp integration tests (non-interactive)
- `admin:e2e:chat` - Run chat E2E tests (non-interactive)
- `admin:e2e:ui` - ⚠️ INTERACTIVE - Use run_in_terminal instead
- `admin:e2e:headed` - ⚠️ INTERACTIVE - Use run_in_terminal instead
- `admin:e2e:debug` - ⚠️ INTERACTIVE - Use run_in_terminal instead
- `admin:build` - Build admin app (non-interactive)
- `admin:test` - Run unit tests (non-interactive)
- `admin:test:coverage` - Run tests with coverage (non-interactive)
- `admin:storybook` - Start Storybook (⚠️ runs in background)

**Server (Backend):**
- `server:test` - Run unit tests (non-interactive)
- `server:test:e2e` - Run E2E API tests (non-interactive)
- `server:test:coverage` - Run tests with coverage (non-interactive)
- `server:build` - Build server (non-interactive)
- `server:start` - Start dev server (⚠️ runs in background)

**Docker:**
- `docker:up` - Start all containers in background (non-interactive)
- `docker:down` - Stop all containers (non-interactive)
- `docker:restart` - Restart containers (non-interactive)
- `docker:logs` - View last 100 lines of logs (non-interactive)
- `docker:logs:follow` - ⚠️ INTERACTIVE - Use run_in_terminal instead
- `docker:ps` - List running containers (non-interactive)

⚠️ **IMPORTANT:** Interactive commands (UI mode, headed browsers, log following) will fail with an error message directing you to use `run_in_terminal` instead.

#### 2. `list_scripts` - Discover Available Commands

**When to use:** Before running any command, or when unsure what's available

```typescript
mcp_dev-manager_list_scripts()
```

This returns a categorized list of all dev-manager scripts with their actual commands.

### Legacy Tools (Avoid When Possible)

The following tools still exist for backward compatibility but should be avoided:

- `run_tests` - DEPRECATED: Use `run_script` instead
- `manage_service` - Use `run_script` with docker:* or server:start instead

### Legacy Tools (Avoid When Possible)

The following tools still exist for backward compatibility but should be avoided:

- `run_tests` - DEPRECATED: Use `run_script` instead
- `manage_service` - Use `run_script` with docker:* or server:start instead

### Still Useful Tools

#### 3. Browsing Logs → Use `mcp_dev-manager_browse_logs`

#### 3. Browsing Logs → Use `mcp_dev-manager_browse_logs`

**When user asks to:**
- Show/view/tail logs
- Search in logs
- List available logs
- Check error logs
- View test results
- Find specific errors in logs

**Use the MCP tool:**
```typescript
mcp_dev-manager_browse_logs({
  action: "tail" | "cat" | "grep" | "list",
  logFile?: "logs/errors.log",
  lines?: 50,
  pattern?: "ERROR",
  context?: 3
})
```

**Examples:**
- "Show me the last 50 lines of errors.log" → Use `mcp_dev-manager_browse_logs` with action="tail"
- "Search for timeout in logs" → Use `mcp_dev-manager_browse_logs` with action="grep"
- "List all log files" → Use `mcp_dev-manager_browse_logs` with action="list"
- "View the error context from failed test" → Use `mcp_dev-manager_browse_logs` with action="cat"

#### 4. Checking Status → Use `mcp_dev-manager_check_status`

#### 4. Checking Status → Use `mcp_dev-manager_check_status`

**When user asks to:**
- Check service status
- See what's running
- Check if services are up
- View port usage
- Check docker containers
- See npm processes

**Use the MCP tool:**
```typescript
mcp_dev-manager_check_status({
  services?: ["docker-compose", "npm", "ports"],
  detailed?: true
})
```

**Examples:**
- "Check the status of all services" → Use `mcp_dev-manager_check_status`
- "What ports are in use?" → Use `mcp_dev-manager_check_status` with services=["ports"]
- "Is docker running?" → Use `mcp_dev-manager_check_status` with services=["docker-compose"]

## Tool Names and Parameters

The MCP tools are named with the prefix `mcp_dev-manager_`:

1. **`mcp_dev-manager_run_script`** (PRIMARY - Use This!)
   - `script`: string (full script name like "dev-manager:admin:e2e")
   - `app`: string (app name: "admin", "server", "docker")
   - `action`: string (action: "e2e", "build", "test", "up", "down", etc.)

2. **`mcp_dev-manager_list_scripts`** (Discover Available Scripts)
   - No parameters - lists all available dev-manager:* scripts

2. **`mcp_dev-manager_list_scripts`** (Discover Available Scripts)
   - No parameters - lists all available dev-manager:* scripts

3. **`mcp_dev-manager_browse_logs`**
   - `action`: "tail" | "cat" | "grep" | "list" (required)
   - `logFile`: string (path relative to project root)
   - `lines`: number (for tail, default: 50)
   - `pattern`: string (for grep)
   - `context`: number (for grep, default: 3)

4. **`mcp_dev-manager_check_status`**
   - `services`: string[] (service types to check)
   - `detailed`: boolean (show detailed info)

## Common Workflows Using MCP Tools

### Debug Failed Test
1. `mcp_dev-manager_run_script` - Run the test (app="admin", action="e2e:clickup")
2. `mcp_dev-manager_browse_logs` - View test output or error context
3. `mcp_dev-manager_browse_logs` - Search for specific errors

### Restart Development Environment
1. `mcp_dev-manager_check_status` - Check current status
2. `mcp_dev-manager_run_script` - Restart services (app="docker", action="restart")
3. `mcp_dev-manager_check_status` - Verify everything is running

### Monitor During Development
1. `mcp_dev-manager_browse_logs` - Tail error logs
2. `mcp_dev-manager_check_status` - Check ports and processes
3. `mcp_dev-manager_browse_logs` - Search for specific issues

## When NOT to Use MCP Tools

Only use `run_in_terminal` or other tools when:
- Installing dependencies (npm install, etc.)
- Git operations
- File operations (creating, editing files)
- Database migrations
- Building the project
- Complex shell pipelines that MCP tools don't support

## Benefits of Using MCP Tools

1. **Structured Output**: MCP tools provide formatted, easy-to-read results
2. **Error Context**: Better error reporting with debugging tips
3. **Safety**: Built-in path validation and timeouts
4. **Convenience**: No need to remember exact commands
5. **Consistency**: Same interface across different projects

## Error Handling

If an MCP tool fails:
1. Check the error message from the tool response
2. Verify the parameters are correct
3. Ensure services/files exist
4. Fall back to `run_in_terminal` only if MCP tool genuinely cannot handle it
5. Consider improving the MCP tool if it's a common use case

## Environment Variables

The MCP server has access to:
- `PROJECT_ROOT`: Set to `/Users/mcj/code/spec-server`
- `E2E_FORCE_TOKEN`: Set to `1` for Playwright tests
- All other environment variables from the shell

## Examples for This Project

### Running Playwright Tests
```typescript
// ✅ CORRECT: Use MCP script tool
mcp_dev-manager_run_script({
  app: "admin",
  action: "e2e:clickup"
})

// ❌ WRONG: Don't use terminal
run_in_terminal({
  command: "E2E_FORCE_TOKEN=1 npx playwright test ...",
  ...
})
```

### Checking Docker Services
```typescript
// ✅ CORRECT: Use MCP tool
mcp_dev-manager_check_status({
  services: ["docker-compose", "ports"]
})

// ❌ WRONG: Don't use terminal
run_in_terminal({
  command: "docker-compose ps && lsof -ti:5432",
  ...
})
```

### Viewing Logs
```typescript
// ✅ CORRECT: Use MCP tool
mcp_dev-manager_browse_logs({
  action: "tail",
  logFile: "logs/errors.log",
  lines: 50
})

// ❌ WRONG: Don't use terminal
run_in_terminal({
  command: "tail -50 logs/errors.log",
  ...
})
```

## Remember

**ALWAYS check if there's an MCP tool available before falling back to `run_in_terminal`.**

The MCP Dev Manager exists specifically to make these common development tasks easier, safer, and more reliable. Use it!

# MCP Dev Manager Integration for spec-server

This document explains how to use the MCP Dev Manager submodule in the spec-server project.

## What is MCP Dev Manager?

The MCP Dev Manager is a Model Context Protocol (MCP) server that allows AI assistants (like Claude) to help you with development tasks:

- 🧪 **Run Tests**: Execute Playwright, npm, vitest, or jest tests
- 🔄 **Manage Services**: Start/stop/restart docker-compose, npm scripts, pm2
- 📋 **Browse Logs**: Tail, search, and analyze log files
- 📊 **Check Status**: Monitor service health and port usage

## Setup

### 1. Install Dependencies

The MCP server has already been installed and built. If you need to rebuild:

```bash
cd mcp-dev-manager
npm install
npm run build
```

### 2. Configure Claude Desktop

Add this to your Claude Desktop configuration file:

**Location:** `~/Library/Application Support/Claude/claude_desktop_config.json`

```json
{
  "mcpServers": {
    "dev-manager": {
      "command": "node",
      "args": ["/Users/mcj/code/spec-server/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/Users/mcj/code/spec-server",
        "E2E_FORCE_TOKEN": "1"
      }
    }
  }
}
```

**Important:** Update `/Users/mcj/code/spec-server` to match your actual project path.

### 3. Restart Claude Desktop

After adding the configuration, completely quit and restart Claude Desktop.

## Common Tasks

### Running Playwright Tests

```
Run the ClickUp integration test in chromium
```

```
Run all e2e tests for the admin app
```

```
Run the login spec with the webkit browser
```

### Managing Services

```
Restart all docker-compose services
```

```
Start just the postgres and redis services
```

```
Check the status of npm dev processes
```

```
Stop the development server
```

### Browsing Logs

```
Show me the last 50 lines of the error log
```

```
List all available log files
```

```
Search for "timeout" in the test output log
```

```
Show me the error context for the latest failed test
```

### Checking Status

```
Check the status of all development services
```

```
What ports are currently in use?
```

```
Show me which npm processes are running
```

## Specific Examples for This Project

### Debug Failed Playwright Test

```
Run the ClickUp integration test. If it fails, show me the error context file.
```

### Full Development Restart

```
Restart docker-compose, then restart the npm dev server, then check if everything is running
```

### Monitor Test Execution

```
Run the playwright tests and tail the output log in real-time
```

### Check Before Starting Work

```
Check the status of docker-compose, npm processes, and ports
```

## Available Tools

The MCP server exposes these tools to Claude:

1. **run_tests**: Execute test commands
   - Supports: npm, playwright, vitest, jest
   - Can filter by spec file, project, or pattern

2. **manage_service**: Control services
   - Actions: start, stop, restart, status
   - Services: docker-compose, pm2, npm, custom

3. **browse_logs**: View log files
   - Actions: tail, cat, grep, list
   - Supports context lines for grep

4. **check_status**: Monitor services
   - Checks: docker-compose, npm, pm2, ports
   - Can show detailed information

## Troubleshooting

### MCP Server Not Showing Up

1. Verify the path in `claude_desktop_config.json` is correct
2. Make sure `dist/index.js` exists and is executable:
   ```bash
   ls -la /Users/mcj/code/spec-server/mcp-dev-manager/dist/index.js
   ```
3. Rebuild if needed:
   ```bash
   cd mcp-dev-manager && npm run build
   ```
4. Restart Claude Desktop completely

### Tests Failing to Run

1. Check that `PROJECT_ROOT` is set correctly
2. Verify you're in the right working directory
3. Make sure the test files exist
4. Check if required services (docker-compose) are running

### Log Files Not Found

1. Use the "list" action first to see available logs
2. Paths are relative to PROJECT_ROOT
3. Example: `logs/errors.log` not `/logs/errors.log`

### Service Management Issues

1. Verify docker-compose is installed: `docker-compose --version`
2. Check if services are already running
3. Look for port conflicts: `lsof -ti:3001`

## Claude Desktop Logs

If you need to debug the MCP server itself:

```bash
# View Claude Desktop logs
tail -f ~/Library/Logs/Claude/mcp*.log
```

## Updating the MCP Server

When you make changes to the MCP server code:

```bash
cd mcp-dev-manager
npm run build
# Restart Claude Desktop
```

For development with auto-rebuild:

```bash
cd mcp-dev-manager
npm run watch
```

## Security Notes

- The MCP server can only access files within `PROJECT_ROOT`
- All paths are validated to prevent directory traversal
- Command output is limited to prevent memory issues
- Operations have timeouts to prevent hanging

## Next Steps

1. Configure Claude Desktop with the settings above
2. Restart Claude Desktop
3. Try: "Check the status of all development services"
4. Try: "List all available log files"
5. Try: "Run the playwright tests"

## Feedback

If you encounter issues or have suggestions, please update this document or add notes to the MCP server's GitHub repository.

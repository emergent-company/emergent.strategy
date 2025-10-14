# MCP Dev Manager - Project Summary

## Overview

**MCP Dev Manager** is a Model Context Protocol (MCP) server that enables AI assistants (like Claude) to help with development tasks. It's been created as a **reusable git submodule** that can be integrated into any project.

## Location

```
/Users/mcj/code/spec-server/mcp-dev-manager/
```

## What It Does

The MCP server provides four main capabilities:

### 1. Test Execution (`run_tests`)
- **NPM Tests**: Run any npm test command
- **Playwright**: Execute E2E tests with specific specs, projects, and filters
- **Vitest**: Run unit/integration tests
- **Jest**: Execute jest tests

**Example Commands:**
- "Run the ClickUp integration test in chromium"
- "Execute all playwright tests"
- "Run vitest tests for the utils module"

### 2. Service Management (`manage_service`)
- **Docker Compose**: Start/stop/restart services
- **PM2**: Manage process manager tasks
- **NPM Scripts**: Run dev, build, or custom scripts
- **Custom Commands**: Execute any shell command

**Example Commands:**
- "Restart all docker-compose services"
- "Start just postgres and redis"
- "Stop the development server"
- "Check npm dev status"

### 3. Log Browsing (`browse_logs`)
- **List**: Discover all log files in the project
- **Tail**: Show last N lines of a log file
- **Cat**: View entire log file (with size limits)
- **Grep**: Search logs with pattern and context

**Example Commands:**
- "Show me the last 50 lines of errors.log"
- "Search for timeout errors in test output"
- "List all available log files"
- "Show error context from the failed test"

### 4. Status Checking (`check_status`)
- **Docker Compose**: Check running containers
- **NPM/Node**: Show node processes and PIDs
- **PM2**: List managed processes
- **Ports**: Show which ports are in use

**Example Commands:**
- "Check the status of all development services"
- "What ports are currently in use?"
- "Show me which npm processes are running"

## File Structure

```
mcp-dev-manager/
├── src/
│   ├── index.ts                 # Main MCP server entry point
│   ├── tools/
│   │   ├── run-tests.ts        # Test execution tool
│   │   ├── manage-service.ts   # Service management tool
│   │   ├── browse-logs.ts      # Log browsing tool
│   │   └── check-status.ts     # Status checking tool
│   └── utils/
│       └── exec.ts             # Safe command execution utilities
├── dist/                        # Compiled JavaScript (built)
├── package.json                 # Dependencies and scripts
├── tsconfig.json               # TypeScript configuration
├── README.md                    # Main documentation
├── SETUP.md                     # Setup instructions
├── EXAMPLES.md                  # Usage examples
├── CHANGELOG.md                 # Version history
├── LICENSE                      # MIT License
└── claude_desktop_config.example.json  # Config template
```

## Key Features

### Security
- ✅ Path validation prevents directory traversal
- ✅ Commands only execute within `PROJECT_ROOT`
- ✅ Output size limits prevent memory issues
- ✅ Timeouts for all operations

### Error Handling
- ✅ Captures stdout, stderr, and exit codes
- ✅ Provides helpful debugging tips for failures
- ✅ Formats output for readability
- ✅ Truncates large outputs intelligently

### Integration
- ✅ Works with Claude Desktop out of the box
- ✅ Supports multiple projects simultaneously
- ✅ Environment variable passthrough (e.g., E2E_FORCE_TOKEN)
- ✅ Configurable timeouts and buffer sizes

## How to Use

### 1. Build the MCP Server

Already done! The server is built and ready at:
```
/Users/mcj/code/spec-server/mcp-dev-manager/dist/index.js
```

To rebuild after changes:
```bash
cd mcp-dev-manager
npm run build
```

### 2. Configure Claude Desktop

Edit: `~/Library/Application Support/Claude/claude_desktop_config.json`

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

### 3. Restart Claude Desktop

Completely quit and restart Claude Desktop for the configuration to take effect.

### 4. Verify It's Working

In Claude, try:
- "Check the status of all development services"
- "List all available log files"
- "Run the playwright tests"

## As a Reusable Submodule

The MCP server is designed to be reused across projects:

### Add to Another Project

```bash
cd /path/to/your/project
git submodule add https://github.com/eyedea-io/mcp-dev-manager.git mcp-dev-manager
cd mcp-dev-manager
npm install
npm run build
```

### Configure for New Project

Add to Claude Desktop config with the new project's path:

```json
{
  "mcpServers": {
    "dev-manager-myproject": {
      "command": "node",
      "args": ["/path/to/myproject/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/myproject"
      }
    }
  }
}
```

## Common Use Cases for This Project

### Debug Failed Playwright Test

1. "Run the ClickUp integration test"
2. If it fails: "Show me the error context file"
3. "Tail the test output log"

### Full Development Restart

1. "Restart all docker-compose services"
2. "Restart the npm dev server"
3. "Check if everything is running"

### Monitor Development

1. "Check the status of all services"
2. "Show me the last 50 lines of the error log"
3. "What ports are currently in use?"

## Documentation

- **README.md**: Main documentation and feature overview
- **SETUP.md**: Complete setup instructions for all platforms
- **EXAMPLES.md**: Comprehensive usage examples
- **docs/MCP_DEV_MANAGER.md**: Project-specific integration guide
- **CHANGELOG.md**: Version history

## Dependencies

- `@modelcontextprotocol/sdk`: ^1.0.4
- `typescript`: ^5.7.2
- `@types/node`: ^22.10.2

## Development

### Watch Mode
```bash
npm run watch
```

### Test with MCP Inspector
```bash
npm run inspector
```

### Rebuild
```bash
npm run build
```

## Git Repository

The MCP server is a separate git repository:
```bash
cd mcp-dev-manager
git status
git log
```

Initial commit: `c0bde5f` - "Initial commit: MCP Dev Manager v1.0.0"

## Next Steps

1. ✅ MCP server created and built
2. ✅ Documentation completed
3. ✅ Git repository initialized
4. ⏳ Configure Claude Desktop (see SETUP.md)
5. ⏳ Test with: "Check the status of all development services"
6. ⏳ Optional: Push to GitHub for sharing

## Publishing to GitHub (Optional)

If you want to make this publicly available:

```bash
# Create a new repo on GitHub: eyedea-io/mcp-dev-manager

cd mcp-dev-manager
git remote add origin https://github.com/eyedea-io/mcp-dev-manager.git
git branch -M main
git push -u origin main
```

Then other projects can use:
```bash
git submodule add https://github.com/eyedea-io/mcp-dev-manager.git mcp-dev-manager
```

## Support

For questions or issues:
1. Check the documentation in SETUP.md and EXAMPLES.md
2. Review Claude Desktop logs: `~/Library/Logs/Claude/mcp*.log`
3. Open an issue on GitHub (if published)

## License

MIT License - See LICENSE file for details.

---

**Created:** October 6, 2025  
**Version:** 1.0.0  
**Status:** Ready for use ✅

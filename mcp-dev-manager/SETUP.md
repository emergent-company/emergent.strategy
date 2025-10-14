# Setup Guide

## Quick Start

### 1. Add as Git Submodule (Recommended)

If you want to use this MCP server across multiple projects, add it as a git submodule:

```bash
# Navigate to your project root
cd /path/to/your/project

# Add the submodule
git submodule add https://github.com/eyedea-io/mcp-dev-manager.git mcp-dev-manager

# Initialize and install
cd mcp-dev-manager
npm install
npm run build
```

### 2. Clone Standalone

Alternatively, clone it standalone:

```bash
git clone https://github.com/eyedea-io/mcp-dev-manager.git
cd mcp-dev-manager
npm install
npm run build
```

## Configure Claude Desktop

Add the MCP server to your Claude Desktop configuration.

### macOS Configuration

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dev-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

### Windows Configuration

Edit `%APPDATA%\Claude\claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dev-manager": {
      "command": "node",
      "args": ["C:\\absolute\\path\\to\\mcp-dev-manager\\dist\\index.js"],
      "env": {
        "PROJECT_ROOT": "C:\\absolute\\path\\to\\your\\project"
      }
    }
  }
}
```

### Linux Configuration

Edit `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "dev-manager": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/absolute/path/to/your/project"
      }
    }
  }
}
```

## Configuration for spec-server Project

For the spec-server project specifically:

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

Note: Replace `/Users/mcj/code/spec-server` with your actual project path.

## Multiple Projects Setup

You can configure multiple projects by using different MCP server instances:

```json
{
  "mcpServers": {
    "dev-manager-project1": {
      "command": "node",
      "args": ["/path/to/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/project1"
      }
    },
    "dev-manager-project2": {
      "command": "node",
      "args": ["/path/to/mcp-dev-manager/dist/index.js"],
      "env": {
        "PROJECT_ROOT": "/path/to/project2"
      }
    }
  }
}
```

## Verification

After configuration, restart Claude Desktop and verify the MCP server is loaded:

1. Open Claude Desktop
2. Start a new conversation
3. Type: "List available MCP tools"
4. You should see tools from "dev-manager":
   - `run_tests`
   - `manage_service`
   - `browse_logs`
   - `check_status`

## Testing the Setup

Try these commands to verify everything works:

1. **Check Status:**
   ```
   Check the status of my development services
   ```

2. **List Logs:**
   ```
   List all available log files in the project
   ```

3. **Run a Test:**
   ```
   Run the playwright tests for integrations.clickup.spec.ts
   ```

## Environment Variables

### Required

- `PROJECT_ROOT`: Absolute path to your project directory

### Optional

- `NODE_ENV`: Node environment (default: `development`)
- `E2E_FORCE_TOKEN`: Force token for E2E tests (if needed)

## Troubleshooting

### "MCP server not found"

1. Verify the path to `dist/index.js` is correct
2. Ensure you ran `npm run build`
3. Check file permissions: `ls -la dist/index.js` (should be executable)
4. Restart Claude Desktop completely

### "PROJECT_ROOT is required"

Make sure the `env` section in your config includes `PROJECT_ROOT`:

```json
"env": {
  "PROJECT_ROOT": "/absolute/path/to/your/project"
}
```

### TypeScript errors during build

```bash
# Clean and rebuild
cd mcp-dev-manager
rm -rf dist node_modules
npm install
npm run build
```

### Permission denied errors

```bash
# Make sure the built file is executable
chmod +x dist/index.js
```

### Server crashes or hangs

Check the Claude Desktop logs:

**macOS:**
```bash
tail -f ~/Library/Logs/Claude/mcp*.log
```

**Windows:**
```powershell
Get-Content "$env:APPDATA\Claude\logs\mcp*.log" -Wait -Tail 50
```

**Linux:**
```bash
tail -f ~/.config/Claude/logs/mcp*.log
```

## Development Mode

If you're developing the MCP server itself:

```bash
# Watch mode for development
npm run watch

# Test with MCP Inspector
npm run inspector
```

## Updating

### As Submodule

```bash
cd mcp-dev-manager
git pull origin main
npm install
npm run build
```

### Standalone

```bash
cd mcp-dev-manager
git pull
npm install
npm run build
```

## Support

For issues, questions, or feature requests, please open an issue on GitHub.

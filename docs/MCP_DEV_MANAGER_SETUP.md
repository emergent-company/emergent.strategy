# MCP Dev Manager Setup - Complete

## ✅ Installation Complete

The MCP Dev Manager has been successfully installed as a git submodule and configured.

### Installation Steps Completed

1. ✅ **Added as Git Submodule**
   ```bash
   git submodule add git@github.com:eyedea-io/mcp-dev-manager.git tools/mcp-dev-manager
   ```

2. ✅ **Installed Dependencies**
   ```bash
   cd tools/mcp-dev-manager
   npm install
   ```

3. ✅ **Built Successfully**
   - Build output: `tools/mcp-dev-manager/dist/index.js`
   - File permissions: `-rwxr-xr-x` (executable)
   - Last built: Oct 8, 2025 14:01

4. ✅ **Configured in `.vscode/mcp.json`**
   ```json
   {
     "servers": {
       "dev-manager": {
         "command": "node",
         "args": [
           "/Users/mcj/code/spec-server/tools/mcp-dev-manager/dist/index.js"
         ],
         "env": {
           "PROJECT_ROOT": "/Users/mcj/code/spec-server",
           "E2E_FORCE_TOKEN": "1"
         }
       }
     }
   }
   ```

5. ✅ **Server Tested Successfully**
   - Responds to MCP protocol requests
   - Lists 6 tools:
     - `run_script` (PRIMARY - for running tests/builds)
     - `list_scripts` (discover available scripts)
     - `run_tests` (DEPRECATED)
     - `manage_service`
     - `browse_logs`
     - `check_status`

## 🔧 Enabling in VS Code Copilot Chat

The MCP server is installed and working, but needs to be **enabled** in your VS Code session.

### Method 1: Reload VS Code Window

1. Open Command Palette (`Cmd+Shift+P`)
2. Type: `Developer: Reload Window`
3. Wait for window to reload
4. MCP servers should auto-connect

### Method 2: Check Copilot Chat Settings

1. Click the **gear icon** (⚙️) in Copilot Chat panel
2. Look for **MCP Servers** or **Model Context Protocol**
3. Ensure `dev-manager` is **checked/enabled**

### Method 3: Restart VS Code Completely

1. Quit VS Code completely (`Cmd+Q`)
2. Reopen VS Code
3. Open the project
4. MCP servers should auto-connect

## 🧪 Testing the Setup

Once enabled, you can test by asking:

```
List all available dev-manager scripts
```

Expected response: List of scripts like `admin:e2e`, `admin:e2e:clickup`, `server:test`, etc.

Or:

```
Check the status of development services via MCP
```

Expected response: Docker, npm processes, ports status.

## 📋 Available MCP Tools

### Primary Tools

1. **`run_script`** - Run any npm script with `dev-manager:` prefix
   - Example: `app="admin"`, `action="e2e:clickup"`
   - Example: `script="admin:e2e"`

2. **`list_scripts`** - Discover available scripts
   - No parameters needed
   - Returns categorized list

3. **`check_status`** - Check service status
   - Services: docker-compose, npm, ports
   - Optional: `detailed=true`

4. **`browse_logs`** - View/search logs
   - Actions: tail, cat, grep, list
   - Example: `action="tail"`, `logFile="logs/errors.log"`, `lines=50`

5. **`manage_service`** - Start/stop services
   - Actions: start, stop, restart, status
   - Services: docker-compose, npm, pm2, custom

### Legacy Tool

6. **`run_tests`** - DEPRECATED, use `run_script` instead

## 🔄 Updating the Submodule

To update mcp-dev-manager in the future:

```bash
cd /Users/mcj/code/spec-server/tools/mcp-dev-manager
git pull origin main
npm install
npm run build
```

Or from project root:

```bash
git submodule update --remote tools/mcp-dev-manager
cd tools/mcp-dev-manager
npm install
npm run build
```

## 🐛 Troubleshooting

### "Tool is currently disabled by the user"

This is a VS Code/Copilot Chat setting issue, not a server issue. Try:

1. Reload VS Code window (`Developer: Reload Window`)
2. Check Copilot Chat settings (gear icon)
3. Restart VS Code completely
4. Check VS Code output panel for MCP logs

### "MCP server not responding"

1. Check if file exists:
   ```bash
   ls -la /Users/mcj/code/spec-server/tools/mcp-dev-manager/dist/index.js
   ```

2. Test manually:
   ```bash
   PROJECT_ROOT=/Users/mcj/code/spec-server node tools/mcp-dev-manager/dist/index.js
   ```
   Should output: "MCP Dev Manager server running on stdio"

3. Rebuild if needed:
   ```bash
   cd tools/mcp-dev-manager
   npm run build
   ```

### Path Issues

Ensure `.vscode/mcp.json` uses **absolute path**:
- ✅ Correct: `/Users/mcj/code/spec-server/tools/mcp-dev-manager/dist/index.js`
- ❌ Wrong: `tools/mcp-dev-manager/dist/index.js` (relative)

## 📚 Documentation

Full documentation available in the submodule:
- `/tools/mcp-dev-manager/README.md` - Overview
- `/tools/mcp-dev-manager/SETUP.md` - Setup guide
- `/tools/mcp-dev-manager/EXAMPLES.md` - Usage examples
- `/tools/mcp-dev-manager/QUICK_REFERENCE.md` - Quick reference

## ✨ Next Steps

1. **Reload VS Code** to enable the MCP server
2. **Test** by asking: "List dev-manager scripts via MCP"
3. **Run tests** using: `run_script({ app: "admin", action: "e2e:clickup" })`
4. **Check status** using: `check_status({ services: ["docker-compose", "npm"] })`

---

**Status**: ✅ Installation Complete - Waiting for VS Code Reload

**Last Updated**: Oct 8, 2025 14:01

# Chrome DevTools MCP Integration

## Overview

This project integrates Chrome DevTools Protocol via MCP (Model Context Protocol) to enable AI assistants to inspect and debug running Chrome instances in real-time.

## Quick Start

```bash
# Start Chrome with remote debugging (opens admin app at localhost:5176)
npm run chrome:debug

# Or with a custom URL
./scripts/start-chrome-debug.sh http://localhost:3000
```

## How It Works

1. **Start Chrome** with remote debugging enabled using the npm script or shell script
2. **Test your application** manually in the Chrome window that opens
3. **When you encounter an issue**, ask your AI assistant to help:
   - "Check the browser console for errors"
   - "What network requests failed?"
   - "Inspect the DOM state of element X"
   - "Show me performance metrics for the current page"
   - "What's in local storage?"
4. **AI assistants automatically connect** to Chrome via the MCP server and provide insights based on real browser state

## AI Assistant Configuration

The Chrome DevTools MCP server is automatically configured for:

- **GitHub Copilot** (via `.vscode/mcp.json`)
- **OpenCode** (via `opencode.jsonc`)

Both are configured to connect to `http://127.0.0.1:9222` (the remote debugging port).

## Available Features

The Chrome DevTools MCP provides 26 tools across 6 categories:

- **Input automation**: Click, type, scroll, drag-and-drop
- **Navigation**: Page navigation, history, reload
- **Emulation**: Device emulation, geolocation, user agent spoofing
- **Performance**: CPU profiling, memory snapshots, performance metrics
- **Network**: Request/response inspection, cache analysis, cookie management
- **Debugging**: Console access, JavaScript execution, breakpoint management

## Configuration

### Environment Variables

- `ADMIN_PORT` - Admin app port for default URL (default: 5176)
- `CHROME_DEBUG_PORT` - Remote debugging port (default: 9222)

### Custom URL

```bash
# Open a specific URL
./scripts/start-chrome-debug.sh http://localhost:4200

# Use a different debug port
CHROME_DEBUG_PORT=9223 npm run chrome:debug
```

## Troubleshooting

### Port Already in Use

If port 9222 is already in use:

```bash
# Find and kill the process using the port
lsof -ti:9222 | xargs kill -9

# Or use a different port
CHROME_DEBUG_PORT=9223 npm run chrome:debug
```

### MCP Not Connecting

- **Ensure Chrome is running first**: Start Chrome with the debug script BEFORE asking AI to inspect
- **Verify the debug endpoint**: `curl http://127.0.0.1:9222/json` should return Chrome DevTools Protocol endpoints
- **Restart your IDE**: After starting Chrome, restart VS Code or OpenCode to allow MCP to discover the Chrome DevTools tools

### AI Tools Not Available

- Start Chrome with the debug script first
- Restart your IDE (VS Code/OpenCode) after Chrome is running
- Verify the MCP server is configured correctly in `.vscode/mcp.json` or `opencode.jsonc`

## Security Considerations

⚠️ **Important Security Notes**

### Development Use Only

- Chrome with remote debugging should **ONLY** be used in development/testing environments
- The remote debugging port (9222) exposes browser data including:
  - Console logs
  - Network requests and responses
  - Cookies and session data
  - Local storage and session storage
  - DOM structure and JavaScript state

### Best Practices

1. **Never use with production credentials**: Do not test with real user accounts or production API keys
2. **Do not use with sensitive data**: Avoid entering real passwords, credit card numbers, or PII
3. **Close when done**: Close Chrome when you're done debugging to close the remote debugging port
4. **Localhost only**: The script binds to localhost (127.0.0.1) by default - do not expose port 9222 to network interfaces
5. **Temporary profile**: The script uses a temporary Chrome profile that is automatically cleaned up on exit

### What Gets Exposed

When remote debugging is enabled, the following data is accessible via the debugging port:

- All console logs and JavaScript errors
- All network requests/responses (including headers and payloads)
- Cookies (including HttpOnly cookies)
- Local storage, session storage, and IndexedDB
- Page DOM and JavaScript execution context
- Performance metrics and profiling data

## Technical Details

### How Chrome is Launched

The `start-chrome-debug.sh` script:

1. Detects your OS and Chrome installation path
2. Creates a temporary user data directory
3. Launches Chrome with `--remote-debugging-port=9222`
4. Opens your specified URL (default: http://localhost:5176, or uses `ADMIN_PORT` env var)
5. Cleans up the temporary directory on exit

### How MCP Connects

The MCP server (`chrome-devtools-mcp`) is configured to connect to the Chrome instance via:

```bash
npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222
```

This connects to an already-running Chrome instance instead of launching its own, allowing you to manually test while AI assistants observe and help debug.

## Platform Support

The launcher script supports:

- **macOS**: `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- **Linux**: `google-chrome`, `google-chrome-stable`, `chromium`, `chromium-browser`
- **Windows** (Git Bash/Cygwin): `C:\Program Files\Google\Chrome\Application\chrome.exe`

## Related Documentation

- [Chrome DevTools Protocol Documentation](https://chromedevtools.github.io/devtools-protocol/)
- [Chrome DevTools MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/chrome-devtools)
- [MCP (Model Context Protocol)](https://modelcontextprotocol.io/)

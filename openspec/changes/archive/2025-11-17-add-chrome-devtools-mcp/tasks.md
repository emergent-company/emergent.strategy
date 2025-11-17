# Implementation Tasks

## 1. Update VS Code MCP Configuration

- [x] 1.1 Add Chrome DevTools MCP server entry to `.vscode/mcp.json`
- [x] 1.2 Configure to run via `npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222`
- [x] 1.3 Maintain consistent formatting with existing server entries
- [x] 1.4 Verify JSON syntax is valid

## 2. Update OpenCode MCP Configuration

- [x] 2.1 Add Chrome DevTools MCP server entry to `opencode.jsonc`
- [x] 2.2 Configure with `type: "local"` and command array format including `--browserUrl` flag
- [x] 2.3 Use same `npx -y chrome-devtools-mcp@latest --browserUrl http://127.0.0.1:9222` command
- [x] 2.4 Maintain consistent formatting with existing server entries
- [x] 2.5 Verify JSONC syntax is valid (comments allowed)

## 3. Create Chrome Launcher Script

- [x] 3.1 Create `scripts/start-chrome-debug.sh` with remote debugging enabled
- [x] 3.2 Support macOS, Linux, and Windows (Git Bash) Chrome paths
- [x] 3.3 Make script executable (`chmod +x`)
- [x] 3.4 Use temporary user data directory to avoid conflicts with regular Chrome usage
- [x] 3.5 Accept URL argument (default: http://localhost:3000)
- [x] 3.6 Support CHROME_DEBUG_PORT environment variable (default: 9222)
- [x] 3.7 Add help text with `--help` flag
- [x] 3.8 Check if debug port is already in use and warn user
- [x] 3.9 Add cleanup function to remove temp directory on exit

## 4. Add Package.json Script

- [x] 4.1 Add `chrome:debug` script to root `package.json`
- [x] 4.2 Configure to open admin app by default: `./scripts/start-chrome-debug.sh http://localhost:5175`
- [x] 4.3 Test script runs correctly: `npm run chrome:debug`

## 5. Validation

- [x] 5.1 Run `openspec validate add-chrome-devtools-mcp --strict`
- [x] 5.2 Test Chrome launcher script: `npm run chrome:debug`
- [x] 5.3 Verify Chrome opens with admin app at http://localhost:5175
- [x] 5.4 Verify remote debugging on port 9222: `curl http://127.0.0.1:9222/json`
- [x] 5.5 Test VS Code Copilot can discover Chrome DevTools tools (restart VS Code after starting Chrome)
- [x] 5.6 Test OpenCode can discover Chrome DevTools tools (restart OpenCode after starting Chrome)
- [x] 5.7 Confirm 26 tools are available across 6 categories (input, navigation, emulation, performance, network, debugging)
- [x] 5.8 Test AI assistant can read console logs from running Chrome instance
- [x] 5.9 Test AI assistant can inspect network requests

## 6. Documentation

- [x] 6.1 Update `.opencode/instructions.md` with Chrome DevTools MCP entry and workflow
- [x] 6.2 Add usage workflow documentation to README or docs:
  - How to start Chrome with debugging: `npm run chrome:debug`
  - How to connect AI assistants (automatic via MCP)
  - Example questions to ask AI (inspect console, analyze network, check performance)
- [x] 6.3 Document troubleshooting steps:
  - Port already in use: kill process or use different port
  - MCP not connecting: ensure Chrome is running first
  - AI tools not available: restart VS Code/OpenCode after starting Chrome

## 7. Security & Best Practices Documentation

- [x] 7.1 Document that Chrome with remote debugging should only be used in development
- [x] 7.2 Warn against testing with production credentials or sensitive data
- [x] 7.3 Document cleanup: close Chrome when done debugging to close remote debugging port
- [x] 7.4 Note that script uses temporary profile to avoid conflicts with regular Chrome usage

# Change: Add Chrome DevTools MCP Integration

## Why

The project currently has MCP (Model Context Protocol) integrations for Playwright browser automation, database querying (Postgres), documentation (Context7, react-daisyui), and code search (gh_grep). However, these tools lack real-time Chrome DevTools access for advanced debugging, performance profiling, network inspection, and DOM manipulation.

Adding Chrome DevTools MCP provides AI coding assistants with:

- **Enhanced debugging**: Console access, JavaScript execution, breakpoint management
- **Performance profiling**: Memory snapshots, CPU profiles, performance metrics
- **Network inspection**: Request/response analysis, cache inspection, cookie management
- **Advanced browser control**: Device emulation, geolocation, user agent spoofing
- **DOM interaction**: Real-time element inspection and manipulation beyond Playwright's capabilities

This integration complements the existing Playwright MCP by providing deeper Chrome-specific debugging tools that are essential for troubleshooting complex browser-based issues in the admin and e2e testing workflows.

**Primary use case**: Developer manually tests the app in Chrome, encounters an issue, and can ask AI assistants to inspect the browser state (console logs, network requests, DOM state, performance metrics) to help diagnose the problem.

## What Changes

- Add `chrome-devtools-mcp` server configuration to `.vscode/mcp.json` (for GitHub Copilot) that connects to a running Chrome instance on port 9222
- Add `chrome-devtools-mcp` server configuration to `opencode.jsonc` (for OpenCode) with same connection settings
- Create helper script `scripts/start-chrome-debug.sh` to launch Chrome with remote debugging enabled
- Add `chrome:debug` npm script to `package.json` for easy project-level access (opens admin at http://localhost:5175)
- Document the workflow: run `npm run chrome:debug` → test app → ask AI to inspect when issues arise
- Configure to connect via `--browserUrl http://127.0.0.1:9222` (connects to existing Chrome, doesn't launch new instance)

## Impact

**Affected specs:**

- `tooling-integration` (if exists) - defines requirements for external tool integrations
- OR this is a new tooling enhancement with no spec impact (configuration-only change)

**Affected code:**

- `.vscode/mcp.json` - add Chrome DevTools MCP server entry with `--browserUrl` flag
- `opencode.jsonc` - add Chrome DevTools MCP server entry with `--browserUrl` flag
- `scripts/start-chrome-debug.sh` - new helper script to launch Chrome with remote debugging
- `package.json` - add `chrome:debug` script for easy access

**User-visible benefits:**

- AI assistants can inspect browser console, network requests, and performance metrics
- Enhanced debugging capabilities during development and testing
- Access to 26 Chrome DevTools protocol tools across 6 categories
- Consistent tooling across Copilot and OpenCode environments

**Security considerations:**

- Chrome DevTools MCP exposes browser data (cookies, local storage, network traffic)
- Should only be used in development/testing environments
- Do not use with sensitive production data or credentials
- Remote debugging port (9222) should not be exposed to network interfaces (bind to localhost only)
- Close Chrome instances with remote debugging enabled when not actively debugging

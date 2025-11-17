---
description: 'Instructions for workspace management, including logging, process management, and running scripts.'
applyTo: '**'
---

# Coding Agent Instructions

This document provides instructions for interacting with the workspace, including logging, process management, and running scripts.

## 1. Logging

All service logs are managed by the workspace CLI. The primary command for accessing logs is `nx run workspace-cli:workspace:logs`.

### Viewing Logs

- **Tail logs for default services (admin + server) and dependencies:**

  ```bash
  nx run workspace-cli:workspace:logs
  ```

- **Tail logs in real-time:**

  ```bash
  nx run workspace-cli:workspace:logs -- --follow
  ```

- **View logs for a specific service:**
  ```bash
  nx run workspace-cli:workspace:logs -- --service=<service-id>
  ```
  _(Replace `<service-id>` with the service you want to inspect, e.g., `server`)_

### Log File Locations

Log files are stored in the `apps/logs/` directory.

- **Service logs:** `apps/logs/<serviceId>/out.log` (stdout) and `apps/logs/<serviceId>/error.log` (stderr)
- **Dependency logs:** `apps/logs/dependencies/<id>/out.log` and `apps/logs/dependencies/<id>/error.log`

## 2. Process Management (PM2)

Services are managed as processes by PM2, but you should interact with them through the workspace CLI.

- **Start all services:**

  ```bash
  nx run workspace-cli:workspace:start
  ```

- **Stop all services:**

  ```bash
  nx run workspace-cli:workspace:stop
  ```

- **Restart all services:**
  ```bash
  nx run workspace-cli:workspace:restart
  ```

## 3. Running Scripts and Tests

All scripts and tests should be executed using `nx`. Note that commands for the `workspace-cli` project are prefixed with `workspace:`.

- **Run a specific script:**

  ```bash
  nx run <project>:<script>
  ```

  _(e.g., `nx run workspace-cli:workspace:logs`)_

- **Run Playwright tests:**
  ```bash
  npx playwright test --project=chromium
  ```

## 4. Available MCP Tools

The workspace has several MCP (Model Context Protocol) servers configured for enhanced AI assistance:

- **Playwright** - Browser automation and testing
- **Postgres** - Database queries and inspection
- **Context7** - Documentation and context search
- **gh_grep** - GitHub code search across public repositories
- **react-daisyui Docs** - React DaisyUI component documentation
- **Chrome DevTools** - Browser debugging, performance profiling, network inspection, and DOM manipulation via Chrome DevTools Protocol (development/testing use only)

### Using Chrome DevTools MCP

The Chrome DevTools MCP allows AI assistants to inspect a running Chrome instance in real-time. This is useful for debugging issues during manual testing.

**Workflow:**

1. **Start Chrome with remote debugging enabled:**

   ```bash
   npm run chrome:debug
   ```

   Or with a custom URL:

   ```bash
   ./scripts/start-chrome-debug.sh http://localhost:3000
   ```

   This launches Chrome with remote debugging on port 9222 (configurable via `CHROME_DEBUG_PORT` environment variable).

2. **Check if Chrome debug is already running** (optional):

   ```bash
   npm run chrome:debug:status
   ```

   Or directly:

   ```bash
   ./scripts/start-chrome-debug.sh --status
   ```

   The script tracks running instances and prevents starting multiple Chrome debug sessions on the same port.

3. **Test your application manually** in the Chrome window that opens.

4. **When you encounter an issue**, ask your AI assistant to help:

   - "Check the browser console for errors"
   - "What network requests failed?"
   - "Inspect the DOM state of element X"
   - "Show me performance metrics for the current page"
   - "What's in local storage?"

5. **AI assistants automatically connect** to the Chrome instance via the MCP server and can provide insights based on real browser state.

**Important notes:**

- Chrome must be started with the debug script BEFORE asking AI to inspect
- Uses a temporary Chrome profile (separate from your regular browsing)
- Close Chrome when done to stop exposing the remote debugging port
- Only use in development - never with production credentials or sensitive data

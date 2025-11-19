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

### Testing

For comprehensive testing guidance, refer to **`docs/testing/AI_AGENT_GUIDE.md`** which provides:

- Test type decision trees (unit, integration, API e2e, browser e2e)
- Test templates and quick reference
- Directory structure and file naming conventions
- Import patterns and best practices

**Quick Test Commands:**

- **Run admin unit tests:**

  ```bash
  nx run admin:test
  ```

- **Run admin unit tests with coverage:**

  ```bash
  nx run admin:test-coverage
  ```

- **Run admin browser e2e tests:**

  ```bash
  nx run admin:e2e
  ```

- **Run admin e2e tests in UI mode:**

  ```bash
  nx run admin:e2e-ui
  ```

- **Run server unit tests:**

  ```bash
  nx run server:test
  ```

- **Run server integration tests:**

  ```bash
  nx run server:test -- --testPathPattern=tests/integration
  ```

- **Run server API e2e tests:**
  ```bash
  nx run server:test-e2e
  ```

## 4. Available Custom Tools

The workspace provides custom OpenCode tools for common development tasks:

- **credentials** - Get test user credentials and application URLs from .env file

  - Returns structured JSON with test user and E2E user credentials
  - Includes application URLs (admin, server, Zitadel)
  - Provides usage guidance for manual testing with DevTools MCP
  - Usage: Simply ask "get test credentials" or "show me the credentials"

- **logs** - Retrieve recent log entries from application and dependency services

  - Retrieves last 50 lines from log files (configurable)
  - Supports filtering by service: "all", "admin", "web", "server", "api", "database", "postgres", "zitadel"
  - Returns both stdout (out.log) and stderr (error.log) for each service
  - Formatted output with clear service labels and separators
  - Usage examples:
    - "get all logs"
    - "show me server logs"
    - "what are the database logs?"
    - "show admin and server logs"
    - "get server logs with 100 lines"

- **open-browser** - Open browser with test credentials for manual testing
  - **Launches a separate browser instance** (Chromium preferred, Chrome fallback)
  - **Isolated from your regular browsing** - uses temporary profile with no cache
  - Launches with remote debugging enabled (port 9222)
  - Opens the admin app URL automatically (http://localhost:${ADMIN_PORT})
  - Displays TEST_USER credentials for easy login
  - Returns launch status and instructions for next steps
  - Usage examples:
    - "open the browser for testing"
    - "launch browser with test credentials"
    - "open browser"
  - Benefits:
    - Single command to start manual testing workflow
    - No interference with your regular Chrome browsing
    - No need to look up credentials manually
    - Browser is ready for DevTools MCP inspection
    - Consistent testing environment every time (no cache, fresh profile)
  - **Install Chromium (recommended):**
    ```bash
    brew install --cask chromium
    ```
    Chromium is preferred to avoid conflicts with your regular Chrome instance.

## 5. Available MCP Tools

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

## 6. Bug Reports and Improvement Suggestions

The workspace provides structured documentation for bugs and improvements to help track issues and enhancement ideas systematically.

### Bug Reports (`docs/bugs/`)

When you discover bugs or issues during development, testing, or while analyzing logs:

- **Create structured bug reports** using the template at `docs/bugs/TEMPLATE.md`
- **Naming convention:** `NNN-short-descriptive-title.md` (e.g., `001-zitadel-introspection-failures.md`)
- **Include:**
  - Severity level (Critical / High / Medium / Low)
  - Log excerpts with timestamps
  - Reproduction steps
  - Impact analysis
  - Proposed investigation steps or solutions

**When to create bug reports:**

- Errors in logs indicating system malfunction
- Failed tests or test suite issues
- Unexpected behavior during feature development
- Performance problems or resource issues
- Security vulnerabilities
- Configuration issues causing failures

**Quick reference:** See `docs/bugs/README.md` for complete guidelines and examples.

### Improvement Suggestions (`docs/improvements/`)

When you identify opportunities for enhancement:

- **Create structured improvement suggestions** using the template at `docs/improvements/TEMPLATE.md`
- **Naming convention:** `NNN-short-descriptive-title.md` (e.g., `001-add-request-caching.md`)
- **Categories:** Performance, Security, UX, Developer Experience, Architecture, Testing, Documentation
- **Include:**
  - Current state and limitations
  - Proposed improvement with benefits
  - Implementation approach
  - Alternatives considered
  - Success metrics

**When to create improvement suggestions:**

- Performance optimization opportunities
- Code quality or maintainability improvements
- User experience enhancements
- Developer experience improvements
- Architectural improvements
- Testing improvements
- Documentation gaps

**Quick reference:** See `docs/improvements/README.md` for complete guidelines.

**Note:** For major changes affecting architecture or APIs, create both an improvement suggestion and follow the OpenSpec process for formal change proposals.

---
description: 'Instructions for workspace management, including logging, process management, and running scripts.'
applyTo: '**'
---

# Coding Agent Instructions

This document provides instructions for interacting with the workspace, including logging, process management, and running scripts.

## 1. Logging

Logs are browsed using the **local-logs MCP server**. AI assistants can query logs directly using natural language.

### Log File Locations

Log files are stored in the `apps/logs/` directory.

- **Application logs:** `apps/logs/<serviceId>/out.log` (stdout) and `apps/logs/<serviceId>/error.log` (stderr)
- **Dependency logs:** `apps/logs/dependencies/<id>/out.log` and `apps/logs/dependencies/<id>/error.log`

### Available MCP Tools for Logs

The `local-logs` MCP server provides these tools:

| Tool                | Description                 | Example                                  |
| ------------------- | --------------------------- | ---------------------------------------- |
| `get_log_files`     | List available log files    | "What log files are available?"          |
| `tail_log`          | Get last N lines from a log | "Show last 50 lines from server/out.log" |
| `get_errors`        | Get recent error entries    | "Are there any errors?"                  |
| `get_server_status` | Server status from logs     | "What's the server status?"              |
| `search_logs`       | Search for text patterns    | "Search logs for 'database connection'"  |

### Example Log Queries

- "Check my server logs"
- "Are there any errors in the logs?"
- "Show me the last 100 lines from admin/error.log"
- "Search logs for 'TypeError'"
- "What log files are available?"

## 2. Process Management

Services are managed using PID-based process management through the workspace CLI.

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

- **Check status:**
  ```bash
  nx run workspace-cli:workspace:status
  ```

## 3. Running Scripts and Tests

All scripts and tests should be executed using `nx`. Note that commands for the `workspace-cli` project are prefixed with `workspace:`.

- **Run a specific script:**

  ```bash
  nx run <project>:<script>
  ```

  _(e.g., `nx run workspace-cli:workspace:status`)_

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

## 5. AI SDK Documentation

When working with Vercel AI SDK features, refer to the official documentation:

- **AI SDK Documentation:** https://ai-sdk.dev/llms.txt
- **Key Topics:**
  - `useChat` hook for chat interfaces
  - `streamText` for streaming responses
  - `DefaultChatTransport` for custom transports
  - AI SDK Core patterns and best practices
  - Tool calling and multi-modal support

**Important:** Always check the official AI SDK documentation for the latest API patterns and best practices.

## 6. Available MCP Tools

The workspace has several MCP (Model Context Protocol) servers configured for enhanced AI assistance:

- **Playwright** - Browser automation and testing
- **Postgres** - Database queries and inspection
- **Context7** - Documentation and context search
- **gh_grep** - GitHub code search across public repositories
- **react-daisyui Docs** - React DaisyUI component documentation
- **Chrome DevTools** - Browser debugging, performance profiling, network inspection, and DOM manipulation via Chrome DevTools Protocol (development/testing use only)
- **local-logs** - Log file browsing with tailing, search, and error tracking

### Using Chrome DevTools MCP

The Chrome DevTools MCP allows AI assistants to inspect a running Chrome/Chromium instance in real-time. This is useful for debugging issues during manual testing and observing user interactions.

**Workflow:**

1. **Start Chrome with remote debugging enabled:**

   ```bash
   npm run chrome:debug
   ```

   Or with a custom URL:

   ```bash
   ./scripts/start-chrome-debug.sh http://localhost:3000
   ```

   This launches Chrome/Chromium with remote debugging on port 9222 (configurable via `CHROME_DEBUG_PORT` environment variable).

2. **Check if Chrome debug is already running** (optional):

   ```bash
   npm run chrome:debug:status
   ```

   Or directly:

   ```bash
   ./scripts/start-chrome-debug.sh --status
   ```

   The script tracks running instances and prevents starting multiple Chrome debug sessions on the same port.

3. **Test your application manually** in the Chrome window that opens, or let the user demonstrate an issue.

4. **When you encounter an issue or need to observe**, ask your AI assistant to help:

   - "Check the browser console for errors"
   - "What network requests failed?"
   - "Inspect the DOM state of element X"
   - "Show me performance metrics for the current page"
   - "What's in local storage?"
   - "What tab is currently active? I want to show you something"
   - "List all open tabs in the browser"

5. **AI assistants automatically connect** to the Chrome instance via the MCP server and can provide insights based on real browser state.

**CRITICAL Safety Guidelines for AI Assistants:**

- ⚠️ **NEVER close the browser or quit Chrome/Chromium** - multiple users or processes may be sharing this instance
- ⚠️ **NEVER navigate the active tab** unless explicitly instructed - the user may be demonstrating something
- ⚠️ **DO create new tabs for your own interactions** - use `chrome-devtools_new_page` to open your own tab
- ⚠️ **DO check the active tab first** when user says "look at this" - use `chrome-devtools_list_pages` to see which tab is active
- ⚠️ **DO switch to your own tab** before performing actions - use `chrome-devtools_select_page` to switch tabs
- ⚠️ **DO take snapshots instead of screenshots** for better accessibility - use `chrome-devtools_take_snapshot` to get page structure
- ⚠️ **DO ask before making changes** - closing tabs, navigating, or interacting with forms should be confirmed first

**Tab Management Best Practices:**

1. **Checking Current State:**

   ```
   User: "Look at this modal, something's wrong"
   AI: Uses chrome-devtools_list_pages to see:
       - Page 0: "Documents | Admin" (active: true) ← User is here
       - Page 1: "Network Analysis" (active: false)
   AI: Uses chrome-devtools_take_snapshot to inspect the active tab
   ```

2. **Creating Your Own Tab:**

   ```
   User: "Can you test the login flow?"
   AI: Uses chrome-devtools_new_page with URL http://localhost:5176/login
       Creates new tab, automatically switches to it
       Now safe to interact without disrupting user
   ```

3. **Switching Between Tabs:**

   ```
   AI has tab 0 (user's work), tab 1 (AI's testing)
   - To observe user: chrome-devtools_select_page(0) then take snapshot
   - To continue testing: chrome-devtools_select_page(1) then interact
   ```

4. **Closing Tabs (Only Your Own):**
   ```
   AI: Uses chrome-devtools_close_page(1) to close own testing tab
   AI: NEVER closes page 0 or tabs created by user
   ```

**Observing User Demonstrations:**

When user says "let me show you" or "look at this":

1. **List pages** to identify which tab is active
2. **Take snapshot** of active tab (don't navigate away!)
3. **Ask clarifying questions** based on what you observe
4. **Wait for user** to perform actions, then re-snapshot to see changes
5. **Compare before/after** states to understand the issue

**Example Interactions:**

```
User: "I uploaded a document but it's not showing up"
AI:
  1. Lists pages → sees "Documents | Admin" is active
  2. Takes snapshot → sees documents table with 5 items
  3. Checks console → finds cache-related errors
  4. Checks network → sees 304 Not Modified response
  5. Reports findings with specific line numbers and timestamps

User: "Can you verify the extraction config saves correctly?"
AI:
  1. Creates new tab with chrome-devtools_new_page
  2. Navigates to Documents page in new tab
  3. Tests upload flow in isolation
  4. Verifies config in new tab
  5. Closes own tab when done (chrome-devtools_close_page)
  6. Never touches user's original tab
```

**Important Notes:**

- Chrome must be started with the debug script BEFORE asking AI to inspect
- Uses a temporary Chrome profile (separate from your regular browsing)
- Script prioritizes Chromium to avoid conflicts with regular Chrome usage
- Multiple tabs can coexist - user's work + AI's testing
- Closing the browser window closes ALL tabs for ALL users - never do this
- Only use in development - never with production credentials or sensitive data
- The browser stays open until manually closed or script is interrupted (Ctrl+C)

## 7. Bug Reports and Improvement Suggestions

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

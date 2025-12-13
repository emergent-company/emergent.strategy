---
description: 'Instructions for workspace management, including logging, process management, and running scripts.'
applyTo: '**'
---

# Coding Agent Instructions

This document provides instructions for interacting with the workspace, including logging, process management, and running scripts.

## 1. Logging

Logs are browsed using the **logs MCP server**. AI assistants can query logs directly using natural language.

### Log File Structure

Log files are stored in the root `logs/` directory, organized by service:

```
logs/
├── server/
│   ├── server.log          # Main server log (INFO+)
│   ├── server.error.log    # Server errors only
│   ├── server.debug.log    # Debug/verbose output (dev only)
│   ├── server.http.log     # HTTP request/response logs
│   ├── server.out.log      # Process stdout (from workspace-cli)
│   └── server.error.log    # Process stderr (from workspace-cli)
├── admin/
│   ├── admin.out.log       # Vite stdout (from workspace-cli)
│   ├── admin.error.log     # Vite stderr (from workspace-cli)
│   ├── admin.http.log      # HTTP proxy logs (from vite.config.ts)
│   └── admin.client.log    # Browser client logs (via /api/logs/client)
```

### Available MCP Tools for Logs

The `logs` MCP server provides these tools:

**Core Tools:**

| Tool             | Description                         | Example                                     |
| ---------------- | ----------------------------------- | ------------------------------------------- |
| `list_log_files` | List available log files with sizes | "What log files are available?"             |
| `tail_log`       | Get last N lines from a log file    | "Show last 50 lines from server/server.log" |
| `search_logs`    | Search for text patterns            | "Search logs for 'database connection'"     |
| `get_errors`     | Get recent error entries            | "Are there any errors?"                     |

**Service Aliases (convenience tools):**

| Tool               | Description               | Files Tailed                                                           |
| ------------------ | ------------------------- | ---------------------------------------------------------------------- |
| `tail_server_logs` | Tail backend server logs  | server/server.log, server/server.error.log                             |
| `tail_admin_logs`  | Tail frontend admin logs  | admin/admin.out.log, admin/admin.error.log, admin/admin.client.log     |
| `tail_app_logs`    | Tail main application log | server/server.log                                                      |
| `tail_debug_logs`  | Tail debug output         | server/server.debug.log                                                |
| `tail_error_logs`  | Tail all error logs       | server/server.error.log, admin/admin.error.log, admin/admin.client.log |
| `tail_http_logs`   | Tail HTTP traffic logs    | server/server.http.log, admin/admin.http.log                           |

### Example Log Queries

- "Check my server logs" (uses `tail_server_logs`)
- "Are there any errors in the logs?" (uses `get_errors`)
- "Show me the last 100 lines from server/server.log" (uses `tail_log`)
- "Search logs for 'TypeError'" (uses `search_logs`)
- "What log files are available?" (uses `list_log_files`)
- "Show me the admin frontend logs" (uses `tail_admin_logs`)
- "Show me HTTP traffic" (uses `tail_http_logs`)

## 2. Process Management

Services are managed using PID-based process management through the workspace CLI or the **Workspace MCP server**.

### Hot Reload (Default Behavior)

**Both the server and admin apps have hot reload enabled by default.** In most cases, you do NOT need to manually restart services:

- **Server (NestJS)**: Automatically recompiles and restarts when `.ts` files change
- **Admin (Vite)**: Instant HMR (Hot Module Replacement) for frontend changes

**When hot reload is sufficient:**

- Editing existing TypeScript files
- Modifying React components
- Changing styles or templates
- Updating configuration values in existing config files

**When you MUST restart:**

- Adding new NestJS modules or providers (dependency injection changes)
- Modifying `app.module.ts` imports
- Changing environment variables (requires restart to pick up new values)
- After `npm install` or `pnpm install` (new dependencies)
- If hot reload fails or the app gets into a bad state

### Restarting Services

**IMPORTANT:** Do NOT manually run build commands like `nx run server:build`. The workspace CLI handles building and running services correctly.

**Using Workspace MCP (Recommended):**

Ask the AI assistant:

- "Restart the server" → Uses `workspace_health_check` then restarts if needed
- "Restart all services"
- "Check if services are running"

**Using CLI commands:**

- **Restart all services:**

  ```bash
  nx run workspace-cli:workspace:restart
  ```

- **Start all services:**

  ```bash
  nx run workspace-cli:workspace:start
  ```

- **Stop all services:**

  ```bash
  nx run workspace-cli:workspace:stop
  ```

- **Check status:**
  ```bash
  nx run workspace-cli:workspace:status
  ```

### Common Mistakes to Avoid

| Wrong                                    | Right                                         |
| ---------------------------------------- | --------------------------------------------- |
| `nx run server:build` then manually run  | `nx run workspace-cli:workspace:restart`      |
| `cd /root/emergent && npm run start:dev` | Use workspace CLI - it manages logs and PIDs  |
| Killing processes with `kill -9`         | `nx run workspace-cli:workspace:stop`         |
| Running `nx serve server` directly       | Use workspace CLI for consistent log handling |

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
- **logs** - Log file browsing with tailing, search, and error tracking
- **Langfuse** - Browse AI coding assistant traces from Langfuse (list traces, get trace details, list sessions)
- **Langfuse Docs** - Official Langfuse documentation via MCP
- **Workspace** - Workspace health monitoring, Docker container logs, and environment configuration

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

### Using Langfuse MCP

The Langfuse MCP server allows AI assistants to browse traces from AI coding sessions (OpenCode, Cursor, etc.). This is useful for debugging AI interactions, analyzing conversation patterns, and reviewing costs.

**Available Tools:**

| Tool            | Description                | Example                            |
| --------------- | -------------------------- | ---------------------------------- |
| `list_traces`   | List traces with filtering | "Show recent traces from OpenCode" |
| `get_trace`     | Get full trace details     | "Get details for trace abc123"     |
| `list_sessions` | List sessions              | "What sessions are available?"     |

**Filtering Options for `list_traces`:**

- `name` - Filter by trace name (e.g., "opencode", "cursor")
- `userId` - Filter by user ID
- `sessionId` - Filter by session ID
- `tags` - Filter by tags array
- `fromTimestamp` / `toTimestamp` - Filter by time range (ISO 8601)
- `limit` - Number of results (default: 10, max: 100)
- `page` - Page number for pagination

**Example Queries:**

- "List recent AI coding traces"
- "Show traces from the last hour"
- "Get details for trace ID xyz"
- "What sessions have been recorded?"
- "Show traces tagged with 'debug'"

**Configuration:**

Requires environment variables:

- `LANGFUSE_HOST` - Langfuse API host (e.g., `https://cloud.langfuse.com`)
- `LANGFUSE_PUBLIC_KEY` - Public API key
- `LANGFUSE_SECRET_KEY` - Secret API key

### Langfuse Trace Types

All background job traces are tagged with a `traceType` for easy filtering in the Langfuse UI. The trace type is added both as a tag and in the metadata.

**Available Trace Types:**

| Trace Type        | Description                                           | Source                                                 |
| ----------------- | ----------------------------------------------------- | ------------------------------------------------------ |
| `extraction`      | Entity/relationship extraction jobs                   | `extraction-worker.service.ts`                         |
| `embedding`       | Graph object embedding jobs                           | `embedding-worker.service.ts`, `embeddings.service.ts` |
| `chunk-embedding` | Document chunk embedding jobs                         | `chunk-embedding-worker.service.ts`                    |
| `agent-{role}`    | Scheduled agent runs (e.g., `agent-merge-suggestion`) | `agent-scheduler.service.ts`                           |
| `cli-benchmark`   | CLI benchmark/comparison tools                        | `compare-*.cli.ts`                                     |
| `cli-analysis`    | CLI analysis tools                                    | `analyze-*.cli.ts`                                     |

**Filtering in Langfuse:**

1. **By Tag**: In the Langfuse UI, filter traces by tag (e.g., `extraction`, `embedding`)
2. **By Metadata**: Query traces where `metadata.traceType = 'extraction'`

**Example Queries:**

- "Show me all extraction traces" → Filter by tag `extraction`
- "Show embedding job traces from the last hour" → Filter by tag `embedding` + time range
- "Show agent runs" → Filter by tag containing `agent-`

**Adding New Trace Types:**

When creating new background jobs that use Langfuse tracing, pass the `traceType` parameter to `createJobTrace()`:

```typescript
const traceId = this.langfuseService.createJobTrace(
  jobId,
  { name: 'My Job', ...metadata },
  undefined, // environment (use default)
  'my-trace-type' // traceType for filtering
);
```

### Using Workspace MCP

The Workspace MCP server provides health monitoring and Docker container log querying for the development environment.

**Available Tools:**

| Tool              | Description                             | Example                         |
| ----------------- | --------------------------------------- | ------------------------------- |
| `get_status`      | Comprehensive workspace health overview | "What's the workspace status?"  |
| `list_services`   | List configured application services    | "What services are configured?" |
| `health_check`    | Check specific service or dependency    | "Is postgres healthy?"          |
| `get_config`      | View environment configuration          | "Show me the workspace config"  |
| `docker_logs`     | Query Docker container logs             | "Show postgres logs"            |
| `list_containers` | List running Docker containers          | "What containers are running?"  |

**`health_check` Targets:**

- Services: `admin`, `server`
- Dependencies: `postgres`, `zitadel`, `vertex`, `langfuse`, `langsmith`

**`docker_logs` Parameters:**

| Parameter   | Description                                | Example         |
| ----------- | ------------------------------------------ | --------------- |
| `container` | Container name or alias (required)         | `"postgres"`    |
| `lines`     | Number of lines to retrieve (default: 100) | `50`            |
| `since`     | Show logs since timestamp                  | `"10m"`, `"1h"` |
| `grep`      | Filter logs by pattern (case-insensitive)  | `"error"`       |

**Container Aliases:**

| Alias             | Container Name             |
| ----------------- | -------------------------- |
| `postgres`        | emergent-postgres          |
| `zitadel`         | zitadel-zitadel-1          |
| `langfuse`        | langfuse-langfuse-web-1    |
| `langfuse-worker` | langfuse-langfuse-worker-1 |
| `redis`           | langfuse-redis-1           |
| `clickhouse`      | langfuse-clickhouse-1      |
| `minio`           | langfuse-minio-1           |
| `nli-verifier`    | nli-verifier               |

**Example Queries:**

- "What's the workspace health status?"
- "Is the database running?"
- "Show me the last 50 lines of postgres logs"
- "Search zitadel logs for errors in the last hour"
- "What Docker containers are running?"
- "Show langfuse logs filtered by 'trace'"

**Environment Loading:**

The workspace MCP loads environment variables from multiple sources (later overrides earlier):

1. `emergent-infra/postgres/.env` - PostgreSQL credentials
2. `emergent-infra/zitadel/.env` and `.env.local` - Zitadel auth config
3. `emergent-infra/langfuse/.env` - Langfuse observability config
4. Workspace root `.env` and `.env.local` - Application overrides

Use `get_config` to see which env files were loaded and their values (secrets masked by default).

## 7. Database Queries

When using the Postgres MCP server to query the database, **always consult the schema context first** to avoid trial-and-error queries.

### Before Querying

1. **Read the schema context:** `docs/database/schema-context.md`
2. **Use schema-qualified table names:** Always prefix with schema (e.g., `kb.documents`, not `documents`)
3. **Check column names:** The schema context lists common columns and naming conventions

### Common Mistakes to Avoid

| Wrong                                         | Correct                                               |
| --------------------------------------------- | ----------------------------------------------------- |
| `SELECT * FROM extraction_jobs`               | `SELECT * FROM kb.object_extraction_jobs`             |
| `SELECT * FROM documents`                     | `SELECT * FROM kb.documents`                          |
| `SELECT * FROM users`                         | `SELECT * FROM core.user_profiles`                    |
| `SELECT error FROM kb.object_extraction_jobs` | `SELECT error_message FROM kb.object_extraction_jobs` |

### Database Schemas

- **`kb`** - Knowledge base data (documents, objects, relationships, jobs, chat)
- **`core`** - User management (profiles, emails)
- **`public`** - PostgreSQL extensions (pgvector)

### Quick Reference

For extraction job debugging:

```sql
-- Get job status
SELECT id, status, error_message, created_at, completed_at
FROM kb.object_extraction_jobs WHERE id = '<uuid>';

-- Get job logs
SELECT step_index, operation_type, status, message
FROM kb.object_extraction_logs WHERE extraction_job_id = '<uuid>'
ORDER BY step_index;
```

See `docs/database/schema-context.md` for complete table listings and query patterns.

## 8. Bug Reports and Improvement Suggestions

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

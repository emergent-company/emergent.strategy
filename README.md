# Spec Server

Minimal ingestion server aligned with the spec:
- Ingest a URL or uploaded file, extract text, chunk, embed with Google Gemini `text-embedding-004`.
- Store in Postgres with pgvector and FTS.

See `SETUP.md` for end-to-end local setup (DB, Zitadel auth, API server, Admin SPA) and `RUNBOOK.md` for operational details.

## Authentication

The system now uses only standard OIDC flows via Zitadel's hosted UI. Previous experimental Passkey / WebAuthn endpoints and helpers were removed (2025-09) to reduce surface area. The deprecated spec document (`docs/spec/15-passkey-auth.md`) is retained only as a short tombstone note. No passwordless-specific environment variables are required anymore.

### Authorization (Scopes)

Every protected endpoint enforces one or more OAuth-style scopes. Missing scopes yield `403` with body:

```
{
	"error": { "code": "forbidden", "message": "Forbidden", "missing_scopes": ["<scope>"] }
}
```

See `SECURITY_SCOPES.md` for the complete catalogue and mapping to endpoints. The generated OpenAPI (`apps/server-nest/openapi.yaml`) annotates each operation with `x-required-scopes`.

## Schema-Aware Chat (MCP Integration)

The chat system integrates with the Model Context Protocol (MCP) to provide intelligent, real-time schema information. When users ask questions about the database schema (version, changes, type definitions), the system automatically:

1. **Detects schema queries** using pattern matching
2. **Queries the database** via MCP tools (schema_version, schema_changelog, type_info)
3. **Injects context** into LLM prompts
4. **Streams responses** with accurate, up-to-date schema information

**Example User Experience:**

```
User: "What is the current schema version?"
System: [Shows "Querying schema version..." indicator]
AI: "The current schema version is 1.2.3, effective since October 15, 2025..."
```

**Configuration:**

```bash
# Enable/disable MCP integration (default: enabled)
CHAT_ENABLE_MCP=1

# MCP server URL (default: internal endpoint)
MCP_SERVER_URL=http://localhost:3001

# Request timeout (default: 30 seconds)
MCP_TIMEOUT=30000
```

**Documentation:**
- [Architecture Overview](docs/technical/MCP_CHAT_ARCHITECTURE.md) - System design and data flow
- [User Guide](docs/guides/MCP_CHAT_USER_GUIDE.md) - How to use schema-aware chat
- [Configuration Guide](docs/setup/MCP_CHAT_CONFIGURATION.md) - Deployment and administration
- [UI Integration](docs/features/MCP_CHAT_UI_INTEGRATION.md) - Frontend implementation details

**Features:**
- ✅ Automatic schema query detection
- ✅ Real-time database queries
- ✅ Graceful degradation (chat continues if MCP fails)
- ✅ Visual feedback ("Querying..." indicator)
- ✅ Full test coverage (unit + integration + E2E)

## Error Logging & Debugging

The system includes comprehensive error logging for both server and browser:

- **Server**: All 5xx errors automatically logged to `logs/errors.log` with full context (stack traces, user/org/project IDs, request details)
- **Browser**: Errors logged to localStorage (dev mode), accessible via `window.__errorLogs.printLogs()` in console

**Quick Start:**
```bash
# View recent server errors
tail -20 logs/errors.log | jq '.'

# Follow live errors
tail -f logs/errors.log | jq '.'
```

**Browser Console:**
```javascript
// View all captured errors
window.__errorLogs.printLogs()

// Download logs for sharing
window.__errorLogs.downloadLogs()
```

See `docs/technical/ERROR_LOGGING.md` for complete guide or `docs/guides/ERROR_LOGGING_QUICKREF.md` for quick reference.

## Workspace CLI (Automation)

Local automation is handled by the Workspace CLI (`workspace:*` npm scripts) that wraps Nx targets and PM2 process supervision. It provides lifecycle management for dependencies, application services, logging, and health checks.

See `QUICK_START_DEV.md` for a complete guide to starting, stopping, and managing services.

## Reference projects

We keep UI/UX reference code as Git submodules under `reference/` (read-only, no runtime imports).

- Add Nexus (once):
	- git submodule add -b master git@github.com:eyedea-io/Nexus-React-3.0.0.git reference/nexus
 - Add react-daisyui (once):
	- git submodule add -b main https://github.com/daisyui/react-daisyui.git reference/react-daisyui
- Initialize/update on fresh clones:
	- git submodule update --init --recursive
- Pull latest from upstream:
	- git -C reference/nexus pull origin master
 	- git -C reference/react-daisyui pull origin main

Never import from `reference/` at runtime. Copy patterns into `apps/admin/src/**` with strict TS and our lint/style.
When copying from `react-daisyui`, keep attribution headers and adapt to use our `useConfig` theming + Iconify Lucide icons.

## Changelog

See `CHANGELOG.md` for notable removals and additions.

## Documentation

All project documentation is located in the `/docs` directory, organized into the following categories:

- **/docs/setup**: Guides for setting up the project and its dependencies (Docker, Zitadel, etc.).
- **/docs/guides**: How-to guides and quick references for developers.
- **/docs/features**: Detailed documentation on specific features.
- **/docs/technical**: Deep dives into the architecture and technical implementation details.
- **/docs/archive**: Outdated or historical documents, such as status reports and old plans.

## Graph Search Pagination (Summary)
Bidirectional cursor pagination is supported for hybrid (lexical + vector) fused results. Each item carries an opaque Base64URL cursor. Requests accept:
```
pagination: { limit?: number; cursor?: string | null; direction?: 'forward' | 'backward' }
```
Server caps `limit` at 50 and echoes `meta.request.limit` plus `requested_limit`. Backward pages return items preceding the supplied cursor item (cursor item excluded) and reuse `nextCursor` to continue moving further backward. Ranks are per-request and may shift slightly; rely on item identity instead of cross-request rank comparisons.

See: `apps/server-nest/README.md` ("Graph Search Cursor Pagination Semantics") or the dedicated spec doc `docs/spec/graph-search-pagination.md` for full details.

## Graph Test Helper & Benchmark

Graph unit and service-level tests rely on a unified in-memory emulator at `apps/server-nest/tests/helpers/fake-graph-db.ts` documented in `apps/server-nest/tests/helpers/README.md`. When changing `GraphService` SQL patterns (DISTINCT ON head selection, history queries, search filtering) update the helper first so test failures clearly surface unsupported patterns.

Lightweight relationship throughput benchmark (create + patch cycles) can be run to spot gross regressions:

```
npm --prefix apps/server-nest run bench:graph:relationships
```

Output is JSON summarizing ops/sec and avg ms/op using the FakeGraphDb (not a substitute for real DB profiling).

Additional:
- Objects benchmark: `npm run bench:graph:objects` (create + patch objects)
- Strict emulator mode: pass `{ strict: true }` to `makeFakeGraphDb` in tests to have unmatched SQL throw immediately—useful when adding new GraphService queries.
- Traversal benchmark: `npm run bench:graph:traverse` (breadth-limited traversal performance)
- Query recording: use `{ recordQueries: true }` to assert sequence or count of generated SQL in tests.

## 1. OAuth Module

- [x] 1.1 Create `internal/auth/oauth.go` — GitHub OAuth 2.0 config struct, authorization URL builder, code-to-token exchange
- [x] 1.2 Create `internal/auth/session.go` — JWT issuance (sign with server secret), JWT validation, in-memory session map with LRU eviction
- [x] 1.3 Add OAuth configuration to `cmd/serve.go` — `--oauth-client-id`, `--oauth-client-secret`, `--session-secret`, `--session-ttl` flags and corresponding env vars (`EPF_OAUTH_CLIENT_ID`, `EPF_OAUTH_CLIENT_SECRET`, `EPF_SESSION_SECRET`, `EPF_SESSION_TTL`)
- [x] 1.4 Add `/auth/github/login` handler — redirect to GitHub OAuth with state parameter (CSRF protection)
- [x] 1.5 Add `/auth/github/callback` handler — exchange code, fetch user profile, create session, return JWT
- [x] 1.6 Add mode detection logic — auto-detect local/single-tenant/multi-tenant based on env vars
- [x] 1.7 Unit tests for OAuth flow (mock GitHub API responses)
- [x] 1.8 Unit tests for session management (JWT roundtrip, LRU eviction, expiry)

## 2. Bearer Token Middleware

- [x] 2.1 Add bearer token middleware to `internal/transport/http.go` — extract JWT from `Authorization` header, validate, inject user context
- [x] 2.2 Add conditional auth enforcement — require bearer auth in multi-tenant mode, pass through in single-tenant/local mode
- [x] 2.3 Add user context propagation — make authenticated user available to MCP tool handlers via request context
- [x] 2.4 Integration tests for auth middleware (valid token, expired token, missing token, single-tenant passthrough)

## 3. Access Control and Dynamic Instance Routing

- [x] 3.1 Create `internal/auth/access.go` — verify user has read access to a GitHub repo (via GitHub API), with per-user per-repo cache (5-min TTL)
- [x] 3.2 Modify `internal/source/` — add multi-instance source manager that creates/caches `CachedSource` per `owner/repo/path`
- [x] 3.3 Modify `internal/mcp/cache.go` — update `RegisterStrategyStore` and source resolution to support dynamic per-request instance routing
- [x] 3.4 Add `instance_path` resolution logic — parse `owner/repo` or `owner/repo/subpath` format, distinguish from filesystem paths
- [x] 3.5 Wire access control into source resolution — check user access before loading or returning cached instance data
- [x] 3.6 Add instance cache eviction — LRU eviction for loaded instances when memory pressure is detected
- [x] 3.7 Integration tests for multi-instance routing (two users, two repos, access granted/denied, shared cache)

## 4. Workspace Discovery

- [x] 4.1 Create `internal/workspace/discovery.go` — list user repos via GitHub API, filter for `_epf.yaml` presence, extract product metadata
- [x] 4.2 Add `/workspaces` HTTP endpoint — return JSON list of user-accessible EPF instances
- [x] 4.3 Add `epf_list_workspaces` MCP tool — expose workspace discovery to AI agents
- [x] 4.4 Add per-user discovery cache (10-min TTL)
- [x] 4.5 Unit tests for workspace discovery (mock GitHub repo listing and contents API)
- [x] 4.6 Integration tests for `/workspaces` endpoint (authenticated, unauthenticated, no EPF repos)

## 5. Configuration and Documentation

- [x] 5.1 Update `.env.example` with new OAuth environment variables and mode documentation
- [x] 5.2 Update `Dockerfile` and `docker-compose.yaml` for multi-tenant deployment
- [x] 5.3 Update `apps/epf-cli/AGENTS.md` with multi-tenant mode documentation
- [x] 5.4 Add OAuth App setup documentation (GitHub OAuth App registration steps)

## 6. End-to-End Validation

- [x] 6.1 Manual test: local mode unchanged (no OAuth config, stdio transport)
- [x] 6.2 Manual test: single-tenant mode unchanged (GitHub App config, no OAuth)
- [x] 6.3 Manual test: multi-tenant mode with OAuth login, workspace discovery, and multi-repo tool calls
- [x] 6.4 Run full test suite: `cd apps/epf-cli && go test ./...`

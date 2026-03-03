## Context

The EPF Cloud Server (Stage 1) is a single-tenant deployment where one Cloud Run container serves one EPF instance. Authentication is handled by Cloud Run IAM — there is no user identity in the server. The GitHub App provides server-to-server auth for fetching artifacts from private repos.

Stage 2 evolves this into a multi-tenant platform where users authenticate with GitHub, discover their EPF workspaces, and dynamically route MCP tool calls to the correct repository. The key challenge is composing GitHub OAuth (user identity + repo permissions) with the existing GitHub App (server-to-server repo access) without breaking the single-tenant deployment mode.

### Stakeholders

- **AI agent users** — need per-project workspace scoping via `instance_path` in MCP config
- **Team leads** — want to see which repos have EPF instances across their org
- **Platform operator** — deploys and configures the OAuth + GitHub App credentials
- **Solo founders** — self-host for their own repos, minimal config

## Goals / Non-Goals

### Goals

- Users authenticate via GitHub OAuth and get a session (bearer token)
- Users can discover which of their accessible repos contain EPF instances
- MCP tool calls are dynamically routed to the user's authorized repository
- GitHub App is an optional accelerator (better rate limits) but not required
- Single-tenant mode (no OAuth, env var config) continues to work unchanged
- Access control is enforced — users can only query repos they can access on GitHub

### Non-Goals (this change)

- Web UI / dashboard — MCP protocol only (web UI is a separate concern)
- Subscription billing — out of scope, separate change for `kr-p-008`
- Write-back operations — server remains read-only
- Multi-org federation — users access repos within their own GitHub account/orgs
- Persistent user profiles / preferences — stateless per-session

## Decisions

### GitHub OAuth + GitHub App Hybrid Auth Model

**Decision**: Use GitHub OAuth 2.0 for user identity and repo discovery. Retain GitHub App as an optional accelerator for orgs that install it.

**Why**: OAuth provides user identity (who is this person?) and permission discovery (what repos can they access?). The GitHub App provides better rate limits (5,000/hr vs 5,000/hr per user) and org-wide installation without per-user setup. When both are configured, the server uses the GitHub App's installation token for repo access (better rate limits) and the user's OAuth token only for permission verification.

**Flow**:
1. User visits `/auth/github/login` — redirects to GitHub OAuth consent
2. GitHub redirects back with auth code — server exchanges for access token
3. Server creates a session (signed JWT or opaque token) containing: GitHub user ID, username, access token (encrypted)
4. MCP client includes session token as bearer auth on subsequent requests
5. On each tool call, server verifies user has access to the requested repo (via GitHub API or cached permissions)
6. If GitHub App is installed on the repo's org, use App installation token for artifact fetching (better rate limits). Otherwise, use user's OAuth token.

**Alternatives considered**:
- OAuth only (no GitHub App) — works but lower rate limits, user token used for everything
- GitHub App only (no OAuth) — no user identity, can't do workspace discovery or access control
- Third-party auth (Auth0, Clerk) — unnecessary dependency, GitHub is the natural identity provider for a developer tool

### Session Management: Signed JWT with OAuth Token Envelope

**Decision**: Issue a signed JWT on successful OAuth callback. The JWT contains the GitHub user ID, username, and expiry. The OAuth access token is stored server-side (in-memory map keyed by session ID) — not embedded in the JWT.

**Why**: JWTs are stateless for identity verification (the server can validate the signature without a database lookup). But GitHub OAuth tokens are sensitive and should not be sent to the client. Storing the OAuth token server-side also allows the server to revoke sessions by clearing the map entry.

**Trade-off**: This means the server is no longer fully stateless — it holds a session map in memory. On Cloud Run, this means sessions are lost when instances scale down. Acceptable for Stage 2 — users re-authenticate on cold start. A Redis/Memorystore session store can be added later if session persistence matters.

**Token lifecycle**:
- JWT expiry: 24 hours (configurable via `EPF_SESSION_TTL`)
- OAuth token: lives as long as the session (GitHub OAuth tokens don't expire unless revoked)
- Session map: bounded to max 10,000 entries with LRU eviction

### Dynamic Instance Routing via `instance_path`

**Decision**: The `instance_path` parameter on every MCP tool already identifies which EPF instance to query. In multi-tenant mode, the server resolves `instance_path` to a GitHub repository, verifies the authenticated user has access, and loads the instance dynamically.

**Why**: The `instance_path` convention is already established across all 79 MCP tools. Users configure it per-project in their AI tool's MCP config (e.g., `"instance_path": "emergent-company/emergent-epf"`). No protocol changes needed.

**Resolution rules**:
1. If `instance_path` looks like `owner/repo` or `owner/repo/path/to/instance` — treat as GitHub repo reference
2. If `instance_path` is a local filesystem path — use FileSystemSource (local mode only)
3. If `instance_path` is omitted — use the server's default instance (if configured)

**Caching**: Each resolved instance gets its own `CachedSource` (the existing caching layer). The cache is keyed by `owner/repo/path`. When a user first requests an instance, it's loaded and cached. Subsequent requests (even from different users) reuse the cached instance if it hasn't expired. Access control is checked per-request, but artifact loading is shared.

### Workspace Discovery via GitHub API

**Decision**: Implement a `/workspaces` endpoint (and corresponding MCP tool) that lists repos accessible to the authenticated user that contain EPF instances.

**Why**: Users need to know which repos have EPF instances before they can configure `instance_path`. Discovery uses the GitHub API to list the user's repos and checks for the presence of `_epf.yaml` anchor files.

**Implementation**:
1. List user's repos via GitHub API (`GET /user/repos` with pagination)
2. For each repo, check if it contains `_epf.yaml` (via Contents API, or tree API for efficiency)
3. Cache discovery results per-user with 10-minute TTL
4. Return list of `{ owner, repo, instance_path, product_name }` objects

**Rate limit concern**: Scanning many repos is expensive. Mitigations:
- Use GitHub App installation token when available (higher rate limits)
- Cache discovery results aggressively (10-minute TTL)
- Paginate user repos with reasonable limits (first 100 repos)
- Use the Git Tree API to check for `_epf.yaml` in one call per repo instead of multiple Contents API calls

### Backward-Compatible Mode Detection

**Decision**: The server auto-detects its mode based on configuration:
- If `EPF_OAUTH_CLIENT_ID` is set → multi-tenant mode (OAuth enabled)
- If only `EPF_GITHUB_OWNER` + `EPF_GITHUB_REPO` are set → single-tenant mode (existing behavior)
- If neither → local mode (filesystem source, stdio transport)

**Why**: Existing deployments continue to work without config changes. Multi-tenant is purely opt-in by adding OAuth credentials.

## Risks / Trade-offs

- **Session loss on scale-down** → Cloud Run instances lose in-memory session maps when scaling to zero. Users must re-authenticate. Acceptable for Stage 2. Add Redis session store later if needed.
- **GitHub API rate limits for discovery** → Workspace discovery scans user repos. Mitigated by aggressive caching (10-min TTL) and GitHub App tokens where available. Worst case: 100 repos × 1 API call = 100 calls per discovery.
- **OAuth token security** → OAuth tokens are stored server-side in memory, never sent to the client. JWTs are signed with a server secret. If the server secret leaks, sessions can be forged. Use a strong secret and rotate periodically.
- **Multi-instance cache memory** → Each loaded instance consumes ~1-5MB of cached artifacts. With 50 active instances, that's 50-250MB. Cloud Run instances can be configured with sufficient memory (512MB-1GB). Add cache eviction (LRU by instance) if memory pressure emerges.
- **Cold start with OAuth** → First request after scale-to-zero requires full OAuth flow. The JWT validation itself is fast (no external call), but if the session map is empty, the user must re-authenticate. Consider storing session state in a lightweight external store (Cloud Run Volume Mount + tmpfs is not persistent across instances).

## Migration Plan

### Phase 1: OAuth Module

1. Create `internal/auth/oauth.go` — GitHub OAuth 2.0 flow (authorization URL, code exchange, token storage)
2. Create `internal/auth/session.go` — JWT issuance, validation, session map
3. Add OAuth config to `serve` command (`--oauth-client-id`, `--oauth-client-secret`, or env vars)
4. Add `/auth/github/login` and `/auth/github/callback` HTTP handlers
5. Unit tests for OAuth flow (mock GitHub responses)

### Phase 2: Bearer Token Middleware

1. Add bearer token middleware to HTTPS transport — extract JWT from `Authorization` header
2. Mode detection: if OAuth is configured, require bearer auth on all MCP endpoints; if not, pass through (single-tenant mode)
3. Inject authenticated user context into MCP tool handlers
4. Integration tests for auth middleware

### Phase 3: Access Control + Dynamic Routing

1. Add user-repo access verification — check if authenticated user can access the requested `instance_path` repo via GitHub API
2. Cache access check results per-user per-repo (5-minute TTL)
3. Modify `SourceStore` to dynamically create/cache `CachedSource` per `owner/repo`
4. Remove single-instance constraint when in multi-tenant mode
5. Integration tests for multi-instance routing

### Phase 4: Workspace Discovery

1. Add `/workspaces` endpoint listing user-accessible EPF instances
2. Add `epf_list_workspaces` MCP tool for AI agent discovery
3. Implement repo scanning for `_epf.yaml` anchor files
4. Cache discovery results per-user
5. End-to-end tests for workspace discovery

## Open Questions

- **Session persistence**: Should we add Redis/Memorystore for session persistence across Cloud Run instances, or accept re-authentication on cold start for Stage 2?
- **GitHub App installation flow**: Should the server provide a UI for installing the GitHub App on new orgs, or rely on manual installation via GitHub settings?
- **Org-level vs repo-level access**: Should workspace discovery list repos individually, or group by org with org-level access grants?

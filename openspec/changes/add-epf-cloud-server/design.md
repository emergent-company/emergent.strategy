## Context

The EPF CLI today is a standalone binary that reads YAML files from the local filesystem. The MCP server mode (`epf-cli serve`) communicates via stdio. To serve remote AI agents and enable team-wide access, we need:

1. A way to load EPF artifacts from GitHub repositories (not just local disk)
2. An HTTP/SSE transport layer for remote MCP clients
3. Cloud hosting on GCP Cloud Run (scales to zero, serverless)
4. Centralized auth via GitHub App (no individual PATs)

### Stakeholders

- **AI agent users** — Claude Desktop, Cursor, web-based MCP clients
- **Team members** — access product strategy without local repo clones
- **Ops** — infrastructure provisioning and secret management

## Goals / Non-Goals

### Goals

- Serve the existing 50+ MCP tools over HTTP/SSE to remote clients
- Load EPF artifacts from GitHub repos at runtime (hotloading)
- Cache artifacts in-memory with configurable TTL
- Run on GCP Cloud Run with scale-to-zero economics
- Authenticate via GitHub App for private repo access
- Preserve all existing local CLI behavior unchanged

### Non-Goals (v1)

- Multi-tenant isolation (single-org deployment for now)
- Persistent storage / database (v1 is stateless — artifacts live in GitHub. Persistent storage for AIM metrics and monitoring state is a future concern; see `add-aim-recalibration-engine` Phase 3S)
- Custom UI / dashboard (v1 is MCP protocol only. AIM health dashboards are a future concern)
- Write-back operations (v1 is read-only strategy queries. AIM write-back tools run locally via CLI; server-side write support is a future extension)
- WebSocket transport (SSE only for cloud mode)

## Decisions

### RepositoryProvider interface with fs.FS abstraction

**Decision**: Abstract data access behind Go's `fs.FS` interface so all existing code works unchanged.

**Why**: The CLI already uses `os.ReadFile` and `filepath.Walk` patterns. Wrapping GitHub API responses as `fs.FS` means zero changes to existing query logic — only the data source layer changes.

**Alternatives considered**:
- Direct GitHub API calls in each handler — too invasive, breaks local mode
- Git clone to temp directory — simpler but slow, no partial loading, disk I/O on Cloud Run

### GitHub App for authentication (not PATs)

**Decision**: Create an EPF GitHub App that repository owners install for access.

**Why**: Personal Access Tokens are tied to individuals, expire, and create security risks. A GitHub App provides:
- Org-scoped installation (one install per org/repo)
- Auto-rotating installation tokens (1-hour TTL)
- Fine-grained permissions (read-only contents access)
- No individual user tokens needed

**Alternatives considered**:
- OAuth App — requires per-user auth flow, wrong model for server-to-server
- Deploy keys — per-repo, can't span multiple repos
- PAT stored in Secret Manager — security risk, rotation burden

### SSE transport for cloud mode (no WebSocket)

**Decision**: Use HTTP/SSE (Server-Sent Events) as the only remote transport.

**Why**: MCP protocol specifies SSE as the standard transport for remote servers. SSE is:
- Natively supported by Cloud Run (no sticky sessions needed)
- Simpler than WebSocket (HTTP/1.1 compatible, no upgrade dance)
- Sufficient for request-response MCP patterns
- Supported by all major MCP clients

### GCP Cloud Run (not GKE, not App Engine)

**Decision**: Deploy as a Cloud Run service.

**Why**: 
- Scales to zero when no requests — minimal cost for low-usage periods
- No cluster management overhead (vs. GKE)
- Container-based (standard Docker) — portable
- Built-in HTTPS, load balancing, IAM integration
- Secret Manager integration for GitHub App private key

**Alternatives considered**:
- GKE — overkill for single container, management overhead
- App Engine — less control over runtime, vendor lock-in
- AWS Lambda — team is on GCP, cold start concerns with Go binary size
- Self-hosted VM — no auto-scaling, maintenance burden

### Singleflight caching with TTL

**Decision**: Use `golang.org/x/sync/singleflight` for cache population, TTL-based expiry with background refresh.

**Why**: Multiple concurrent MCP tool calls may request the same EPF artifact. Singleflight ensures only one GitHub API call is made per artifact, with results shared across waiters. Background refresh prevents cache stampedes on expiry.

## Risks / Trade-offs

- **GitHub API rate limits** -> Mitigated by aggressive caching (5-minute default TTL) and Singleflight deduplication. GitHub App installation tokens get 5,000 requests/hour.
- **Cold start latency** -> Go binaries start fast (~100ms). First request after scale-to-zero triggers cache warming, which may add 1-2s. Consider preloading the default instance.
- **Secret rotation** -> GitHub App private key in Secret Manager. Key rotation requires Secret Manager version update + Cloud Run redeploy. Automate via GCP workflows.
- **Stale cache** -> 5-minute TTL means changes to EPF artifacts in GitHub take up to 5 minutes to propagate. Acceptable for strategy data which changes infrequently. Can add webhook-based cache invalidation later.

## Migration Plan

### Phase 1: RepositoryProvider abstraction (code only, no infra)

1. Create `internal/source/` package with `Source` interface
2. Implement `FileSystemSource` wrapping existing `os.ReadFile` patterns
3. Implement `GitHubSource` using GitHub Contents API + fs.FS
4. Wire up existing MCP handlers to use `Source` interface
5. All existing tests pass — local behavior unchanged

### Phase 2: HTTP/SSE transport

1. Add `--http` flag to `serve` command
2. Implement SSE transport alongside existing stdio
3. Add CORS configuration for web-based MCP clients
4. Health check endpoint at `/health`

### Phase 3: GitHub App authentication

1. Create EPF GitHub App in GitHub org settings
2. Implement JWT signing + installation token exchange in `internal/auth/`
3. Store private key in GCP Secret Manager
4. Wire up `GitHubSource` to use App installation tokens

### Phase 4: GCP Cloud Run deployment

1. Multi-stage Dockerfile (build + runtime)
2. Artifact Registry for image storage
3. Cloud Run service configuration
4. CI/CD workflow for automated deployments on merge to main

## Resolved Questions

### One EPF instance per deployment

Each Cloud Run service loads a single EPF instance from one GitHub repository. To serve a different instance, deploy another Cloud Run service. This keeps routing simple and avoids multiplying cache/API usage. The `instance_path` parameter in MCP tools maps to the single loaded instance.

### Cloud Run IAM for client authentication

No auth code in the server. Cloud Run is deployed with `--no-allow-unauthenticated`, so only callers with the `roles/run.invoker` IAM role can reach it. AI agents and service accounts attach Google identity tokens. Team members can access via Identity-Aware Proxy (IAP) with Google sign-in. If MCP client compatibility becomes a friction point, an API key fallback can be added later.

### TTL-only cache invalidation (no webhook)

Cache entries expire based on TTL (default 5 minutes). No GitHub webhook endpoint for push-based invalidation. Strategy data changes infrequently, so 5-minute propagation delay is acceptable. This avoids webhook secret management and additional code. Can be revisited if near-instant propagation becomes a requirement.

### Cloud Run default monitoring

Use Cloud Run's built-in metrics (request latency, error rates, instance count, memory/CPU). No custom metrics at launch. Add structured logging and custom metrics (cache hit rate, GitHub API calls) later if operational visibility gaps emerge.

## Architectural Evolution: Relationship to Other Changes

This change builds the **read-only cloud transport layer** for the EPF MCP server. Two downstream changes depend on it and will extend its scope:

```
add-epf-cloud-server (this change)
  │ v1: Stateless read-only MCP over HTTP/SSE
  │     Source: GitHub API → CachedSource → existing MCP handlers
  │     Deployment: Cloud Run (scale-to-zero)
  │
  ├──► add-aim-recalibration-engine Phase 3S (server-deferred)
  │     Extends with: persistent metric storage, monitoring state,
  │     webhook receivers for external systems (ClickUp, GitHub CI),
  │     AIM health dashboard API
  │     Decision: CLI Go packages imported as library for validation
  │
  └──► add-emergent-ai-strategy (depends on this)
        Uses as: MCP context server for AI agent sessions
        Dynamically attached to OpenCode sessions via POST /mcp
        Agent queries existing strategy before writing artifacts
```

**Key architectural constraint from `add-aim-recalibration-engine` Decision #9:** The EPF CLI remains a stateless analysis engine. Stateful concerns (metric time-series, monitoring state, dashboards) belong in a server component. This change builds the foundation for that server. The stateful extensions are scoped in Phase 3S of the AIM change and will either extend this server or be implemented as a companion service in the `emergent` repo — that decision is deferred until this v1 is operational.

**What this means for this change:** Build it as designed (stateless, read-only, GitHub-sourced). The architecture accommodates future write-side and stateful extensions without rework — the `Source` interface, HTTP/SSE transport, and Cloud Run deployment are all reusable infrastructure.

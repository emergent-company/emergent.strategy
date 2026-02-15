## Context

The EPF CLI is a single Go binary with embedded framework artifacts (schemas, templates, wizards, generators). It currently has zero distribution infrastructure — no CI, no releases, no install path. We're planning to extend it into a cloud service that can hot-load EPF instances from GitHub, serve as both MCP and HTTP API, and eventually evolve into a multi-tenant SaaS platform with agent-driven document engineering capabilities.

### Evolution Arc

1. **Local mode** (today) — CLI + MCP on local repos
2. **Cloud server mode** (Phases 4-5) — Serves remote instances via MCP/HTTP on GCP Cloud Run
3. **SaaS platform mode** (Phase 6) — Multi-tenant agent service with OpenCode as the writing agent, ACP for client communication

### Constraints

- Repo is **private now, public later** — GitHub Releases work for org members; Homebrew tap needs a separate public repo or private tap with token auth
- Embedded artifacts require `canonical-epf` sync at build time — GoReleaser must handle this
- Cloud mode must work with both public and private GitHub repos
- MCP protocol is stdio-based locally but needs SSE transport for cloud
- GCP Cloud Run is the primary deployment target (scales to zero, serverless)
- Agent engine (OpenCode initially) should be swappable via ACP abstraction

### Architecture Diagram

```
                    ┌─────────────────────────────┐
                    │       EPF CLI Binary          │
                    │  (embedded schemas/templates) │
                    └──────────┬──────────────────┘
                               │
                    ┌──────────▼──────────────────┐
                    │      Instance Source          │
                    │  (filesystem | github | url)  │
                    └──────────┬──────────────────┘
                               │
              ┌────────────────┼────────────────────┐
              │                │                     │
     ┌────────▼──────┐  ┌─────▼───────┐   ┌────────▼──────┐
     │  CLI Commands  │  │  MCP Server  │   │  HTTP API     │
     │  (interactive) │  │  (stdio/sse) │   │  (REST/JSON)  │
     └───────────────┘  └─────────────┘   └───────────────┘
```

**Cloud Deployment (Phase 5):**
```
┌─────────────────────────────────────────────────┐
│                  GCP Cloud Run                   │
│  ┌───────────────────────────────────────────┐  │
│  │         EPF CLI Container (Go)             │  │
│  │  ┌─────────┐  ┌─────────┐  ┌──────────┐  │  │
│  │  │MCP (SSE)│  │HTTP API │  │HealthChk │  │  │
│  │  └────┬────┘  └────┬────┘  └──────────┘  │  │
│  │       └──────┬──────┘                      │  │
│  │       ┌──────▼──────┐                      │  │
│  │       │InstanceSource│──► GitHub API        │  │
│  │       │  + Cache     │    (via GitHub App)  │  │
│  │       │  + Singleflt │                      │  │
│  │       └─────────────┘                      │  │
│  └───────────────────────────────────────────┘  │
│          │                                       │
│  ┌───────▼──────────────────┐                   │
│  │  GCP Secret Manager       │                   │
│  │  (GitHub App private key) │                   │
│  └──────────────────────────┘                   │
└─────────────────────────────────────────────────┘
```

**SaaS Platform (Phase 6 — future vision):**
```
┌────────────────────────────────────────────────────┐
│              SaaS Platform (GCP)                    │
│                                                     │
│  ┌──────────────┐  ┌─────────────────────────┐     │
│  │  Orchestrator │  │  Agent Pool              │     │
│  │  (Go service) │  │  (Headless OpenCode      │     │
│  │  - Auth/Login │  │   or equivalent engine)  │     │
│  │  - Routing    │  │  - EPF read/write/audit  │     │
│  │  - Quotas     │  │  - Per-tenant isolation   │     │
│  └──────┬───────┘  └──────────┬──────────────┘     │
│         │         ACP          │                     │
│         └──────────┼───────────┘                     │
│                    │                                  │
│  ┌─────────────────▼──────────────────────────────┐ │
│  │  Tenant Storage (GCS per-client volumes)        │ │
│  └─────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────┘
```

### Key Decisions

**1. GoReleaser over custom scripts**
- Handles cross-compilation, checksums, changelog, GitHub Release creation, Homebrew formula generation in one tool
- Well-supported in GitHub Actions
- Alternative: manual `make release` + `gh release create` — more fragile, more maintenance

**2. Homebrew tap in separate repo**
- GoReleaser generates the formula and pushes to `emergent-company/homebrew-tap`
- Works for private repos with `HOMEBREW_GITHUB_API_TOKEN`
- When repo goes public, tap just works without changes
- Alternative: distribute via `go install` — doesn't work because embedded artifacts need the sync step

**3. Instance Source interface over direct filesystem access**
- Allows the same validation/health/generation code to work against local dirs, GitHub repos, or URLs
- Caching layer sits between Source and consumers — remote sources get local cache with configurable TTL
- Alternative: separate "cloud CLI" binary — doubles maintenance, diverges features

**4. HTTP API alongside MCP, not replacing it**
- MCP stays the primary AI agent interface (stdio locally, SSE/streamable-http for cloud)
- HTTP API serves traditional integrations (CI/CD checks, dashboards, webhooks)
- Both share the same core logic
- Alternative: MCP-only — limits integration to MCP-capable clients

**5. Docker image for cloud deployment**
- Lightweight image based on the static Go binary
- No runtime dependencies
- Configurable via environment variables (GitHub token, instance source, ports)
- Alternative: deploy as Lambda/Cloud Function — more complex, state management harder

### Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Private repo complicates Homebrew | Use token-authenticated tap; goes away when repo becomes public |
| GoReleaser config complexity | Start minimal (binaries + checksums), add Homebrew/Docker incrementally |
| Remote instance latency | Aggressive caching with configurable TTL, background refresh, Singleflight |
| GitHub API rate limits | Authenticated requests (5000/hr), cache aggressively, use conditional requests (ETags) |
| Embedded artifact sync in CI | Cache `canonical-epf` in GitHub Actions, sync as build step before GoReleaser |
| GitHub App key management | Store private key in GCP Secret Manager, rotate periodically |
| Agent engine lock-in | ACP abstraction layer allows swapping OpenCode for another engine |
| SaaS multi-tenancy complexity | Start with single-tenant cloud mode (Phase 5), add isolation incrementally |

### Resolved Decisions

**6. HTTP API as a flag on `serve`, not a separate command or binary**
- `epf-cli serve --http :8080` enables the HTTP API alongside MCP
- One binary, one command, flags control active transports
- Simplest to operate and deploy — no confusion about which binary to run
- Alternatives rejected: separate subcommand (unnecessary separation), separate binary (doubles maintenance)

**7. SSE only for cloud MCP transport (no WebSocket)**
- SSE is in the MCP spec, simpler to implement, works through proxies and load balancers
- Most MCP clients already support SSE
- WebSocket is not in the MCP spec and harder to deploy behind reverse proxies
- Can revisit if a concrete need for bidirectional streaming arises

**8. Smart update detection — adapts to install method**
- `epf-cli update` detects how it was installed
- If installed via Homebrew: prints `brew upgrade epf-cli` instead of self-replacing
- If standalone binary: downloads latest from GitHub Releases and replaces in-place (with backup)
- Avoids confusing Homebrew's package state while still supporting direct installs

**9. TTL with background refresh for remote instance caching**
- Cached instances served immediately if within TTL (default 15 minutes)
- Background goroutine refreshes stale cache — no user-facing latency on refresh
- Simple, predictable, low-latency
- Alternatives rejected: blocking TTL (occasional slow requests), ETags-only (more complex for marginal gain)

**10. GitHub App model for cloud authentication (not personal access tokens)**
- Cloud deployment uses a GitHub App installed on target repos, not individual user tokens
- Server generates short-lived Installation Access Tokens from its private key
- Private key stored in GCP Secret Manager, fetched at runtime
- Benefits: no user credentials on the server, fine-grained repo permissions, token rotation built-in
- Personal token auth (`GITHUB_TOKEN`) retained as fallback for local/dev use

**11. Singleflight pattern for cache population**
- When multiple concurrent requests need the same uncached instance, only one GitHub API call is made
- Uses `golang.org/x/sync/singleflight` — other callers wait for the first to complete
- Prevents thundering herd on popular instances
- Complements TTL caching: Singleflight handles cold cache, TTL handles warm cache

**12. GCP Cloud Run as primary cloud deployment target**
- Serverless, scales to zero when no requests — optimal for cost
- Managed HTTPS, load balancing, auto-scaling out of the box
- Container-based — same Docker image works locally and in production
- Secret Manager integration for GitHub App credentials
- Artifact Registry for private Docker image storage
- Alternatives considered: fly.io (simpler but less GCP ecosystem integration), AWS Lambda (cold starts, complexity), Railway (less control)

**13. ACP (Agent Client Protocol) for SaaS client communication**
- ACP provides a standard frontend-to-backend protocol for agent interactions
- Decouples the agent engine (OpenCode) from client implementation
- Allows swapping OpenCode for another engine without changing the frontend or API
- MCP stays as the AI-to-tools protocol; ACP is the user-to-agent protocol

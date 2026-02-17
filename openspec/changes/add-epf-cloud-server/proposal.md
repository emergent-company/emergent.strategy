# Change: Add EPF Cloud Server

## Why

The EPF CLI currently runs only on local machines, requiring users to build from source or install via Homebrew. To enable remote AI agents (Claude Desktop, Cursor, web-based tools) and team-wide access to product strategy, the EPF MCP server needs to run as a cloud service that dynamically loads EPF artifacts from GitHub repositories.

## What Changes

- **BREAKING**: The `epf-strategy-server` spec gains cloud-mode requirements alongside the existing local filesystem mode
- Add `RepositoryProvider` interface to abstract filesystem vs GitHub API data sources
- Add GitHub App authentication for cross-repository access without individual PATs
- Add in-memory caching with Singleflight for efficient GitHub API usage
- Add HTTP/SSE transport for remote MCP clients (alongside existing stdio)
- Add Docker containerization targeting GCP Cloud Run
- Add GCP infrastructure: Artifact Registry, Cloud Run, Secret Manager
- Add CI/CD for container image builds and deployments

## Impact

- Affected specs: `epf-strategy-server` (new data source and transport requirements), `epf-cloud-infrastructure` (new capability)
- Affected code: `apps/epf-cli/` (new packages: `internal/source/`, `internal/transport/`, `internal/auth/`, `internal/cache/`)
- New infrastructure: Dockerfile, GCP Terraform/config, GitHub App configuration
- Existing local CLI behavior is preserved — cloud mode is additive

## Relationship to Other Changes

This is a foundational change in a three-part dependency chain:

| Change | Depends on | What it uses from this change |
|---|---|---|
| `add-aim-recalibration-engine` Phase 3S | This change (cloud infrastructure) | Cloud Run deployment, HTTP transport, future persistent storage layer |
| `add-emergent-ai-strategy` | This change (MCP-over-HTTP) | Agent sessions connect to this server as MCP context provider |

This v1 is **stateless and read-only**. Two downstream extensions are anticipated:

1. **AIM stateful layer** (`add-aim-recalibration-engine` Phase 3S) — adds persistent storage (via `emergent` knowledge graph API or dedicated database — deferred decision), monitoring state, webhook receivers, and AIM health dashboard API. Integration via MCP tools and REST API, not shared code (per Decision #11).
2. **AI Strategy context** (`add-emergent-ai-strategy`) — dynamically attaches this server as an MCP context provider to headless OpenCode sessions. The AI agent also coordinates with `emergent`'s services via A2A protocol for knowledge graph operations. No changes to this server needed for v1.
3. **A2A Agent Card** (future) — this server can expose an A2A Agent Card for discovery by other agents in the ecosystem, enabling protocol-based coordination without hardcoded endpoint configuration.

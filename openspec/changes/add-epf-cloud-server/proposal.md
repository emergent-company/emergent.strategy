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

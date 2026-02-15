# Change: Add Distribution Pipeline and Cloud Architecture

## Why

The EPF CLI (`v0.11.1`) has no distribution mechanism. Coworkers must clone the repo, install Go, clone `canonical-epf`, and run `make build` — a process that only works for the one person who set it up. The longer-term vision is to evolve from a local CLI tool into a cloud-hosted service and eventually a full SaaS platform. We need a foundation that handles:

1. **Automated releases** — Build, sign, and publish binaries when we tag a version
2. **Easy install** — `brew install` for coworkers, GitHub Releases for everyone else
3. **Auto-updates** — Users know when a new version is available
4. **Cloud readiness** — Refactor the CLI so the core can run headless, hot-loading EPF instances from GitHub repos without local clones
5. **SaaS readiness** — Architecture that supports multi-tenant agent-driven document engineering
6. **Multi-app support** — The repo will host more apps; the build/release pipeline should scale

### Evolution Arc

The platform evolves through three modes:

1. **Local mode** (today) — EPF CLI + MCP running on a local repository
2. **Cloud server mode** (Phases 4-5) — EPF CLI serves remote instances from GitHub via MCP/HTTP
3. **SaaS platform mode** (Phase 6) — Headless agent service with multi-tenant support, using ACP for client communication

## What Changes

### Phase 1: Automated Releases (CI/CD)

- **NEW** GitHub Actions workflow for CI (test on push/PR) and release (on tag)
- **NEW** GoReleaser configuration for cross-platform builds with embedded artifacts
- **NEW** GitHub Releases with pre-built binaries and checksums for all platforms
- **MODIFIED** Makefile to work with GoReleaser for release builds

### Phase 2: Homebrew Distribution

- **NEW** Homebrew tap repository (`emergent-company/homebrew-tap`)
- **NEW** GoReleaser auto-publishes formula to tap on release
- **NEW** Install path: `brew install emergent-company/tap/epf-cli`
- **NEW** Update path: `brew upgrade epf-cli`

### Phase 3: Update Notifications

- **NEW** Version check on CLI startup — compares local version against latest GitHub Release
- **NEW** `epf-cli update` command for self-update (downloads latest release binary)
- **NEW** Configurable: disable checks via `EPF_CLI_NO_UPDATE_CHECK=1` or config

### Phase 4: Cloud/Headless Architecture

- **NEW** Instance source abstraction (`InstanceSource` interface) — local filesystem, GitHub repo, or URL
- **NEW** `epf-cli serve --remote owner/repo` mode that hot-loads EPF instances from GitHub
- **NEW** GitHub App authentication for cross-repo access without personal tokens (private key in Secret Manager)
- **NEW** Fallback to `GITHUB_TOKEN` / `--github-token` for personal token auth
- **NEW** Caching layer with TTL (default 15min), background refresh, and Singleflight to prevent thundering herd
- **NEW** SSE transport for cloud MCP (`epf-cli serve --transport sse`)
- **NEW** HTTP API mode alongside MCP (`epf-cli serve --http :8080`)
- **MODIFIED** Core validation/health/generation logic decoupled from filesystem assumptions

### Phase 5: Docker and GCP Cloud Run Deployment

- **NEW** Multi-stage Dockerfile for running as a cloud service
- **NEW** Docker image published to GitHub Container Registry (ghcr.io)
- **NEW** `docker run ghcr.io/emergent-company/epf-cli serve --remote owner/repo`
- **NEW** GCP Cloud Run as primary deployment target (scales to zero, serverless)
- **NEW** GCP Artifact Registry for Docker image storage
- **NEW** GCP Secret Manager integration for GitHub App credentials
- **NEW** Configuration via environment variables (`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`, `DEFAULT_REPO`, `LOG_LEVEL`)

### Phase 6: SaaS Platform (Agent-Driven Document Engineering)

- **NEW** Headless agent mode — OpenCode (or equivalent) as the writing/serving agent for EPF artifacts
- **NEW** Agent Client Protocol (ACP) integration for frontend-to-backend communication
- **NEW** Multi-tenant support — isolated EPF instances per client
- **NEW** Per-tenant resource isolation (compute, storage, token quotas)
- **NEW** Document engineering capabilities — automated audit, update propagation, structural validation
- **NEW** ACP abstraction layer to allow swapping the agent engine without breaking clients

## Impact

- Affected specs: `epf-cli-mcp` (MCP server gains remote instance support, HTTP API mode), `epf-strategy-server` (StrategyStore becomes a layer on top of InstanceSource)
- Affected code:
  - `apps/epf-cli/` — Core refactoring for instance source abstraction
  - `.github/workflows/` — NEW: CI/CD pipelines
  - `.goreleaser.yaml` — NEW: Release configuration
  - `Dockerfile` — NEW: Container support
- New repositories: `emergent-company/homebrew-tap` (Homebrew formula)
- GCP infrastructure: Cloud Run, Artifact Registry, Secret Manager, IAM configuration
- **BREAKING** (Phase 4): Instance loading APIs change from `path string` to `Source` interface — internal only, no user-facing breakage
- Backward compatibility: All existing CLI commands continue to work unchanged through all phases

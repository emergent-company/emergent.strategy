## 1. CI/CD Pipeline (Phase 1)

- [ ] 1.1 Create `.github/workflows/ci.yaml` — run `go test ./...` and `go build` on push/PR
- [ ] 1.2 Add embedded artifact sync step to CI (cache `canonical-epf` or use pre-synced artifacts)
- [ ] 1.3 Create `.goreleaser.yaml` in `apps/epf-cli/` with cross-platform build config
- [ ] 1.4 Create `.github/workflows/release.yaml` — triggered on `v*` tags, runs GoReleaser
- [ ] 1.5 Configure GoReleaser to run `sync-embedded` as a build hook before compilation
- [ ] 1.6 Test: tag `v0.11.1`, verify GitHub Release created with binaries for all 5 platform/arch combos
- [ ] 1.7 Update Makefile `release` target to document GoReleaser workflow (or remove in favor of CI)

## 2. Homebrew Distribution (Phase 2)

- [ ] 2.1 Create `emergent-company/homebrew-tap` repository with README
- [ ] 2.2 Add Homebrew tap config to `.goreleaser.yaml` (formula generation + push to tap repo)
- [ ] 2.3 Configure GitHub token for GoReleaser to push formula (repo secret)
- [ ] 2.4 Test: `brew tap emergent-company/tap && brew install epf-cli`
- [ ] 2.5 Test: tag new version, verify `brew upgrade epf-cli` picks it up
- [ ] 2.6 Document install instructions in README

## 3. Update Notifications (Phase 3)

- [ ] 3.1 Add `internal/update/checker.go` — query GitHub Releases API for latest version
- [ ] 3.2 Add version comparison logic (semver) with 24-hour check throttle (cached in `~/.epf-cli/`)
- [ ] 3.3 Hook into root command `PersistentPreRun` — print update notice if newer version available
- [ ] 3.4 Add `EPF_CLI_NO_UPDATE_CHECK` env var and `update_check: false` config option
- [ ] 3.5 Add `epf-cli update` command — downloads and replaces binary (with backup)
- [ ] 3.6 Detect Homebrew installs and suggest `brew upgrade` instead of self-update
- [ ] 3.7 Test: verify update check works, respects throttle, and self-update replaces binary

## 4. Cloud/Headless Architecture (Phase 4)

- [ ] 4.1 Define `InstanceSource` interface: `Open(path) (fs.FS, error)`, `List() ([]Instance, error)`
- [ ] 4.2 Implement `LocalSource` wrapping current filesystem access
- [ ] 4.3 Implement `GitHubSource` — fetches repo tree via GitHub API, returns virtual fs.FS
- [ ] 4.4 Add caching layer — `CachedSource` wrapping any Source with local disk cache + TTL (default 15min)
- [ ] 4.5 Add Singleflight pattern (`golang.org/x/sync/singleflight`) to prevent thundering herd on concurrent cache misses
- [ ] 4.6 Refactor core packages to accept `fs.FS` instead of `string` paths where possible
- [ ] 4.7 Add `--remote owner/repo` flag to `epf-cli serve` for GitHub-backed instances
- [ ] 4.8 Add GitHub App authentication — generate Installation Access Tokens from private key
- [ ] 4.9 Add fallback to `--github-token` flag and `GITHUB_TOKEN` env var for personal token auth
- [ ] 4.10 Add SSE transport option for MCP server (`--transport sse`)
- [ ] 4.11 Add HTTP API server (`epf-cli serve --http :8080`) with REST endpoints mirroring MCP tools
- [ ] 4.12 Test: `epf-cli serve --remote emergent-company/emergent-epf` loads and validates remote instance
- [ ] 4.13 Test: HTTP API endpoints return same results as MCP tools

## 5. Docker and GCP Cloud Run Deployment (Phase 5)

- [ ] 5.1 Create multi-stage `Dockerfile` (Go builder → distroless)
- [ ] 5.2 Add Docker build to GoReleaser config (push to ghcr.io)
- [ ] 5.3 Add `.github/workflows/docker.yaml` or integrate into release workflow
- [ ] 5.4 Set up GCP Artifact Registry for Docker image storage
- [ ] 5.5 Configure GCP Cloud Run service with necessary IAM roles
- [ ] 5.6 Integrate GCP Secret Manager for GitHub App credentials (`GITHUB_APP_ID`, `GITHUB_PRIVATE_KEY`)
- [ ] 5.7 Add environment variable configuration (`DEFAULT_REPO`, `LOG_LEVEL`, `PORT`)
- [ ] 5.8 Test: `docker run ghcr.io/emergent-company/epf-cli serve --remote owner/repo --http :8080`
- [ ] 5.9 Test: Cloud Run deployment serves MCP over SSE and HTTP API
- [ ] 5.10 Document cloud deployment in README

## 6. SaaS Platform — Agent-Driven Document Engineering (Phase 6)

- [ ] 6.1 Research and prototype ACP (Agent Client Protocol) integration
- [ ] 6.2 Design multi-tenant architecture — per-tenant EPF instance isolation
- [ ] 6.3 Integrate headless OpenCode as the writing/serving agent
- [ ] 6.4 Implement orchestrator service — auth, routing, tenant management, token quotas
- [ ] 6.5 Implement ACP abstraction layer to decouple agent engine from client protocol
- [ ] 6.6 Add document engineering capabilities — automated audit, update propagation, structural validation
- [ ] 6.7 Set up per-tenant storage (GCS volumes or equivalent)
- [ ] 6.8 End-to-end test: multi-tenant agent-driven EPF document operations

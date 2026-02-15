# Change: Add Distribution Pipeline

## Why

The EPF CLI (`v0.12.0`) has no distribution mechanism. Coworkers must clone the repo, install Go, clone `canonical-epf`, and run `make build` — a process that only works for the one person who set it up. We need:

1. **Repo migration** — The canonical EPF framework repo is still under `eyedea-io`, blocking CI/CD access
2. **Automated releases** — Build, sign, and publish binaries when we tag a version
3. **Easy install** — `brew install` for coworkers, GitHub Releases for everyone else
4. **Auto-updates** — Users know when a new version is available

This is the first of three planned changes in the platform evolution:

1. **Distribution pipeline** (this change) — Repo migration, CI/CD, Homebrew, update notifications
2. **Cloud architecture** (future) — Remote instance loading, GitHub App auth, Cloud Run, Docker
3. **SaaS platform** (future) — Multi-tenant agent service, ACP, headless OpenCode

## What Changes

### Phase 0: Canonical EPF Repo Migration

The canonical EPF framework (`eyedea-io/epf-canonical-definition`) must be migrated to `emergent-company/epf-canonical` before CI/CD can work. The build process embeds framework artifacts (schemas, templates, wizards, generators) from this repo into the CLI binary, so GitHub Actions needs access to it under the same org.

- **NEW** `emergent-company/epf-canonical` repository (pushed from existing history)
- **MODIFIED** Default canonical repo URL in `internal/config/config.go`
- **MODIFIED** `sync-embedded.sh` default path comments
- **MODIFIED** Makefile default path comments
- **MODIFIED** References in docs, AGENTS.md, specs, and cmd help text
- Archive old `eyedea-io/epf-canonical-definition` repo (defer — requires eyedea-io admin)

Note: References in the `emergent-epf` submodule (investor docs, skattefunn, etc.) are deferred — they reference "Eyedea AS" as a company name, not a repo dependency.

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

## Impact

- Affected specs: `epf-cli/spec.md` (remote schema fetch URL reference), `epf-cli-mcp/spec.md`
- Affected code:
  - `apps/epf-cli/internal/config/config.go` — Default canonical repo URL
  - `apps/epf-cli/scripts/sync-embedded.sh` — Path comments
  - `apps/epf-cli/Makefile` — Path comments
  - `apps/epf-cli/cmd/config.go`, `cmd/init.go` — Help text examples
  - `apps/epf-cli/AGENTS.md`, `internal/embedded/AGENTS.md` — Doc references
  - `apps/epf-cli/` — Update check and self-update logic
  - `.github/workflows/` — NEW: CI/CD pipelines
  - `.goreleaser.yaml` — NEW: Release configuration
- New repositories: `emergent-company/epf-canonical`, `emergent-company/homebrew-tap`
- No breaking changes to CLI behavior
- Backward compatibility: All existing CLI commands continue to work unchanged

# Change: Add Distribution Pipeline

## Why

The EPF CLI (`v0.11.1`) has no distribution mechanism. Coworkers must clone the repo, install Go, clone `canonical-epf`, and run `make build` — a process that only works for the one person who set it up. We need:

1. **Automated releases** — Build, sign, and publish binaries when we tag a version
2. **Easy install** — `brew install` for coworkers, GitHub Releases for everyone else
3. **Auto-updates** — Users know when a new version is available

This is the first of three planned changes in the platform evolution:

1. **Distribution pipeline** (this change) — CI/CD, Homebrew, update notifications
2. **Cloud architecture** (future) — Remote instance loading, GitHub App auth, Cloud Run, Docker
3. **SaaS platform** (future) — Multi-tenant agent service, ACP, headless OpenCode

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

## Impact

- Affected specs: None (new capability)
- Affected code:
  - `apps/epf-cli/` — Update check and self-update logic
  - `.github/workflows/` — NEW: CI/CD pipelines
  - `.goreleaser.yaml` — NEW: Release configuration
- New repositories: `emergent-company/homebrew-tap` (Homebrew formula)
- No breaking changes
- Backward compatibility: All existing CLI commands continue to work unchanged

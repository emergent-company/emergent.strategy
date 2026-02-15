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

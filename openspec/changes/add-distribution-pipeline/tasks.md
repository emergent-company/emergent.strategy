## 0. Canonical EPF Repo Migration (Phase 0)

- [x] 0.1 Create `emergent-company/epf-canonical` private repo on GitHub
- [x] 0.2 Push full history from local `canonical-epf` to new repo
- [x] 0.3 Update `internal/config/config.go` — change `DefaultCanonicalRepo` URL
- [x] 0.4 ~~Update `scripts/sync-embedded.sh`~~ — audited: already uses `canonical-epf` directory name (no repo URL)
- [x] 0.5 ~~Update `Makefile`~~ — audited: already uses `canonical-epf` directory name (no repo URL)
- [x] 0.6 Update `cmd/config.go` and `cmd/init.go` — update example URLs in help text
- [x] 0.7 ~~Update `AGENTS.md`~~ — audited: both copies reference `canonical-epf/` as directory name (correct)
- [x] 0.8 ~~Update docs references~~ — audited: `docs/EPF/AGENTS.md` and `README.md` use config path, not repo URL
- [ ] 0.9 Update openspec archived specs/proposals that reference eyedea-io repos (deferred — cosmetic only)
- [x] 0.10 Update local remote: `git remote set-url origin` in canonical-epf working copy
- [x] 0.11 Verify: `make build` still works with updated paths
- [x] 0.12 Commit all reference updates, push to main

## 1. CI/CD Pipeline (Phase 1)

- [x] 1.1 Create `.github/workflows/ci.yaml` — run `go test ./...` and `go build` on push/PR
- [x] 1.2 Add embedded artifact sync step to CI (checkout `epf-canonical` + run sync-embedded.sh)
- [x] 1.3 Create `.goreleaser.yaml` in `apps/epf-cli/` with cross-platform build config
- [x] 1.4 Create `.github/workflows/release.yaml` — triggered on `epf-cli/v*` tags, runs GoReleaser
- [x] 1.5 Configure GoReleaser to run `sync-embedded` as a before hook (uses CANONICAL_EPF_PATH env)
- [ ] 1.6 Test: tag `epf-cli/v0.12.1`, verify GitHub Release created with binaries for all 5 platform/arch combos
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

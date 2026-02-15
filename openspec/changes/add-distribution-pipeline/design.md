## Context

The EPF CLI is a single Go binary with embedded framework artifacts (schemas, templates, wizards, generators). It currently has zero distribution infrastructure — no CI, no releases, no install path. The repo is private now but will become public later.

### Prerequisites

The canonical EPF framework is currently at `eyedea-io/epf-canonical-definition` (private). Before CI/CD can work, it must be migrated to `emergent-company/epf-canonical` so GitHub Actions in the `emergent-company` org can access it. This is Phase 0.

Migration approach: Create new repo + push full history (not GitHub transfer — avoids needing admin on both orgs). The old repo at eyedea-io will be archived later when convenient.

### Constraints

- Repo is **private now, public later** — GitHub Releases work for org members; Homebrew tap needs a separate public repo or private tap with token auth
- Embedded artifacts require `epf-canonical` sync at build time — GoReleaser must handle this
- All 5 platform/arch combos must be supported: darwin/amd64, darwin/arm64, linux/amd64, linux/arm64, windows/amd64
- Module path: `github.com/emergent-company/emergent-strategy/apps/epf-cli` (nested in monorepo)

### Key Decisions

**1. GoReleaser over custom scripts**
- Handles cross-compilation, checksums, changelog, GitHub Release creation, Homebrew formula generation in one tool
- Well-supported in GitHub Actions
- CI-agnostic — easy to swap CI providers later if needed
- Alternative: manual `make release` + `gh release create` — more fragile, more maintenance

**2. Homebrew tap in separate repo**
- GoReleaser generates the formula and pushes to `emergent-company/homebrew-tap`
- Works for private repos with `HOMEBREW_GITHUB_API_TOKEN`
- When repo goes public, tap just works without changes
- Alternative: distribute via `go install` — doesn't work because embedded artifacts need the sync step

**3. Smart update detection — adapts to install method**
- `epf-cli update` detects how it was installed
- If installed via Homebrew: prints `brew upgrade epf-cli` instead of self-replacing
- If standalone binary: downloads latest from GitHub Releases and replaces in-place (with backup)
- Avoids confusing Homebrew's package state while still supporting direct installs

### Risks / Trade-offs

| Risk | Mitigation |
|------|------------|
| Private repo complicates Homebrew | Use token-authenticated tap; goes away when repo becomes public |
| GoReleaser config complexity | Start minimal (binaries + checksums), add Homebrew incrementally |
| Embedded artifact sync in CI | Cache `canonical-epf` in GitHub Actions, sync as build step before GoReleaser |
| Monorepo module path | GoReleaser `project_name` and `dist` configured relative to `apps/epf-cli/` |
| Self-update security | Download from GitHub Releases only (HTTPS), verify SHA256 checksum before replacing |

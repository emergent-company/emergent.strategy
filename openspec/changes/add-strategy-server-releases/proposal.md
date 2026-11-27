# Change: Versioned releases for strategy-server

## Why

strategy-server has no releases. Anyone running their own copy has to build
from a commit hash, and nothing tells them which commits are ready to deploy:

- **No version exists anywhere.** The repository's `v*` tags (v0.47.0 to
  v0.49.2) are epf-cli releases. The binary has no version string, so a
  running server cannot say what it is, and an operator's bug report can
  only name a commit.
- **Images are private and unversioned.** `strategy-server-image.yaml`
  pushes every merge to `main` to Artifact Registry in `outblocks`, tagged
  `latest` and with the short SHA. An outside operator cannot pull from
  there, and there is no tag meaning "released".
- **There are no release notes.** What changed, which migrations a version
  adds, and what an operator has to do (clean up content, run a sweep,
  refresh skills) were explained by hand in a memo for the pilot deployment's
  first upgrade. The next upgrade will need the same information again.
- **Tagging by hand has a trap.** `release.yaml` runs on any tag matching
  `v*`. It releases epf-cli (GoReleaser, Homebrew tap, GHCR image) and starts
  the epf-cli Cloud Run deploy. A strategy-server tag that someone types as
  `v0.1.0` would release and deploy the wrong app.

The pilot deployment asked on 3 November for "a tag or a published image" to
build from. As a stopgap, `strategy-server/v0.1.0` is placed by hand on
`16c2756`. This change makes that a process.

## What Changes

- **Release PR, maintained automatically.** A `release-please` workflow
  watches `main` for changes under `apps/strategy-server/`. It keeps one
  open PR, "Release strategy-server X.Y.Z", with the proposed version and a
  changelog. **Merging that PR is the release decision.** Nothing is
  released on an ordinary merge.
- **Tag scheme `strategy-server/vX.Y.Z`.** Semantic versioning. While the
  version is below 1.0, a breaking change raises the minor version. The
  first automated release continues from the manual `strategy-server/v0.1.0`.
- **Release artifacts.** A release builds the image from the tagged commit.
  It is pushed to `ghcr.io/emergent-company/strategy-server` as `X.Y.Z` and
  `latest` (public, as `epf-server` already is), and to Artifact Registry
  for our own deploy workflow. The GitHub Release gets the image digest and
  a generated **"Migrations in this release"** section, listing the files
  added under `internal/database/migrations/` since the previous release.
- **Upgrade notes.** A release PR that needs operator action carries an
  "Upgrade notes" section, written by a person before merging. Release notes
  therefore replace hand-written upgrade memos for routine upgrades.
- **The binary knows its version.** The version is stamped in at build time
  and shown by `strategy-server version`, logged at startup, and returned
  by `/health`. A build without a stamp reports `dev+<sha>`, not a bare
  `dev`. A bare `dev` is what made the pilot's emergent.memory version
  unidentifiable.
- **The epf-cli trap is closed.** `release.yaml` only runs on tags of the
  form `v<digit>…`. A guard step fails that workflow if the tag's commit
  touches nothing under `apps/epf-cli/` since the previous `v*` tag. That
  catches a mistyped strategy-server release before it ships epf-cli.
- **Commit convention.** PRs are squash-merged, and the squash commit takes
  the PR title, which must be a Conventional Commit (`feat:`, `fix:`,
  `chore(strategy-server):`, and `!` for breaking). A PR-title check
  enforces this. The changelog is only as good as these titles.

**Not breaking.** Builds from `main` and the existing per-merge image keep
working. Operators gain a supported release to build from.

## Impact

- New capability spec: `strategy-release`.
- New files:
  - `.github/workflows/strategy-server-release.yaml`
  - `.github/workflows/pr-title.yaml`
  - `release-please-config.json`
  - `.release-please-manifest.json`
  - `apps/strategy-server/CHANGELOG.md` (generated)
- Changed files:
  - `.github/workflows/release.yaml` (tag filter and guard)
  - `.github/workflows/strategy-server-image.yaml` (version stamp)
  - `apps/strategy-server/Dockerfile` (`VERSION` build argument)
  - `apps/strategy-server` main and `cmd_serve.go` (version command, log,
    `/health`)
  - `apps/strategy-server/docs/DEPLOYMENT.md` (build from releases)
- Repository settings, which an admin changes:
  - squash merge with the PR title as the default commit message;
  - Actions allowed to create PRs, or the CI GitHub App given write access
    (design decision 2).
- Out of scope:
  - automatic deploys of releases to our own environments (owned by
    `deploy-strategy-server`);
  - changing epf-cli's tag scheme (epf-cli is frozen, and GoReleaser OSS has
    no tag prefixes);
  - signing or SBOMs for the image (a later change, if an operator asks).

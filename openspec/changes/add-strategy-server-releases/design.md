# Design: Versioned releases for strategy-server

## Context

There are two apps in one repository, with different cadences:

- **epf-cli** is frozen. It is released by `release.yaml` on `v*` tags, with
  GoReleaser, the Homebrew tap, the `ghcr.io/emergent-company/epf-server`
  image and the `epf-strategy` Cloud Run deploy.
- **strategy-server** is in active development. Its image is built on every
  merge to `main` (`strategy-server-image.yaml`, Artifact Registry only) and
  deployed by a manual workflow (`strategy-server-deploy.yaml`), which is
  not used in production yet.

The first outside operator, a pilot deployment, runs strategy-server from
its own fork. It builds its own image and stays on a known version until it
chooses to upgrade. A release is what that operator needs.

Repository facts this design relies on, checked 3 November 2026:

- the repository is public and `main` is not protected;
- squash merge is enabled, and branches are deleted on merge;
- recent PRs are merged with merge commits;
- about half of the strategy-server commits since October use Conventional
  Commit prefixes. The rest use `fence:`, `search_strategy:`,
  `decompose:` and similar.

## Decision 1: what a release is, and who decides

| Option | Verdict |
|---|---|
| Tag every merge to `main` automatically | **Rejected.** The tag then means only "latest main", which the commit hash already says. An operator cannot tell a tested version from a mid-series commit. |
| Tag by hand when ready | **Rejected as the process,** kept as the bootstrap. Every release depends on someone remembering the steps, choosing the right version, and avoiding the `v*` trap. Release notes stay hand-written. |
| semantic-release (tag and release on every qualifying merge) | **Rejected.** Same problem as tagging every merge, with no point at which a person decides. |
| **release-please (a standing release PR, released on merge)** | **Chosen.** Automation does the bookkeeping: version, changelog and tag. A person makes the decision by merging, and can edit the PR first to add upgrade notes. It supports one component in a monorepo, a custom tag separator, and minor bumps before 1.0. |

**When to merge the release PR.** Merge it when a version is to be handed to
operators: after a slice that changes behaviour is complete and CI is green
on `main`. Merging it when `main` is half way through a multi-PR series
defeats the point. The PR stays open meanwhile and keeps accumulating
changes, so leaving it open has no cost.

## Decision 2: the token release-please uses

Events caused by `GITHUB_TOKEN` do not start other workflows. That has two
consequences:

- the release PR it opens gets no CI run;
- the tag it creates does not start a tag-triggered build.

| Option | Consequence |
|---|---|
| `GITHUB_TOKEN`, with the image built **in the same workflow** when `release_created` is true | Needs no new credentials, and the build runs. The release PR gets no CI, which is acceptable: it only changes `CHANGELOG.md` and the manifest, and `main` is not protected. Needs the repository setting "Allow GitHub Actions to create and approve pull requests". |
| **The existing CI GitHub App** (`emergent-strategy-ci`, already used by `release.yaml` through `actions/create-github-app-token`) | The release PR gets CI and the tag can start workflows. The App must be installed on `emergent.strategy` with Contents and Pull requests write. Its key is already a repository secret. |

**Chosen: the App token, with the build in the same workflow either way.**

- The App token makes the release PR look like any other PR. It also keeps
  working if `main` becomes protected.
- Building in the same workflow avoids depending on tag events at all, so
  falling back to `GITHUB_TOKEN` later needs no restructuring.
- Task 0.2 confirms the App's installation scope. If it cannot be widened,
  use `GITHUB_TOKEN` and the setting above.

## Decision 3: tag scheme and the epf-cli trap

The tag is `strategy-server/vX.Y.Z` (release-please `component:
strategy-server`, `tag-separator: "/"`, `include-v-in-tag: true`). In GitHub's
filter syntax, `v*` does not match it: the pattern is anchored at the start
of the tag name, and `*` does not match `/`. So release-please tags can never
trigger `release.yaml`.

The remaining risk is a person typing `v0.2.0` for a strategy-server release.
There are two layers against that:

1. narrow the filter to `v[0-9]+.[0-9]+.[0-9]+*`. This is cosmetic, but it
   documents intent;
2. a guard step first in `release.yaml`. It fails if nothing under
   `apps/epf-cli/` changed between the previous `v*` tag and this one, with
   a message naming the strategy-server tag scheme. epf-cli is frozen, so
   every real epf-cli release does change that directory.

Renaming epf-cli's tags to `epf-cli/v*` would remove the overlap entirely.
It is rejected: GoReleaser OSS has no monorepo tag prefixes, and the tap and
the docs depend on the current scheme.

## Decision 4: what a release publishes

- **GHCR, public.** `ghcr.io/emergent-company/strategy-server:X.Y.Z` and
  `:latest`, `linux/amd64`. This follows the `epf-server` precedent in
  `release.yaml`. An operator can pull the image or build from the tag;
  both give the same result.
- **Artifact Registry** gets the same image, tagged `X.Y.Z`, for
  `strategy-server-deploy.yaml`.
- **The GitHub Release body** holds:
  - the release-please changelog;
  - the image digest;
  - the list of new migration files, computed with
    `git diff --name-only --diff-filter=A <prev-tag> <tag> -- apps/strategy-server/internal/database/migrations/`;
  - upgrade notes, when the PR had them.

  The migrations list is generated, never typed, because a missed migration
  is the most expensive mistake in an upgrade.
- The per-merge `main` image stays as it is (SHA and `latest` in Artifact
  Registry). It serves development, not releases.

## Decision 5: version in the binary

- A `version` package variable, defaulting to `dev`, is set with
  `-ldflags "-X main.version=<v>"`.
- The Dockerfile takes `ARG VERSION=dev`.
- The release build passes `X.Y.Z`. The per-merge build passes `0.0.0-main+<sha>`.
- With no stamp, the binary reads the VCS revision from
  `runtime/debug.ReadBuildInfo()` and reports `dev+<sha>`, plus `-dirty` when
  the tree had changes.

The version then appears in three places:

- `strategy-server version`;
- the first startup log line;
- the `/health` body, as `"version"`.

`/health` is unauthenticated today. A version number there is common
practice, and the image tag is public anyway.

## Decision 6: commit convention

release-please's changelog and version bump read Conventional Commits. Two
changes make that reliable:

- the repository default squash message becomes the PR title (it is
  "commit or PR title" today);
- a `pr-title.yaml` check (`amannn/action-semantic-pull-request`) requires a
  Conventional Commit PR title, with the types `feat`, `fix`, `perf`,
  `refactor`, `docs`, `test`, `chore`, `ci` and `build`.

Squash merge becomes the expected way to merge. Merge commits still work:
release-please reads the commits on the merged branch. But branch commits
like `fence: …` are then left out of the changelog. History before
`strategy-server/v0.1.0` is not rewritten.

## Risks

- **A release PR that sits open too long** grows a long changelog and a large
  jump between versions. That is acceptable; the changelog is the record.
- **A wrong version bump** (a breaking change titled `fix:`) is fixed by
  editing the release PR before merging. release-please honours a
  `Release-As: X.Y.Z` footer in a commit on `main`.
- **The manual bootstrap tag is missing.** If `strategy-server/v0.1.0` was
  never pushed, release-please would build the first changelog from all of
  history. Task 0.1 makes the tag a precondition, and
  `.release-please-manifest.json` starts at `0.1.0`.

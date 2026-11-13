# Tasks

## 0. Preconditions (an admin, before any workflow is merged)

- [x] 0.1 Push the bootstrap tag `strategy-server/v0.1.0` on `16c2756` from a machine with push rights. Confirm with `git ls-remote origin 'refs/tags/strategy-server/*'`. Done 3 November 2026 (annotated tag on `16c2756`). `release.yaml` did not run, which confirms that `v*` does not match `strategy-server/v*`.
- [ ] 0.2 Install the CI GitHub App (`emergent-strategy-ci`) on `emergent.strategy` with Contents: write and Pull requests: write. If that is not possible, enable "Allow GitHub Actions to create and approve pull requests" and record the `GITHUB_TOKEN` fallback (design decision 2).
- [ ] 0.3 Repository settings: make squash merge the default, and set the default squash commit message to "Pull request title".

## 1. Tag safety for epf-cli

- [ ] 1.1 `release.yaml`: narrow the tag filter to `v[0-9]+.[0-9]+.[0-9]+*`.
- [ ] 1.2 `release.yaml`: add a first job, `guard`, that every other job `needs`. It finds the previous `v*` tag and fails when `git diff --quiet <prev> <tag> -- apps/epf-cli/` reports no change. The error message names the `strategy-server/vX.Y.Z` scheme.
- [ ] 1.3 Test the guard on a fork or with `act`: a `v`-tag on a commit with no epf-cli change fails before GoReleaser runs, and a real epf-cli change passes.

## 2. Version in the binary

- [ ] 2.1 Add a `version` variable (default `dev`) in `apps/strategy-server`, resolved through `debug.ReadBuildInfo()` to `dev+<sha>[-dirty]` when it is not stamped.
- [ ] 2.2 Add `strategy-server version`. Log the version on the first startup line, and add `"version"` to the `/health` response.
- [ ] 2.3 Dockerfile: add `ARG VERSION=dev` and pass it as `-ldflags "-s -w -X main.version=${VERSION}"`.
- [ ] 2.4 `strategy-server-image.yaml`: pass `VERSION=0.0.0-main+<sha>`.
- [ ] 2.5 Tests:
  - the unstamped build reports `dev+`;
  - a stamped build reports the stamp;
  - `/health` includes the version and stays unauthenticated.

## 3. Release automation

- [ ] 3.1 Add `release-please-config.json`: one package, `apps/strategy-server`, with:
  - `component: strategy-server`
  - `release-type: go`
  - `tag-separator: "/"`
  - `include-v-in-tag: true`
  - `bump-minor-pre-major: true`
  - `changelog-path: CHANGELOG.md`
- [ ] 3.2 Add `.release-please-manifest.json` with `{"apps/strategy-server": "0.1.0"}`.
- [ ] 3.3 Add `.github/workflows/strategy-server-release.yaml`. It runs on push to `main` and uses `googleapis/release-please-action` with the App token (0.2). It exposes `release_created`, `tag_name` and `version`.
- [ ] 3.4 In the same workflow, a `publish` job runs when `release_created` is true:
  1. check out the tag;
  2. build with `VERSION=<version>`;
  3. push to GHCR (`:X.Y.Z`, `:latest`) and to Artifact Registry (`:X.Y.Z`);
  4. record the digest.
- [ ] 3.5 A `notes` job:
  1. compute the new migration files since the previous `strategy-server/v*` tag;
  2. append "Migrations in this release" (or "No new migrations") and the image digest to the GitHub Release body with `gh release edit`.
- [ ] 3.6 Make the GHCR package `strategy-server` public, linked to the repository.
- [ ] 3.7 Add a release PR template section, "Upgrade notes (operator action)", that a person fills in or deletes before merging. Document it in the PR body that release-please writes (`pull-request-header` / `pull-request-footer`).

## 4. Commit convention

- [ ] 4.1 Add `.github/workflows/pr-title.yaml` (`amannn/action-semantic-pull-request`) with the types `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `chore`, `ci` and `build`, and an optional scope.
- [ ] 4.2 Add a short "Merging and releases" section to `CONTRIBUTING.md`, or to `AGENTS.md` if there is no `CONTRIBUTING.md`. It covers squash merge, the PR title format, `!` for breaking changes, and when to merge the release PR.

## 5. Operator documentation

- [ ] 5.1 `apps/strategy-server/docs/DEPLOYMENT.md`:
  - build from the latest `strategy-server/v*` release, or pull `ghcr.io/emergent-company/strategy-server:X.Y.Z`;
  - read "Migrations in this release" and "Upgrade notes" before upgrading;
  - never build from a `v*` tag.
- [ ] 5.2 Say in the README where releases are, and that `v*` tags are epf-cli.

## 6. Verification

- [ ] 6.1 Merge a `fix:` PR touching `apps/strategy-server/`. A release PR proposing `0.1.1` appears, with that PR in the changelog and CI running on it.
- [ ] 6.2 Merge a `docs:` PR touching only `apps/epf-cli/`. The release PR does not change.
- [ ] 6.3 Merge the release PR. Then:
  - the tag `strategy-server/v0.1.1` exists, on the merge commit;
  - `release.yaml` did **not** run;
  - the GHCR image `:0.1.1` can be pulled anonymously;
  - `docker run … version` prints `0.1.1`;
  - the release body lists the migrations (or "No new migrations") and the digest.
- [ ] 6.4 Push a `v`-tag on a commit with no epf-cli change, on a scratch fork, not here. The guard fails and nothing is published.
- [ ] 6.5 Tell the pilot deployment that releases exist, and point them to the release page instead of commit hashes.

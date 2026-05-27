## Context

The strategy-server has a complete write path to GitHub (export YAML, create
branch + commit + PR) but no read path. Instances are populated via a CLI
`import` subcommand from local filesystem directories that were manually cloned
from GitHub repos.

There are two entry points for a strategy instance:

1. **Genesis**: A new strategy is created on the server (via `scaffold_instance`
   or manual authoring). It has no GitHub repo yet. It needs to get to GitHub
   for the first time.
2. **Connect**: A strategy already exists in a GitHub repo. The server connects
   to it, imports, works on it, and pushes updates back.

The existing code provides strong foundations to build on:

- `internal/github/client.go`: GitHub App JWT auth, installation tokens,
  branch/commit/PR APIs (write-only today)
- `domain/sync/service.go`: `RepoWriter` interface, `SyncToGithub` orchestration,
  sync log tracking
- `cmd_import.go`: `scanEPFInstance` parses YAML directories into DB payloads,
  `ReimportArtifacts` handles upsert, `BackfillIndex` rebuilds strategic index
- `domain/strategy/export.go`: deterministic artifact-type-to-directory mapping
  that is the inverse of the import mapping

## Goals / Non-Goals

**Goals:**
- Genesis instances can be pushed to a new GitHub repo for the first time
- Existing GitHub repos can be imported into the server
- The full lifecycle (create or import -> work -> AIM cycle -> auto-push) works
- Users can set/change `github_repo` on any instance
- Import never loses content that only exists on the server
- Sync status is transparent: users always know what state things are in

**Non-Goals:**
- Real-time webhook-based sync (future)
- In-server conflict resolution (conflicts are resolved in git)
- GitHub App installation UI (manual setup continues)
- Automatic periodic polling for upstream changes

## Decisions

### 1. GitHub Tree API over Contents API

**Decision:** Use the Git Tree API (`GET /repos/:owner/:repo/git/trees/:sha?recursive=1`)
to list all files, then fetch individual file content via the Blobs API or
Contents API as needed.

**Rationale:** The Tree API returns the full file listing in a single call
(recursive), while the Contents API requires one call per directory. For a
typical EPF instance (20-40 YAML files across READY/FIRE/AIM), the Tree API
is more efficient and simpler.

**Alternatives considered:**
- Contents API per-directory: simpler per-call but requires recursive traversal
  with multiple round-trips
- `git clone` via exec: would require git binary on server, temporary disk
  space, and cleanup. Over-engineered for 20-40 small YAML files.

### 2. Reuse `scanEPFInstance` pipeline

**Decision:** Extract the YAML parsing logic from `cmd_import.go` into a shared
function that accepts `map[string][]byte` (filename -> content) instead of
reading from the filesystem. Both the CLI import and GitHub import call the
same parsing pipeline.

**Rationale:** The import logic (artifact key derivation, YAML normalization,
product name extraction, metadata file handling) is already correct and tested.
Duplicating it for GitHub import would create divergence.

### 3. Commit-aware smart sync

**Decision:** The server tracks the GitHub commit SHA that each instance was
last imported from or synced to (`github_commit_sha` column on `strategy_instances`).
On import, the server fetches the remote HEAD SHA and compares it against
the stored SHA plus local change detection to determine one of four states:

| Remote SHA | Local changes | State | Action |
|---|---|---|---|
| Same | None | Already in sync | No-op |
| Same | Yes | Server ahead | Decline import; recommend push |
| Different | None | GitHub ahead | Import directly |
| Different | Yes | Diverged | Safety PR + import |

**Server ahead is the key case:** When the server has been enriched (AIM
cycles, new features, refined artifacts) on top of the same GitHub commit,
importing would be a downgrade. The server detects this and refuses to
import, recommending `sync_to_github` instead. This prevents accidentally
replacing enriched content with a stale GitHub version.

**Safety PR for diverged state:** When both sides have changed, the server
pushes the current enriched state to a safety branch + PR before importing
the new GitHub content. The user resolves conflicts in git by merging the
safety PR — the enriched content is preserved as a branch and never lost.

**If the safety PR push fails** (network error, GitHub permissions, branch
conflict), the entire import is aborted. We never overwrite without
preserving the current state first.

**Commit SHA lifecycle:**
- Set on import: `github_commit_sha = remote HEAD` after successful import
- Set on PR merge detection: `github_commit_sha = merge commit` when a
  sync PR is detected as merged
- NULL for genesis instances (never imported, never synced)
- NOT set by `sync_to_github` (creating a PR does not change the baseline —
  only merging it does)

**Branch tracking (`github_branch`):**
- NULL = default branch (main/master). This is the automated flow.
- Set when importing from a specific branch (e.g. `feature/new-strategy`).
  This is the manual flow — working on a feature branch's strategy changes.
- Once set, all subsequent sync operations (including AIM auto-push) target
  that branch. The server stays on the feature branch until the user
  explicitly switches back by importing without a branch parameter.
- When pushing to GitHub while on a feature branch, the PR targets the
  feature branch (not main). The user merges enrichments into the feature
  branch in GitHub, and eventually merges the feature branch to main.

**Rationale:** The commit SHA is a cheap, precise signal. Combined with
branch tracking, it turns the import from a dumb overwrite into an
intelligent decision. The four-state matrix gives clear, predictable
behavior. Branch support enables the natural git workflow: work on a
feature branch, enrich on the server, push back, merge in git.

### EPF instances in product repositories

An EPF strategy instance is documentation, not deployable code. It lives
alongside the product codebase (typically under a path like `docs/epf/` or
`strategy/`) but is excluded from the build process — CI/CD pipelines,
Docker images, and release artifacts never include it.

This has an important implication for branching: **in a mature product with
a standard git-flow (dev/staging/main), the strategy instance typically
lives on `dev` and never merges to `main`/`prod`**. The strategy is a
living document that evolves continuously alongside development. It doesn't
"ship" in the same way code does.

The server supports this lifecycle transparently through `github_branch`:

**Early-stage product (single branch):**
```
main branch — code + EPF instance
  ↕ server syncs to main (github_branch = NULL, uses default)
```
Everything is on `main`. The server imports from and pushes to `main`.
This is the simplest case and works out of the box.

**Mature product (multi-branch git-flow):**
```
main branch — production code only (no EPF)
dev branch  — code + EPF instance
  ↕ server syncs to dev (github_branch = "dev")
```
The user sets `github_branch` to `dev` on first import. All subsequent
syncs (manual and AIM auto-push) target `dev`. The EPF instance lives
on `dev` permanently and is never merged to `main`.

**Transition from early to mature:**
When a product adopts git-flow after starting on `main`:
1. The EPF instance already exists on `main`
2. User creates `dev` branch (which inherits the EPF directory)
3. User imports from `dev` on the server: `import_from_github(branch="dev")`
4. Server switches to tracking `dev` going forward
5. The EPF directory on `main` becomes stale (can be `.gitignore`d or
   removed in a cleanup commit)

The settings dashboard shows the active branch clearly, so the user
always knows which branch the server is syncing with.

### 4. Genesis flow: first push to GitHub

**Decision:** A genesis instance (created via `scaffold_instance` or built
from scratch on the server) gets to GitHub through the same `SyncToGithub`
mechanism used for ongoing sync. The flow is:

1. User creates instance on server (with or without `github_repo` set)
2. User works on it — fills in north star, adds features, runs AIM cycles
3. When ready to push to GitHub:
   a. If `github_repo` is not set, user sets it via `update_instance`
   b. User calls `sync_to_github` (or it auto-triggers on AIM cycle)
   c. Server exports YAML, creates branch + PR on the repo

**The repo must already exist on GitHub** — the server does not create repos.
For a genesis instance, the user creates an empty repo on GitHub, sets
`github_repo` on the instance, and the first sync populates it.

**Why not auto-create repos:** Creating GitHub repos requires org-level
permissions that the GitHub App may not have. It also involves naming
decisions that belong to the user. Keeping repo creation out of scope
keeps the server's permissions narrow.

**Rationale:** This reuses the existing `SyncToGithub` infrastructure with
zero new code. The only prerequisite is that `github_repo` is set, which
the `update_instance` tool handles.

### Three lifecycle flows

```
GENESIS:
  scaffold_instance -> work -> set github_repo -> sync_to_github (or AIM auto-push)
  
CONNECT:
  set github_repo -> import_from_github -> work -> AIM auto-push

ONGOING:
  (remote changes) -> import_from_github [safety PR if needed] -> work -> AIM auto-push
```

### 5. Instance settings update via dedicated method

**Decision:** Add `UpdateInstanceSettings` to `domain/instance/service.go`
that updates `github_repo` and `github_base_path`. Do not add a general-purpose
`UpdateInstance` that could change name, status, etc.

**Rationale:** Scoping the update to sync-related fields reduces risk. Instance
name and status changes have their own dedicated workflows.

### 6. Auto-push on AIM cycle version publish

**Decision:** When an AIM cycle publishes a version (the snapshot step), the
server automatically calls `SyncToGithub` to push the updated strategy to
GitHub. This happens as a post-step side effect, not as a blocking step in
the cycle workflow.

**Hook point:** The AIM orchestrator's snapshot step in
`pkg/orchestration/` already calls `versionSvc.PublishVersion`. The auto-push
is added as a follow-up call in the same step, after the version is committed.

**Branch naming:** `strategy-sync/<instance>/aim-cycle-<N>` where N is the
cycle number. This makes it easy to see the progression of strategy updates
in git history.

**PR description:** Includes the calibration decision, cycle number, and a
link back to the version detail page on the strategy server. This gives
the PR reviewer full context without needing to log into the server.

**Failure isolation:** If the GitHub push fails, the AIM cycle version is
still published. The failure is logged and recorded in the sync log. The
user can retry manually via `sync_to_github` or the settings page. AIM
cycles must never fail because of a GitHub integration issue.

**Rationale:** The AIM cycle is the natural cadence for strategy updates.
Rather than requiring manual sync, the server pushes automatically at the
moment the strategy is updated. This keeps the GitHub repo as the living
source of truth without user intervention.

### 8. Full sync transparency on settings page

**Decision:** The settings page is the sync dashboard. Each instance shows
its live sync state, commit SHAs, local change counts, and context-aware
action buttons. No information is hidden.

**Sync state is computed on page load:** The handler fetches the remote HEAD
SHA (one API call per linked instance) and compares it with the stored
`github_commit_sha` plus local change detection. The result is one of five
states: in-sync, server-ahead, behind, diverged, not-linked.

**Live SHA fetch cost:** For N linked instances, this is N API calls on page
load. With GitHub App installation tokens (5,000/hour limit) and typical
instance counts (< 20), this is negligible. If it becomes a concern, we can
cache the remote SHA with a short TTL (e.g. 60s).

**Context-aware buttons:** Rather than showing the same two buttons for
every state, the UI highlights the recommended action. "Server Ahead"
highlights push; "Behind" highlights import; "Diverged" shows both with
a note about safety PRs. This guides the user to the right action without
requiring them to understand the four-state matrix.

**Rationale:** The sync process must feel safe. Safety comes from
transparency — the user should always be able to answer: "What commit is
my server based on? What's on GitHub? Do I have local changes? What will
happen if I click this button?" The settings page answers all of these at
a glance.

### 9. PR merge detection via polling (no webhook)

**Decision:** When the settings page loads or `get_sync_status` is called,
check the latest sync log entry. If status is `pr_created` and the PR URL
exists, make a single GitHub API call to check if the PR is merged. Update
the sync log accordingly.

**Rationale:** Avoids the complexity of webhook registration, signature
verification, and a public endpoint. The check is lazy (only when requested)
and costs one API call per instance per page load at most.

## Risks / Trade-offs

- **Import overwrites local changes:** If a user modifies artifacts in the
  server and then imports from GitHub, local changes would be lost.
  Mitigation: the server automatically pushes the current state to a safety
  branch + PR before importing. Content that exists only on the server is
  preserved in git. If the safety push fails, the import is aborted entirely.

- **Safety PR noise:** Frequent imports could create many safety PRs.
  Mitigation: the safety PR is only created when the server state actually
  differs from the remote. Clean instances (no changes since last sync)
  import directly without creating a PR.

- **AIM auto-push failure:** If GitHub is unavailable when an AIM cycle
  completes, the push silently fails. Mitigation: the failure is logged and
  recorded in the sync log. The user can manually retry. The version is
  published regardless.

- **GitHub API rate limits:** The Tree + Blob fetch for a full import is
  ~2-5 API calls (1 tree + 1 blob per file, or 1 tree + parallel blob
  fetches). With GitHub App installation tokens, the rate limit is 5,000/hour.
  This is not a concern for manual imports.

- **Large repositories:** If the EPF instance is in a large monorepo, the
  recursive tree listing returns all files. Mitigation: use `github_base_path`
  to filter the tree to only the EPF subtree before fetching blobs.

## Migration Plan

1. Deploy read path code (no schema changes needed -- `github_repo` column
   already exists on `strategy_instances`)
2. Test the three flows end-to-end:
   a. Genesis: `scaffold_instance` -> set `github_repo` -> `sync_to_github`
   b. Connect: set `github_repo` -> `import_from_github`
   c. Ongoing: modify artifact -> `import_from_github` -> verify safety PR
3. Existing instances can be re-instantiated from their GitHub repos using
   the new `import_from_github` flow rather than CLI `import`
4. No rollback needed -- the feature is additive

## Open Questions

- Should `import_from_github` also trigger Memory re-ingestion automatically,
  or should that be a separate step? (Recommendation: trigger automatically,
  matching CLI `import --reingest` behavior)
- Should we add a "last imported from GitHub" timestamp to the instance model,
  or is the sync log sufficient? (Recommendation: sync log is sufficient for v1)
- For the genesis flow, should `scaffold_instance` prompt the user to create a
  GitHub repo and set `github_repo` immediately, or leave it as a separate step?
  (Recommendation: separate step — not all instances need GitHub sync)

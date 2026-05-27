## ADDED Requirements

### Requirement: Import from GitHub

The system SHALL support importing EPF artifacts from a GitHub repository into an existing strategy instance, completing the read path of the strategy-as-code lifecycle.

The system SHALL track the GitHub commit SHA that the instance was last imported from or synced to, enabling commit-aware sync decisions that prevent accidental downgrades and unnecessary overwrites. Conflict resolution happens in git, not in the server.

The import SHALL:

- Accept an instance ID and use its `github_repo` and `github_base_path` fields to locate the EPF artifacts
- Accept an optional `branch` parameter to target a specific branch instead of the repo's default branch. When omitted, the default branch is used (automated flow). When specified, the server imports from that branch (manual flow — e.g. working on a feature branch's strategy changes)
- Track the active branch on the instance (`github_branch`) so that subsequent sync operations (including AIM auto-push) target the same branch until the user switches back to default
- Fetch the remote HEAD commit SHA for the target branch before doing any work
- Compare the remote SHA against the instance's stored `github_commit_sha` and detect local changes (mutations since last sync) to determine the sync state
- Based on the sync state, take the appropriate action:
  - **Already in sync** (same SHA, no local changes): return early, nothing to do
  - **Server ahead** (same SHA, local changes): do NOT import — the server has enriched content built on top of the current GitHub version. Return a recommendation to push to GitHub instead
  - **GitHub ahead** (different SHA, no local changes): safe to import directly
  - **Diverged** (different SHA, local changes): push server state to a safety branch + PR first, then import the new GitHub content
- Parse YAML files through the same pipeline as CLI `import` (`scanEPFInstance` logic)
- After import, update `github_commit_sha` on the instance to the imported commit SHA
- Backfill the strategic index after import
- Optionally trigger Memory re-ingestion if Memory is configured
- Record the import in the sync log with source direction `import`

#### Scenario: Already in sync (same commit, no local changes)

- **WHEN** a user calls `import_from_github`
- **AND** the remote HEAD SHA matches the instance's `github_commit_sha`
- **AND** the instance has no local changes since last sync
- **THEN** the server returns a status indicating the instance is already in sync
- **AND** does NOT re-import or create any branches

#### Scenario: Server ahead (same commit, local enrichments)

- **WHEN** a user calls `import_from_github`
- **AND** the remote HEAD SHA matches the instance's `github_commit_sha`
- **AND** the instance has local changes (enriched via AIM cycles, authoring, etc.)
- **THEN** the server does NOT import (importing would be a downgrade)
- **AND** returns a response indicating the server is ahead of GitHub
- **AND** recommends pushing to GitHub instead (`sync_to_github`) to share the enriched state

#### Scenario: GitHub ahead (new commits, no local changes)

- **WHEN** a user calls `import_from_github`
- **AND** the remote HEAD SHA differs from the instance's `github_commit_sha`
- **AND** the instance has no local changes since last sync
- **THEN** the server imports directly (safe — no local content to preserve)
- **AND** updates `github_commit_sha` to the imported commit SHA
- **AND** records the import in the sync log

#### Scenario: Diverged (new commits AND local changes)

- **WHEN** a user calls `import_from_github`
- **AND** the remote HEAD SHA differs from the instance's `github_commit_sha`
- **AND** the instance has local changes since last sync
- **THEN** the server first pushes the current server-side artifacts to a safety branch (e.g. `strategy-backup/<instance>/<timestamp>`)
- **AND** opens a PR from that branch to the default branch
- **AND** then imports the new GitHub content, replacing all artifacts
- **AND** updates `github_commit_sha` to the imported commit SHA
- **AND** the import result includes the safety PR URL so the user can merge their enrichments in git

#### Scenario: Import with base path filters to subtree

- **WHEN** an instance has `github_base_path` set to `strategy/epf`
- **AND** a user triggers import from GitHub
- **THEN** the server only fetches YAML files under `strategy/epf/` in the repository
- **AND** artifact keys are derived relative to the base path

#### Scenario: Import fails when github_repo is not set

- **WHEN** a user calls `import_from_github` for an instance without `github_repo`
- **THEN** the server returns an error indicating no GitHub repo is configured
- **AND** suggests using `update_instance` to set the repo

#### Scenario: Import triggers Memory re-ingestion

- **WHEN** import from GitHub completes successfully
- **AND** Memory is configured
- **THEN** the server triggers asynchronous Memory re-ingestion for the instance
- **AND** both artifact-layer and decomposed-layer objects are updated

#### Scenario: Safety PR creation fails aborts import

- **WHEN** the server detects a diverged state and attempts to create a safety PR
- **AND** the GitHub API call fails (network error, permissions, etc.)
- **THEN** the server aborts the import without overwriting any artifacts
- **AND** returns an error explaining that the current state could not be preserved
- **AND** suggests the user manually sync to GitHub first or retry

#### Scenario: First import (no previous commit SHA)

- **WHEN** a user calls `import_from_github` on an instance that has never been imported
- **AND** `github_commit_sha` is NULL
- **THEN** the server treats it as a clean import (GitHub ahead, no local baseline to compare)
- **AND** imports the artifacts and sets `github_commit_sha` to the current HEAD

#### Scenario: Sync to GitHub updates commit SHA

- **WHEN** a user calls `sync_to_github` and a PR is created
- **AND** the PR is later detected as merged
- **THEN** the server updates `github_commit_sha` to the merge commit SHA
- **AND** subsequent imports use this SHA as the baseline for comparison

#### Scenario: Import from a specific branch

- **WHEN** a user calls `import_from_github` with `branch="feature/new-strategy"`
- **THEN** the server imports artifacts from the `feature/new-strategy` branch instead of the default branch
- **AND** sets `github_branch` on the instance to `feature/new-strategy`
- **AND** sets `github_commit_sha` to the HEAD of that branch
- **AND** subsequent syncs (including AIM auto-push) target `feature/new-strategy` until the user switches back

#### Scenario: Push enrichments back to feature branch

- **WHEN** an instance was imported from `feature/new-strategy`
- **AND** `github_branch` is set to `feature/new-strategy`
- **AND** a user calls `sync_to_github` or an AIM cycle auto-pushes
- **THEN** the server creates a branch off `feature/new-strategy` (not the default branch)
- **AND** opens a PR targeting `feature/new-strategy`
- **AND** the user can merge the enrichments into the feature branch in GitHub

#### Scenario: Switch back to default branch

- **WHEN** a user calls `import_from_github` without specifying a `branch` (or with `branch=""`)
- **AND** the instance currently has `github_branch` set to a feature branch
- **THEN** the server switches back to the default branch
- **AND** clears `github_branch` (NULL means default branch)
- **AND** imports from the default branch HEAD
- **AND** the commit-aware sync state comparison uses the default branch HEAD

#### Scenario: Long-lived dev branch for mature product

- **WHEN** a product uses git-flow with a `dev` branch for development
- **AND** the EPF instance lives on `dev` (it is documentation, not deployable code)
- **AND** a user imports from `dev`: `import_from_github(branch="dev")`
- **THEN** the server sets `github_branch` to `dev` permanently
- **AND** all subsequent syncs (manual and AIM auto-push) target `dev`
- **AND** the EPF instance never needs to merge to `main`/`prod`

#### Scenario: Transition from main to dev branch

- **WHEN** a product initially has its EPF instance on `main`
- **AND** the team adopts git-flow and creates a `dev` branch
- **AND** a user imports from `dev`: `import_from_github(branch="dev")`
- **THEN** the server switches from tracking `main` to tracking `dev`
- **AND** updates `github_branch` and `github_commit_sha` accordingly
- **AND** all subsequent syncs target `dev`

---

### Requirement: Update Instance Settings

The system SHALL allow updating GitHub-related settings on an existing strategy instance.

The update SHALL:

- Accept instance ID, `github_repo` (owner/repo slug), and optional `github_base_path`
- Validate that the repo slug is well-formed (contains exactly one `/`)
- Update the instance record in the database
- Record the change in the audit log

#### Scenario: Set github_repo on an existing instance

- **WHEN** a user calls `update_instance` with `github_repo="org/repo"`
- **AND** the instance exists and is not archived
- **THEN** the server updates the instance's `github_repo` field
- **AND** records the change in the audit log

#### Scenario: Set github_base_path for monorepo

- **WHEN** a user calls `update_instance` with `github_base_path="packages/strategy"`
- **THEN** the server updates the instance's `github_base_path` field
- **AND** subsequent imports and syncs use this path prefix

#### Scenario: Invalid repo slug is rejected

- **WHEN** a user calls `update_instance` with `github_repo="not-a-valid-slug"`
- **THEN** the server returns a validation error

#### Scenario: Clear github_repo

- **WHEN** a user calls `update_instance` with `github_repo=""`
- **THEN** the server clears the instance's `github_repo` field
- **AND** subsequent sync operations return "no repo configured"

---

### Requirement: GitHub Sync Dashboard

The settings page SHALL provide full transparency into the sync state and history of each strategy instance, serving as the single source of truth for understanding where each instance stands in the strategy-as-code lifecycle.

Each instance row in the GitHub sync card SHALL display:

- **Sync state indicator**: a color-coded badge showing one of: `In Sync` (green), `Server Ahead` (blue — server has enrichments to push), `Behind` (yellow — GitHub has newer content), `Diverged` (orange — both sides changed), `Not Linked` (grey — no `github_repo` set)
- **Repository link**: clickable `owner/repo` slug linking to the GitHub repository
- **Active branch**: the branch the instance is tracking (`github_branch`), shown as a branch badge when not on default branch. Includes a dropdown or link to switch branches.
- **Commit SHAs**: the server's baseline SHA (`github_commit_sha`, truncated to 7 chars) and the remote HEAD SHA (fetched live or cached), with visual diff when they differ
- **Local change summary**: count of pending staged batches and artifacts modified since last sync, shown when non-zero
- **Last sync event**: timestamp, direction (import/export/auto-push), and outcome (success, failed, PR link)
- **Action buttons**: context-aware buttons whose labels and availability change based on the sync state
- **Sync history**: expandable section showing recent sync log entries with direction, source, outcome, and PR links

The action buttons SHALL be context-aware:

- **Not Linked**: show "Configure" button to set `github_repo`
- **In Sync**: both "Push to GitHub" and "Import from GitHub" available but no urgency
- **Server Ahead**: highlight "Push to GitHub" as the recommended action; "Import from GitHub" available but shows a note that it would check for remote changes first
- **Behind**: highlight "Import from GitHub" as the recommended action
- **Diverged**: show both buttons; "Import from GitHub" will note that a safety PR will be created first

#### Scenario: Settings page shows live sync state per instance

- **WHEN** a user opens the settings page
- **THEN** each instance with `github_repo` set shows its current sync state badge
- **AND** the state is computed by comparing `github_commit_sha` with the remote HEAD and checking for local changes
- **AND** the commit SHAs are visible for transparency

#### Scenario: Sync state updates after action

- **WHEN** a user triggers "Push to GitHub" or "Import from GitHub"
- **THEN** the settings page refreshes and shows the updated sync state
- **AND** the last sync event row reflects the action just taken
- **AND** any safety PR URL is shown as a clickable link

#### Scenario: Local changes shown as warning

- **WHEN** an instance has pending staged batches or modified artifacts
- **THEN** the sync card shows a count of local changes (e.g. "3 pending batches, 7 modified artifacts")
- **AND** this information is visible regardless of sync state

#### Scenario: Sync history shows recent events

- **WHEN** a user expands the sync history for an instance
- **THEN** they see the most recent sync log entries (up to 10)
- **AND** each entry shows: timestamp, direction (import/export), source (manual/aim-cycle), status (success/failed/pr-created/merged), and PR link if applicable

#### Scenario: Context-aware button for server-ahead state

- **WHEN** an instance is in the "Server Ahead" state
- **THEN** the "Push to GitHub" button is visually highlighted as the recommended action
- **AND** the "Import from GitHub" button is available but not highlighted
- **AND** a brief note explains that the server has enrichments built on top of the current GitHub version

#### Scenario: Context-aware button for diverged state

- **WHEN** an instance is in the "Diverged" state
- **THEN** both buttons are available
- **AND** the "Import from GitHub" button includes a note that a safety PR will be created to preserve server-side changes before importing

#### Scenario: Not-linked instance shows configure action

- **WHEN** an instance does not have `github_repo` set
- **THEN** the sync card shows "Not Linked" state
- **AND** shows a "Configure" button or link to set the repository
- **AND** does not show import/push buttons

#### Scenario: Active branch shown when not on default

- **WHEN** an instance has `github_branch` set to a non-default branch (e.g. `feature/new-strategy`)
- **THEN** the sync card shows a branch badge next to the repo slug (e.g. `org/repo @ feature/new-strategy`)
- **AND** a "Switch to default" action is available to return to the default branch

---

### Requirement: GitHub Read API

The `internal/github/client.go` SHALL provide read methods for fetching repository content.

The client SHALL:

- Provide `GetTree(ctx, owner, repo, branch string) ([]TreeEntry, error)` to list all files recursively via the Git Tree API
- Provide `GetBlob(ctx, owner, repo, sha string) ([]byte, error)` to fetch file content via the Git Blobs API
- Use the same GitHub App installation token mechanism as the write methods
- Return decoded (base64) file content from blobs

#### Scenario: Fetch recursive file tree

- **WHEN** the server calls `GetTree` for a repository
- **THEN** the client returns a list of all files with their paths, sizes, and blob SHAs
- **AND** the listing is recursive (includes files in subdirectories)

#### Scenario: Fetch file content by blob SHA

- **WHEN** the server calls `GetBlob` with a blob SHA
- **THEN** the client returns the decoded file content as bytes

#### Scenario: Tree API respects installation token

- **WHEN** the server calls `GetTree` or `GetBlob`
- **THEN** the client uses a GitHub App installation token for authentication
- **AND** the token is obtained via the same `GetInstallationToken` flow as write operations

---

### Requirement: Sync PR Merge Detection

The system SHALL detect when a previously created sync PR has been merged on GitHub.

The detection SHALL:

- Check PR merge status lazily when sync history is loaded (settings page, `get_sync_status` MCP tool)
- Update the sync log entry from `pr_created` to `merged` when the PR is detected as merged
- Use the GitHub App installation token to check PR status (one API call per PR)
- Not require webhook configuration

#### Scenario: Detect merged PR on settings page load

- **WHEN** the settings page loads and a sync log entry has status `pr_created`
- **AND** the PR URL points to a merged pull request
- **THEN** the sync log entry is updated to `merged`
- **AND** the settings page shows "Merged" status

#### Scenario: PR still open shows existing status

- **WHEN** the settings page loads and a sync log entry has status `pr_created`
- **AND** the PR is still open
- **THEN** the sync log entry remains `pr_created`
- **AND** the settings page shows "PR Created" with a link

#### Scenario: PR closed without merging

- **WHEN** the settings page loads and a sync log entry has status `pr_created`
- **AND** the PR was closed without merging
- **THEN** the sync log entry is updated to `closed`
- **AND** the settings page shows "Closed" status

---

### Requirement: GitHub Sync State Tracking

The system SHALL track the GitHub sync state on each instance record, including the commit SHA and active branch, enabling commit-aware sync decisions and branch-targeted workflows.

The instance record SHALL store:

- `github_commit_sha` — the SHA of the commit the instance was last imported from or synced to. NULL for instances that have never been synced.
- `github_branch` — the branch the instance is currently tracking. NULL means the repo's default branch (main/master). Set when importing from a specific branch.

The tracking SHALL:

- Set `github_commit_sha` when artifacts are imported from GitHub (to the HEAD SHA of the imported commit on the target branch)
- Set `github_commit_sha` when a sync PR is detected as merged (to the merge commit SHA)
- Set `github_branch` when importing from a non-default branch; clear it when switching back to default
- Use both fields in the import pre-flight check to determine the sync state against the correct branch
- Be stored as new columns on `strategy_instances` (migration required)

#### Scenario: Commit SHA set on import

- **WHEN** artifacts are imported from GitHub
- **THEN** `github_commit_sha` is set to the HEAD commit SHA of the target branch

#### Scenario: Commit SHA updated on PR merge

- **WHEN** a sync PR is detected as merged
- **THEN** `github_commit_sha` is updated to the merge commit SHA

#### Scenario: Tracking fields are NULL for genesis instances

- **WHEN** an instance is created via `scaffold_instance` with no prior GitHub sync
- **THEN** `github_commit_sha` and `github_branch` are both NULL

#### Scenario: Branch set on feature branch import

- **WHEN** a user imports from branch `feature/new-strategy`
- **THEN** `github_branch` is set to `feature/new-strategy`
- **AND** `github_commit_sha` is set to the HEAD of that branch
- **AND** subsequent sync operations target `feature/new-strategy`

---

### Requirement: Genesis Push to GitHub

The system SHALL support pushing a genesis instance (created on the server with no prior GitHub presence) to a GitHub repository for the first time.

A genesis instance is one created via `scaffold_instance` or manual authoring that has never been synced to GitHub. The flow uses the existing `SyncToGithub` mechanism — no new infrastructure is needed.

The genesis push SHALL:

- Require that `github_repo` is set on the instance (via `update_instance`)
- Require that the target GitHub repository already exists (the server does not create repos)
- Export all artifacts as YAML and create a branch + PR on the repository
- Work identically to a regular `sync_to_github` call — the genesis case is not special-cased

#### Scenario: Push genesis instance to empty GitHub repo

- **WHEN** a user creates an instance via `scaffold_instance` and fills in artifacts
- **AND** the user sets `github_repo` to an existing (empty) GitHub repository
- **AND** the user calls `sync_to_github`
- **THEN** the server exports all artifacts as YAML
- **AND** creates a branch with the full EPF directory structure
- **AND** opens a PR to the default branch

#### Scenario: AIM cycle auto-pushes genesis instance

- **WHEN** a genesis instance has `github_repo` set
- **AND** an AIM cycle publishes a version
- **THEN** the auto-push mechanism creates a branch + PR with the strategy content
- **AND** this is the first commit of strategy-as-code to the repository

#### Scenario: Genesis push without github_repo set

- **WHEN** a user calls `sync_to_github` on an instance without `github_repo`
- **THEN** the server returns an error indicating no GitHub repo is configured
- **AND** suggests using `update_instance` to set the repo first

---

### Requirement: GitHub Repo Reader Interface

The `domain/sync/` package SHALL define a `RepoReader` interface as the counterpart to the existing `RepoWriter`, abstracting read operations on a GitHub repository.

The interface SHALL:

- Define `ListFiles(ctx, owner, repo, branch, basePath string) ([]FileEntry, error)` to list YAML files in the EPF directory structure
- Define `GetFileContent(ctx, owner, repo, sha string) ([]byte, error)` to fetch individual file content
- Be implemented by `internal/github/adapter.go` using the GitHub App client
- Be injected into the sync service at startup alongside `RepoWriter`

#### Scenario: Adapter implements RepoReader

- **WHEN** the server starts with GitHub App configured
- **AND** `RepoReader` is injected into the sync service
- **THEN** the sync service can call `ListFiles` and `GetFileContent` to read from GitHub

#### Scenario: RepoReader not available without GitHub App

- **WHEN** the server starts without GitHub App configuration
- **THEN** `RepoReader` is nil in the sync service
- **AND** import-from-GitHub operations return "GitHub App not configured"

---

### Requirement: Auto-Push to GitHub on AIM Cycle Version

The system SHALL automatically push strategy artifacts to GitHub when an AIM cycle publishes a new version, keeping the GitHub repository in sync with the strategy server's evolving state.

An AIM cycle is the natural checkpoint where strategy is reviewed, calibrated, and updated. Publishing a version at the end of a cycle is the right moment to write the updated strategy-as-code back to the source of truth.

The auto-push SHALL:

- Trigger automatically when an AIM cycle run reaches the snapshot step (version publish)
- Use the same `SyncToGithub` mechanism as manual sync (branch + commit + PR)
- Use a descriptive branch name that includes the AIM cycle number (e.g. `strategy-sync/<instance>/aim-cycle-<N>`)
- Include the AIM cycle decision (persevere/pivot/pull_the_plug) and cycle number in the PR description
- Only trigger when `github_repo` is set on the instance and the GitHub App is configured
- Silently skip (log a warning) when GitHub sync is not configured — the AIM cycle itself MUST NOT fail because of sync issues
- Record the sync in the sync log with source `aim_cycle` and the cycle number

#### Scenario: AIM cycle publishes version and auto-pushes to GitHub

- **WHEN** an AIM cycle run completes the snapshot step (publishing a new version)
- **AND** the instance has `github_repo` set
- **AND** the GitHub App is configured
- **THEN** the server automatically creates a branch with the exported YAML artifacts
- **AND** opens a PR with the AIM cycle decision and summary in the description
- **AND** records the sync in the sync log

#### Scenario: AIM cycle skips auto-push when GitHub not configured

- **WHEN** an AIM cycle run completes the snapshot step
- **AND** the instance does not have `github_repo` set or the GitHub App is not configured
- **THEN** the AIM cycle completes successfully without attempting a sync
- **AND** a debug-level log message notes that auto-push was skipped

#### Scenario: Auto-push failure does not block AIM cycle

- **WHEN** an AIM cycle auto-push fails (GitHub API error, branch conflict, etc.)
- **THEN** the AIM cycle version is still published successfully
- **AND** the sync log records the failure
- **AND** a warning-level log message is emitted
- **AND** the user can manually trigger `sync_to_github` later to retry

#### Scenario: PR description includes AIM cycle context

- **WHEN** an AIM cycle auto-push creates a PR
- **THEN** the PR title includes the instance name and cycle number
- **AND** the PR body includes: the calibration decision (persevere/pivot/pull_the_plug), a summary of what changed, and a link to the version detail page on the strategy server

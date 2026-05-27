## 1. GitHub Read API (internal/github)

- [x] 1.1 Add `TreeEntry` struct (path, type, sha, size) to `internal/github/client.go`
- [x] 1.2 Add `GetTree(ctx, owner, repo, branch string) ([]TreeEntry, error)` — calls `GET /repos/:owner/:repo/git/trees/:sha?recursive=1` using the branch's HEAD SHA
- [x] 1.3 Add `GetBlob(ctx, owner, repo, sha string) ([]byte, error)` — calls `GET /repos/:owner/:repo/git/blobs/:sha`, decodes base64 content
- [x] 1.4 Add unit tests for `GetTree` and `GetBlob` using `httptest` mock (same pattern as existing `client_test.go`)

## 2. RepoReader Interface (domain/sync)

- [x] 2.1 Add `RepoReader` interface to `domain/sync/service.go` with `ListFiles` and `GetFileContent` methods
- [x] 2.2 Add `RepoReaderAdapter` to `internal/github/adapter.go` — adapts `github.Client` to `RepoReader`
  - `ListFiles` calls `GetTree` + filters to `.yaml`/`.yml` files under `basePath`
  - `GetFileContent` calls `GetBlob`
- [x] 2.3 Wire `RepoReader` into sync service constructor in `cmd_serve.go` (nil when GitHub App not configured)

## 3. Extract YAML Parsing Pipeline

- [x] 3.1 Extract `scanEPFInstance` core logic from `cmd_import.go` into a shared function `ParseYAMLPayloads(files map[string][]byte) (map[string]any, string, error)` — accepts filename-to-content map instead of filesystem path
- [x] 3.2 Refactor CLI `scanEPFInstance` to read files from disk then call `ParseYAMLPayloads`
- [x] 3.3 Verify existing CLI import tests still pass

## 4. Sync State Tracking

- [x] 4.1 Add `github_commit_sha` and `github_branch` columns to `strategy_instances` (migration 030): `github_commit_sha VARCHAR(40)` nullable, `github_branch VARCHAR(255)` nullable (NULL = default branch)
- [x] 4.2 Add `GithubCommitSHA *string` and `GithubBranch *string` fields to `domain.StrategyInstance` struct
- [x] 4.3 Add `GetHeadCommitSHA(ctx, token, owner, repo, branch string) (string, error)` to `internal/github/client.go` — calls `GET /repos/:owner/:repo/git/ref/heads/:branch` to get the HEAD SHA
- [x] 4.4 Add unit test for `GetHeadCommitSHA`

## 5. Import from GitHub (domain/sync)

- [x] 5.1 Add `SyncState` type with constants: `SyncStateInSync`, `SyncStateServerAhead`, `SyncStateGithubAhead`, `SyncStateDiverged`
- [x] 5.2 Add `DetermineSyncState(ctx, instanceID uuid.UUID, branch string) (*SyncStateResult, error)` to `domain/sync/service.go`
  - Loads instance, validates `github_repo` is set
  - Resolves target branch: uses `branch` param if provided, else `github_branch` on instance, else default branch
  - Gets installation token, fetches remote HEAD SHA via `GetHeadCommitSHA` for the target branch
  - Compares remote SHA to instance's `github_commit_sha`
  - Detects local changes (pending staged batches, mutations since last sync log entry)
  - Returns `SyncStateResult{State, RemoteSHA, LocalSHA, TargetBranch, HasLocalChanges, PendingBatches, ModifiedArtifacts}`
- [x] 5.3 Add `ImportFromGithub(ctx, params ImportParams) (*ImportResult, error)` to `domain/sync/service.go`
  - Accepts optional `Branch` field on `ImportParams`
  - Calls `DetermineSyncState` to get the sync state against the target branch
  - **InSync**: return `ImportResult{Status: "already_in_sync"}` — no work needed
  - **ServerAhead**: return `ImportResult{Status: "server_ahead", Recommendation: "push"}` — decline import
  - **GithubAhead**: proceed with import directly (no safety PR needed)
  - **Diverged**: push current state to safety branch + PR, then import. Abort if safety push fails.
  - After import: update `github_commit_sha` to the imported remote HEAD SHA; update `github_branch` if a non-default branch was specified (or clear it if switching back to default)
  - Calls `RepoReader.ListFiles` + `GetFileContent` + `ParseYAMLPayloads` + `ReimportArtifacts` + `BackfillIndex`
  - Records import in sync log
- [x] 5.4 Add `ImportParams`, `ImportResult`, and `SyncStateResult` types
  - `ImportParams` includes optional `Branch string`
  - `ImportResult` includes `Status string`, `SafetyPRUrl string`, `ArtifactCount int`, `Recommendation string`, `TargetBranch string`
- [x] 5.5 Add integration tests with mock `RepoReader`:
  - Test all four sync states (in-sync, server-ahead, github-ahead, diverged)
  - Test safety PR abort on GitHub API failure
  - Test first import (NULL commit SHA)
- [x] 5.6 Optionally trigger Memory re-ingestion after successful import (when Memory configured)

## 6. Sync Log Enhancement

- [x] 6.1 Add `direction` column to `github_sync_log` table (migration 031): `export` (default, backward-compatible) or `import`
- [x] 6.2 Update `loadGithubSyncStatuses` to show both import and export history
- [x] 6.3 Add `closed` to sync status enum for PRs closed without merge

## 7. Update Instance Settings

- [x] 7.1 Add `UpdateInstanceSettings(ctx, id uuid.UUID, params UpdateSettingsParams) error` to `domain/instance/service.go`
  - Validates repo slug format (must contain exactly one `/`)
  - Updates `github_repo` and `github_base_path` on the instance record
  - Records audit entry
- [x] 7.2 Add `update_instance` MCP tool to `internal/mcpserver/register_sync_tools.go`
  - Accepts `instance_id`, `github_repo`, `github_base_path`
- [x] 7.3 Add unit test for `UpdateInstanceSettings` (valid slug, invalid slug, clear repo)

## 8. Import from GitHub MCP Tool

- [x] 8.1 Add `import_from_github` MCP tool to `internal/mcpserver/register_sync_tools.go`
  - Accepts `instance_id` and optional `branch` (string — import from a specific branch; omit for default/tracked branch)
  - Returns sync state and takes appropriate action (import, recommend push, safety PR + import, or no-op)
  - On success: returns sync state, target branch, artifact count, safety PR URL if created, recommendation if server-ahead
- [x] 8.2 Add the new tools to `toolCategories` in `internal/mcpserver/tool_filter.go` (category: `admin`)

## 9. PR Merge Detection

- [x] 9.1 Add `GetPullRequestState(ctx, owner, repo string, prNumber int) (string, error)` to `internal/github/client.go` — returns `open`, `closed`, or `merged`
- [x] 9.2 Add `CheckAndUpdateSyncStatus(ctx, instanceID uuid.UUID) error` to `domain/sync/service.go`
  - For each sync log entry with status `pr_created`: extract PR number from URL, call `GetPullRequestState`, update status to `merged` or `closed` if changed
  - When a PR is detected as merged: also update `github_commit_sha` on the instance to the merge commit SHA
- [x] 9.3 Call `CheckAndUpdateSyncStatus` from `loadGithubSyncStatuses` in `handler_settings.go` (lazy check on page load)
- [x] 9.4 Add unit test for `GetPullRequestState`

## 10. Settings Page — Sync Dashboard

- [x] 10.1 Add `GithubSyncDashboardData` struct to `internal/ui/settings.templ`
  - Extends current `GithubSyncStatus` with: `SyncState string` (in_sync/server_ahead/behind/diverged/not_linked), `LocalSHA string`, `RemoteSHA string`, `PendingBatches int`, `ModifiedArtifacts int`, `SyncHistory []SyncLogEntry`
- [x] 10.2 Add `loadSyncDashboard(ctx, instanceID) GithubSyncDashboardData` to `handler_settings.go`
  - Calls `syncSvc.DetermineSyncState` per linked instance (fetches remote HEAD SHA)
  - Counts pending batches and modified artifacts
  - Loads last 10 sync log entries
- [x] 10.3 Redesign `githubSyncRow` templ component for full transparency:
  - Sync state badge (color-coded: green/blue/yellow/orange/grey)
  - Clickable repo slug linking to GitHub
  - Active branch badge when not on default (e.g. `@ feature/new-strategy`) with "switch to default" action
  - Commit SHA display: server SHA (truncated 7 chars) vs remote SHA, visual diff when they differ
  - Local change summary (pending batches, modified artifacts) when non-zero
  - Last sync event (timestamp, direction icon, outcome)
- [x] 10.4 Add context-aware action buttons:
  - "Not Linked": "Configure" button only
  - "In Sync": both "Push" and "Import" available, neutral styling
  - "Server Ahead": "Push to GitHub" highlighted (primary), "Import" available with note
  - "Behind": "Import from GitHub" highlighted (primary), "Push" available
  - "Diverged": both buttons, "Import" includes safety-PR note
- [x] 10.5 Add expandable sync history section per instance
  - Shows recent sync log entries: timestamp, direction (import/export icon), source (manual/aim-cycle badge), status badge, PR link
- [x] 10.6 Add `handleSettingsImport` handler to `handler_settings.go`
  - Calls `syncSvc.ImportFromGithub`
  - Redirects back to `/settings` with flash message (imported, already-in-sync, server-ahead recommendation, safety PR URL)
- [x] 10.7 Add flash message rendering to settings page (success/info/warning banners that appear after actions)
- [x] 10.8 Run `templ generate` and `task css` and rebuild binary

## 11. Instance Settings UI

- [x] 11.1 Add GitHub repo configuration section to instance settings page (or create one if it doesn't exist)
  - Input for `github_repo` (owner/repo slug)
  - Input for `github_base_path` (optional)
  - Save button that POSTs to a new handler
- [x] 11.2 Add `handleInstanceSettingsUpdate` handler
- [x] 11.3 Register route in `handler.go`

## 12. AIM Cycle Auto-Push to GitHub

- [x] 12.1 Identify the AIM cycle snapshot step in `pkg/orchestration/` or `domain/aim/` where `PublishVersion` is called
- [x] 12.2 Add post-publish hook: if `github_repo` is set and GitHub App is configured, call `SyncToGithub` with branch name `strategy-sync/<instance>/aim-cycle-<N>`, targeting `github_branch` if set (else default branch)
- [x] 12.3 Build the PR description from AIM cycle context: calibration decision, cycle number, version label, link to version detail page
- [x] 12.4 If sync fails, log warning and record failure in sync log — do NOT fail the AIM cycle
- [x] 12.5 Add `source` field to sync log entries: `manual` (default), `aim_cycle` (with cycle number metadata)
- [x] 12.6 Add test: mock GitHub client, run AIM cycle to snapshot, verify `SyncToGithub` called with correct branch name and PR description
- [x] 12.7 Add test: mock GitHub client that returns error, verify AIM cycle still succeeds and sync log records failure

## 13. Knowledge Base & Documentation

- [x] 13.1 Update `internal/agent/knowledge.go` topic on GitHub sync to document the three flows (genesis, connect, ongoing), smart sync states, and auto-push
- [x] 13.2 Update `AGENTS.md` sync tool inventory with new tools
- [x] 13.3 Update `toolCategories` map documentation

## 14. End-to-End Verification

- [x] 14.1 Test genesis flow: `scaffold_instance` -> fill in artifacts -> `update_instance` (set `github_repo`) -> `sync_to_github` -> verify PR created with full EPF directory structure
- [x] 14.2 Test connect flow: `update_instance` (set `github_repo` pointing to existing repo) -> `import_from_github` -> verify artifacts loaded, `github_commit_sha` set
- [x] 14.3 Test server-ahead: import from GitHub -> enrich via AIM cycle -> call `import_from_github` again -> verify it returns "server ahead, recommend push" (no overwrite)
- [x] 14.4 Test github-ahead: import -> push new commit to repo externally -> call `import_from_github` -> verify clean import, `github_commit_sha` updated
- [x] 14.5 Test diverged: import -> enrich on server AND push to repo externally -> call `import_from_github` -> verify safety PR created, then import proceeds
- [x] 14.6 Test already-in-sync: import -> call `import_from_github` again with no changes -> verify no-op
- [x] 14.7 Test AIM auto-push: run AIM cycle to completion -> verify sync PR created with cycle context in description
- [x] 14.8 Test AIM auto-push failure isolation: simulate GitHub failure during AIM cycle -> verify version published, sync log shows failure
- [x] 14.9 Test PR merge detection: create sync PR -> merge it -> reload settings -> verify status shows "Merged" and `github_commit_sha` updated
- [x] 14.10 Test safety PR abort: simulate GitHub API failure during safety push -> verify import is aborted, no artifacts overwritten
- [x] 14.11 Test branch workflow: import from `feature/x` -> verify `github_branch` set -> enrich -> `sync_to_github` -> verify PR targets `feature/x` (not main)
- [x] 14.12 Test branch switch back: import from `feature/x` -> import without branch -> verify `github_branch` cleared, imported from default branch
- [x] 14.13 Test AIM auto-push on feature branch: set `github_branch` to `feature/x` -> run AIM cycle -> verify sync PR targets `feature/x`
- [x] 14.14 Run full test suite: `go test ./...`

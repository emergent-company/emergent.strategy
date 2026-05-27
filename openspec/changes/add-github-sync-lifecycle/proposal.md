# Change: Complete GitHub Sync Lifecycle (Strategy-as-Code)

## Why

The strategy-server's core value proposition is managing strategy-as-code: load
EPF artifacts from a GitHub repository, work on them through MCP tools and the
web UI, then write changes back as YAML to GitHub. Today only the write path
works (export DB to YAML, create branch + commit + PR). The read path is
completely missing -- instances are populated via a CLI `import` subcommand that
reads from the local filesystem, and none of the 6 production instances have
`github_repo` set, so even the existing write path cannot be used.

This change completes the lifecycle with three distinct flows:

```
GENESIS:   scaffold on server -> work -> set github_repo -> sync (or AIM auto-push)
CONNECT:   set github_repo -> import from GitHub -> work -> AIM auto-push
ONGOING:   (remote changes) -> import [safety PR if needed] -> work -> AIM auto-push
```

## What Changes

### 1. GitHub Read Path (`RepoReader`)
- Add `GetTree` and `GetFileContent` methods to `internal/github/client.go`
- Add `RepoReader` interface in `domain/sync/service.go` (counterpart to `RepoWriter`)
- Add `ImportFromGithub` domain method: fetch YAML tree from GitHub, parse
  through existing `scanEPFInstance` pipeline, upsert into DB
- Add `import_from_github` MCP tool
- Add web UI "Import from GitHub" action on settings page

### 2. Safe Import (Push-Before-Import)
- Before overwriting server-side artifacts with GitHub content, the server
  automatically pushes the current state to a safety branch + PR on GitHub
- This ensures content that exists only on the server is never lost
- Conflict resolution happens in git (via the PR), not in the server
- If the safety push fails, the import is aborted entirely

### 3. Genesis Flow (First Push to GitHub)
- A new instance created on the server gets to GitHub via the existing
  `sync_to_github` mechanism — no special-casing needed
- User creates empty repo on GitHub, sets `github_repo` on the instance,
  then syncs (manually or via AIM auto-push)
- The server does not create GitHub repos (requires org-level permissions)

### 4. Auto-Push on AIM Cycle Version Publish
- When an AIM cycle publishes a new version (the snapshot step), the server
  automatically syncs the updated strategy to GitHub as a branch + PR
- The AIM cycle is the natural checkpoint for strategy updates — the right
  moment to write changes back to the source of truth
- PR description includes AIM cycle context (decision, cycle number, link
  to version detail)
- Sync failures do not block the AIM cycle — logged and retryable

### 5. Instance GitHub Settings
- Add `UpdateInstanceSettings` method to `domain/instance/service.go`
- Add `update_instance` MCP tool (set `github_repo`, `github_base_path`)
- Add web UI for configuring repo link on existing instances

### 6. Settings Page Sync Actions
- Add "Sync to GitHub" button per instance (handler exists but UI has no button)
- Add "Import from GitHub" button per instance
- Show sync result feedback (safety PR link, import count, errors)

### 7. Sync Status Tracking
- Set `SyncStatusMerged` when a sync PR is detected as merged (poll-based)
- Show richer sync status (last import, last export, PR state, direction)

## Impact

- Affected specs: `epf-strategy-server`
- Affected code:
  - `internal/github/client.go` — add read methods (`GetTree`, `GetBlob`, `GetPullRequestState`)
  - `internal/github/adapter.go` — add `RepoReader` adapter
  - `domain/sync/service.go` — add `ImportFromGithub`, `RepoReader` interface, safety PR logic
  - `domain/instance/service.go` — add `UpdateInstanceSettings`
  - `domain/aim/` or `pkg/orchestration/` — add post-publish auto-push hook
  - `internal/mcpserver/register_sync_tools.go` — add `import_from_github`, `update_instance` tools
  - `internal/handler/handler_settings.go` — add sync/import buttons, import handler
  - `internal/ui/settings.templ` — add action buttons to GitHub sync card
  - `cmd_import.go` — extract `scanEPFInstance` to shared package for reuse

## Non-Goals

- **GitHub repo creation**: The server does not create repos. Users create
  repos on GitHub and set `github_repo` on the instance.
- **Webhook-based real-time sync**: No GitHub webhook handler for v1. Users
  trigger import manually or via MCP tool. AIM cycles auto-push.
- **In-server conflict resolution**: No merge/rebase logic in the server.
  Import pushes a safety PR with the current state first, then overwrites.
  Conflict resolution happens in git via the PR.
- **GitHub App installation UI**: Users still install the GitHub App manually
  and configure env vars.
- **Bidirectional continuous sync**: Import is manual. Export is manual or
  auto-triggered by AIM cycles.

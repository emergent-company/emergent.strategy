# Change: Strategy Web UI Phase C — Signal Actions, Version Browser, GitHub Sync Trigger

## Why

The web UI is read-only in all three areas that users care most about after committing a change:
coherence signals have no action buttons, there is no way to browse version history, and the settings
page has no GitHub sync trigger. These three gaps make the UI a passive observer rather than a usable
tool for strategy management.

## What Changes

- **Signal actions** — Add acknowledge, dismiss, and resolve buttons to each coherence signal card.
  Each action is a lightweight HTMX POST to a new endpoint; the card is replaced in-place with the
  updated status. No page reload.
- **Version browser** — New `/aim/versions` screen in the nav listing all published versions
  (label, date, artifact count, source). Each row links to a detail view with the diff from its
  parent version. Restore button triggers an MCP-style service call and redirects to the instance
  dashboard.
- **GitHub sync trigger** — New "GitHub Sync" card in the instance settings page showing last sync
  status and a "Sync to GitHub" button. Button fires an HTMX POST; response replaces the card with
  the new sync log entry (PR number + URL). Shows clear guidance when `github_repo` is not configured.

## Impact

- Affected capabilities: `strategy-web`
- Affected code:
  - `internal/ui/coherence_view.templ` — add action buttons per card
  - `internal/handler/handler_coherence.go` — add POST endpoints for ack/dismiss/resolve
  - `internal/ui/versions_view.templ` — new file
  - `internal/handler/handler_versions.go` — new file
  - `internal/navigation/graph.go` — add AIM-Versions node
  - `internal/ui/settings.templ` — add GitHub sync card
  - `internal/handler/handler_settings.go` — add POST sync endpoint
  - `internal/handler/routes.go` — register new routes
- No new migrations (reads from existing `ripple_signals`, `strategy_versions`, `github_sync_log`)
- No new MCP tools (uses existing domain services directly)
- No breaking changes

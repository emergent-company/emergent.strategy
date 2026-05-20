## 1. Signal Actions

- [x] 1.1 Add POST `/strategies/:id/aim/coherence/signals/:signalID/acknowledge` endpoint
- [x] 1.2 Add POST `/strategies/:id/aim/coherence/signals/:signalID/dismiss` endpoint (requires `reason` form field)
- [x] 1.3 Add POST `/strategies/:id/aim/coherence/signals/:signalID/resolve` endpoint
- [x] 1.4 Add `signalActionButtons` templ component — 3 buttons, HTMX `hx-post`, `hx-target` the card, `hx-swap="outerHTML"`
- [x] 1.5 Add `signalStatusChip` templ — shows acknowledged/dismissed/resolved state
- [x] 1.6 Update `CoherenceSignalCard` to include action buttons when `Status == "active"` and status chip otherwise
- [x] 1.7 Add a dismiss modal/inline form for the `reason` field (simple inline text input, no JS required)
- [x] 1.8 Register the three new routes in `routes.go`
- [x] 1.9 Run `templ generate` and verify build compiles

## 2. Version Browser

- [x] 2.1 Add `aim-versions` node to `internal/navigation/graph.go` under the AIM section (`URLPattern: "/aim/versions"`)
- [x] 2.2 Create `internal/ui/versions_view.templ` with `VersionsViewData`, `VersionRow`, `VersionsContent` components
- [x] 2.3 Create `internal/handler/handler_versions.go` — `handleVersions` (list) + `handleVersionDetail` (single version + diff from parent)
- [x] 2.4 Register `/strategies/:id/aim/versions` and `/strategies/:id/aim/versions/:versionID` routes
- [x] 2.5 Add HTMX restore button on detail view — POST to `/aim/versions/:versionID/restore` → service call → redirect to instance root
- [x] 2.6 Register restore route
- [x] 2.7 Run `templ generate` and verify build compiles

## 3. GitHub Sync Trigger in Settings

- [x] 3.1 Add `GithubSyncStatus` struct to `settings.templ` (last sync, PR URL, configured bool, github_repo value)
- [x] 3.2 Add `githubSyncCard` templ component — shows status + "Sync to GitHub" button (HTMX POST, replaces card)
- [x] 3.3 Add POST `/settings/sync` endpoint in `handler_settings.go` — calls `s.syncSvc.SyncToGithub`, returns updated card fragment
- [x] 3.4 Wire `SyncService` into the `Server` struct
- [x] 3.5 Load `GithubSyncStatus` in `handleSettings` from `GetSyncHistory` (last entry)
- [x] 3.6 Register the POST route
- [x] 3.7 Run `templ generate` and verify build compiles

## 4. Final Validation

- [x] 4.1 Run `go build -o /tmp/strategy-server-new .` from `apps/strategy-server/` — zero errors
- [x] 4.2 Run `go test ./domain/... ./internal/... ./pkg/...` — all pass (no regressions)

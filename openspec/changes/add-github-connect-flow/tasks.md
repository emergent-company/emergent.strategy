## 1. Config

- [ ] 1.1 Add `GithubAppSlug string` to `config/config.go` with env var `GITHUB_APP_SLUG`
  - Used to build: `https://github.com/apps/{slug}/installations/new`
  - Empty = install link not shown (graceful degradation)

## 2. GitHub Client — New Read Methods

- [ ] 2.1 Add `Installation` struct to `internal/github/client.go`
  - Fields: `ID int64`, `OwnerLogin string`, `OwnerType string` ("Organization" or "User"), `HTMLURL string`
- [ ] 2.2 Add `ListInstallations(ctx, token string) ([]Installation, error)` to `internal/github/client.go`
  - Calls `GET /app/installations` with JWT auth (App-level, not installation-level)
  - Handles pagination (`Link` header or per_page=100)
  - Note: uses App JWT directly, not an installation token
- [ ] 2.3 Add `InstallationRepo` struct: `Name, FullName, HTMLURL, DefaultBranch string, Private bool`
- [ ] 2.4 Add `ListInstallationRepos(ctx, token string) ([]InstallationRepo, error)`
  - Calls `GET /installation/repositories` with installation token
  - Handles pagination (per_page=100)
- [ ] 2.5 Add `DetectedInstance` struct: `BasePath string, HasMetaFile bool`
- [ ] 2.6 Add `DetectEPFInRepo(ctx, token, owner, repo, defaultBranch string) ([]DetectedInstance, error)`
  - Pass 1: `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=0`
    Check root entries for: `READY/` (type=tree), `_meta.yaml`, `_epf.yaml`, `north_star.yaml`, `00_north_star.yaml`
    If found → return `[{BasePath: "", HasMetaFile: has meta file}]`
  - Pass 2 (only if pass 1 empty): `GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1`
    Find all tree entries with path ending in `READY` (type=tree)
    For each → determine base_path (parent directory)
    Check if sibling `_meta.yaml` or `_epf.yaml` exists at same level
    Return one `DetectedInstance` per unique base_path found
    If truncated=true in response: log warning, proceed with partial results
- [ ] 2.7 Add unit tests for `ListInstallations`, `ListInstallationRepos`, `DetectEPFInRepo`
  - Use httptest mock pattern (same as existing client_test.go)
  - Test EPF at root, EPF in subdirectory, multiple instances, not found, truncated tree

## 3. RepoReader Interface Extensions

- [ ] 3.1 Add `ListInstallations(ctx context.Context) ([]github.Installation, error)` to `RepoReader` interface in `domain/sync/import.go`
  - Note: this uses the App-level JWT, not an installation token — the method signature doesn't take a token
  - Add a separate `GetAppJWT() (string, error)` method to the interface, OR restructure so the adapter handles JWT internally
  - **Decision:** Adapter holds a reference to `*github.Client` and generates JWT internally. Interface method: `ListInstallations(ctx context.Context) ([]InstallationInfo, error)`
- [ ] 3.2 Add `ListInstallationRepos(ctx context.Context, token string) ([]RepoInfo, error)` to `RepoReader`
- [ ] 3.3 Add `DetectEPFInRepo(ctx context.Context, token, owner, repo, branch string) ([]DetectedEPFInstance, error)` to `RepoReader`
- [ ] 3.4 Add `InstallationInfo`, `RepoInfo`, `DetectedEPFInstance` types to `domain/sync/` (mirror of github package types, decoupled)
- [ ] 3.5 Implement all three methods on `RepoReaderAdapter` in `internal/github/adapter.go`

## 4. Sync Domain — Scan Logic

- [ ] 4.1 Add `ListInstallations(ctx context.Context) ([]InstallationInfo, error)` to `domain/sync/service.go`
  - Delegates to `s.reader.ListInstallations(ctx)`
  - Returns error if reader is nil (GitHub App not configured)
- [ ] 4.2 Add `ScanInstallationRepos(ctx context.Context, githubOwner string) ([]RepoScanResult, error)` to `domain/sync/service.go`
  - Gets installation token via `s.reader.GetInstallationToken(ctx, githubOwner)`
  - Calls `s.reader.ListInstallationRepos(ctx, token)`
  - Concurrently calls `s.reader.DetectEPFInRepo` for each repo (max 5 goroutines, `errgroup` or `sync.WaitGroup`)
  - Assembles `[]RepoScanResult{Name, FullName, HTMLURL, DefaultBranch, Private, HasEPF, DetectedInstances}`
  - Checks/populates in-memory scan cache (keyed by `githubOwner`, TTL 5 minutes)
- [ ] 4.3 Add `RepoScanResult` type to `domain/sync/service.go`
- [ ] 4.4 Add scan cache: `struct { mu sync.Mutex; entries map[string]scanCacheEntry }` where entry has result + expiry
- [ ] 4.5 Integration test: mock reader returning 3 repos, verify concurrent scan, EPF detection, caching

## 5. MCP Tools

- [ ] 5.1 Add `list_github_installations` tool to `register_sync_tools.go`
  - No required params
  - Returns: `[{owner_login, owner_type, html_url}]` + `app_configured: bool`
  - Returns clear message if GitHub App not configured
- [ ] 5.2 Add `scan_github_repos` tool to `register_sync_tools.go`
  - Accepts `github_owner` (required string, e.g. "emergent-company" or "nikolaifasting")
  - Returns `[]RepoScanResult` with EPF detection per repo
  - Returns structured error if App not installed on that owner (includes install URL)
- [ ] 5.3 Add both tools to `toolCategories` in `tool_filter.go` (category: `admin`)
- [ ] 5.4 Update knowledge base topic in `internal/agent/knowledge.go`

## 6. Connect Flow Web UI

- [ ] 6.1 Add `ConnectGitHub` screen to `navigation_graph.yaml`
  - Route: `GET /github/connect`
  - Not in sidebar; accessible from settings and new-instance flow
- [ ] 6.2 Register route in `handler.go`: `GET /github/connect`, `POST /github/connect/scan`
- [ ] 6.3 Add `GithubConnectData` struct to `internal/ui/`:
  ```go
  type GithubConnectData struct {
      Installations   []InstallationInfo
      SelectedOwner   string
      Repos           []RepoScanResult // populated after scan
      AppConfigured   bool
      AppInstallURL   string // from config.GithubAppSlug
      Workspaces      []WorkspaceSummary // for assignment step
  }
  ```
- [ ] 6.4 Add `githubConnectPage` templ component in `internal/ui/github_connect.templ`:
  - **State: app not configured** — "GitHub App not configured. Contact your server admin."
  - **State: pick owner** — dropdown of installations (owner_login, owner_type badge)
    with "Scan repos" button (HTMX POST to `/github/connect/scan`)
  - **State: scanning** — HTMX spinner swap while scan runs
  - **State: repo list** — table columns: Repo name (linked to GitHub), Visibility (Public/Private badge), EPF status badge, "Connect" action
    - EPF badge: green "EPF found" with instance count, grey "No EPF", amber "Multiple instances"
    - Filter toggle: "Show all" / "EPF only"
  - **State: repo detail** — expanded row or modal:
    - Shows detected instances with base paths (editable)
    - Workspace picker: "Import into:" dropdown of user's workspaces (grouped by org)
    - Two buttons: "Import artifacts" (POST → import_from_github) and "Link only" (POST → update_instance only)
- [ ] 6.5 Add `handleGithubConnect` GET handler: renders the page with installations list
- [ ] 6.6 Add `handleGithubConnectScan` POST handler (HTMX target):
  - Reads `github_owner` from form
  - Calls `syncSvc.ScanInstallationRepos(ctx, githubOwner)`
  - Returns repo table fragment (HTMX swap)
  - On App-not-installed error: returns install prompt fragment
- [ ] 6.7 Add "Connect GitHub" button to settings page github sync card
  - Shown for instances with no `github_repo` set
  - Also shown as a top-level action in the github sync card header
  - Links to `/github/connect`

## 7. Tests

- [ ] 7.1 Unit tests for `ListInstallations` mock (pagination, empty, JWT auth)
- [ ] 7.2 Unit tests for `DetectEPFInRepo` mock:
  - EPF at root (READY/ found in root tree)
  - EPF in subdirectory (found in recursive tree)
  - Multiple instances in one repo
  - No EPF found
  - Truncated tree (recursive response has `truncated: true`)
- [ ] 7.3 Integration test for `ScanInstallationRepos` (mock reader, concurrency, cache hit)
- [ ] 7.4 Run full test suite: `go test ./...`

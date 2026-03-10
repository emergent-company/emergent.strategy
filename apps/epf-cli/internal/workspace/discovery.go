// Package workspace provides EPF workspace discovery.
//
// It scans a GitHub user's accessible repositories for EPF instances
// (identified by _epf.yaml anchor files) and returns a list of workspaces
// the user can connect to. Results are cached per-user with a configurable TTL.
//
// For GitHub App sessions, discovery uses GET /user/installations to list
// installations, then GET /installation/repositories for each installation
// to find repos (using installation tokens). This avoids requiring broad
// repo scope — the App's manifest permissions (contents:read) are sufficient.
//
// For PAT/OAuth sessions, discovery falls back to GET /user/repos.
//
// Usage:
//
//	discoverer := workspace.NewDiscoverer()
//	workspaces, err := discoverer.Discover(userID, oauthToken)
//	// or with GitHub App:
//	workspaces, err := discoverer.DiscoverWithOptions(userID, userToken, DiscoverOptions{
//	    AuthMethod: "github_app",
//	    TokenManager: installationTokenMgr,
//	    AppID: 12345,
//	})
package workspace

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Workspace represents a discovered EPF instance in a GitHub repo.
type Workspace struct {
	// Owner is the GitHub org or user that owns the repo.
	Owner string `json:"owner"`

	// Repo is the repository name.
	Repo string `json:"repo"`

	// InstancePath is the path to pass as instance_path in MCP tools.
	// Format: "owner/repo" or "owner/repo/subpath" if the instance is nested.
	InstancePath string `json:"instance_path"`

	// ProductName is the product name from _epf.yaml (if parseable).
	ProductName string `json:"product_name,omitempty"`

	// Description from _epf.yaml (if parseable).
	Description string `json:"description,omitempty"`

	// Private indicates whether the repo is private.
	Private bool `json:"private"`

	// DefaultBranch is the repo's default branch.
	DefaultBranch string `json:"default_branch,omitempty"`

	// InstallationID is the GitHub App installation ID that grants access
	// to this repo. Zero means the workspace was discovered via OAuth/PAT
	// (GET /user/repos) rather than via a GitHub App installation.
	InstallationID int64 `json:"installation_id,omitempty"`
}

// Discoverer scans GitHub repos for EPF instances.
// It caches results per-user with a configurable TTL.
//
// It is safe for concurrent use.
type Discoverer struct {
	client   *http.Client
	ttl      time.Duration
	maxRepos int

	mu    sync.RWMutex
	cache map[int64]*discoveryCacheEntry

	nowFunc func() time.Time
}

// discoveryCacheEntry holds cached discovery results for a user.
type discoveryCacheEntry struct {
	Workspaces []Workspace
	CachedAt   time.Time
}

// DefaultDiscoveryTTL is the default cache TTL for discovery results.
const DefaultDiscoveryTTL = 10 * time.Minute

// DefaultMaxRepos is the maximum number of repos to scan per user.
const DefaultMaxRepos = 100

// DiscovererOption configures a Discoverer.
type DiscovererOption func(*Discoverer)

// WithDiscoveryTTL sets the cache TTL for discovery results.
func WithDiscoveryTTL(ttl time.Duration) DiscovererOption {
	return func(d *Discoverer) {
		d.ttl = ttl
	}
}

// WithDiscoveryMaxRepos sets the max number of repos to scan.
func WithDiscoveryMaxRepos(n int) DiscovererOption {
	return func(d *Discoverer) {
		d.maxRepos = n
	}
}

// WithDiscoveryHTTPClient sets a custom HTTP client (for testing).
func WithDiscoveryHTTPClient(c *http.Client) DiscovererOption {
	return func(d *Discoverer) {
		d.client = c
	}
}

// WithDiscoveryClock sets the time function (for testing).
func WithDiscoveryClock(now func() time.Time) DiscovererOption {
	return func(d *Discoverer) {
		d.nowFunc = now
	}
}

// NewDiscoverer creates a new workspace discoverer.
func NewDiscoverer(opts ...DiscovererOption) *Discoverer {
	d := &Discoverer{
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
		ttl:      DefaultDiscoveryTTL,
		maxRepos: DefaultMaxRepos,
		cache:    make(map[int64]*discoveryCacheEntry),
		nowFunc:  time.Now,
	}
	for _, opt := range opts {
		opt(d)
	}
	return d
}

// InstallationTokenFunc is a function that returns an installation access
// token for listing repos under a given installation. This is provided
// by auth.InstallationTokenManager.Token.
type InstallationTokenFunc func(installationID int64) (string, error)

// DiscoverOptions configures how workspace discovery works.
// Used with DiscoverWithOptions to enable GitHub App installation-based
// discovery instead of the default GET /user/repos approach.
type DiscoverOptions struct {
	// AuthMethod is the session's auth method ("github_app", "oauth", "pat").
	// When set to "github_app", discovery uses GET /user/installations
	// instead of GET /user/repos. Default: uses GET /user/repos.
	AuthMethod string

	// InstallationTokenFunc returns an installation access token for
	// a given installation ID. Required when AuthMethod is "github_app".
	// Typically provided by InstallationTokenManager.Token.
	InstallationTokenFunc InstallationTokenFunc

	// AppID is the GitHub App ID. Used to filter installations to only
	// those belonging to our App. Required when AuthMethod is "github_app".
	AppID int64
}

// Discover returns EPF workspaces accessible to the user.
// Results are cached per-user with the configured TTL.
//
// This is the legacy method that uses GET /user/repos for discovery.
// For GitHub App sessions, use DiscoverWithOptions instead.
func (d *Discoverer) Discover(userID int64, oauthToken string) ([]Workspace, error) {
	return d.DiscoverWithOptions(userID, oauthToken, DiscoverOptions{})
}

// DiscoverWithOptions returns EPF workspaces accessible to the user,
// with auth-method-aware discovery.
//
// For GitHub App sessions (AuthMethod="github_app"):
//   - Lists the user's App installations via GET /user/installations
//   - For each installation, lists repos via GET /installation/repositories
//   - Each workspace includes the InstallationID for later token resolution
//
// For PAT/OAuth sessions (default):
//   - Uses GET /user/repos to list accessible repos
//   - Checks each for _epf.yaml anchor files
func (d *Discoverer) DiscoverWithOptions(userID int64, userToken string, opts DiscoverOptions) ([]Workspace, error) {
	// Check cache.
	d.mu.RLock()
	entry, ok := d.cache[userID]
	d.mu.RUnlock()

	if ok && d.nowFunc().Before(entry.CachedAt.Add(d.ttl)) {
		return entry.Workspaces, nil
	}

	// Cache miss or expired — discover from GitHub.
	var workspaces []Workspace
	var err error

	if opts.AuthMethod == "github_app" && opts.InstallationTokenFunc != nil {
		workspaces, err = d.discoverFromInstallations(userToken, opts)
	} else {
		workspaces, err = d.discoverFromGitHub(userToken)
	}
	if err != nil {
		return nil, err
	}

	// Update cache.
	d.mu.Lock()
	d.cache[userID] = &discoveryCacheEntry{
		Workspaces: workspaces,
		CachedAt:   d.nowFunc(),
	}
	d.mu.Unlock()

	return workspaces, nil
}

// InvalidateUser clears cached discovery results for a user.
func (d *Discoverer) InvalidateUser(userID int64) {
	d.mu.Lock()
	delete(d.cache, userID)
	d.mu.Unlock()
}

// CacheSize returns the number of cached user entries.
func (d *Discoverer) CacheSize() int {
	d.mu.RLock()
	defer d.mu.RUnlock()
	return len(d.cache)
}

// discoverFromGitHub lists user repos and checks each for _epf.yaml.
func (d *Discoverer) discoverFromGitHub(oauthToken string) ([]Workspace, error) {
	repos, err := d.listUserRepos(oauthToken)
	if err != nil {
		return nil, fmt.Errorf("workspace: list repos: %w", err)
	}

	var workspaces []Workspace
	for _, repo := range repos {
		instances := d.findEPFInstances(repo, oauthToken)
		workspaces = append(workspaces, instances...)
	}

	return workspaces, nil
}

// discoverFromInstallations lists user's App installations and their repos.
//
// Flow:
//  1. GET /user/installations (user token) — list installations of our App
//  2. For each installation, GET /installation/repositories (installation token)
//     — list repos the App can access under that installation
//  3. For each repo, check for _epf.yaml anchor files (using installation token)
//
// This approach avoids requiring broad repo scope. The App's manifest
// permissions (contents:read, metadata:read) are sufficient.
func (d *Discoverer) discoverFromInstallations(userToken string, opts DiscoverOptions) ([]Workspace, error) {
	// List installations of our App that the user can see.
	installations, err := d.listUserInstallations(userToken, opts.AppID)
	if err != nil {
		return nil, fmt.Errorf("workspace: list installations: %w", err)
	}

	if len(installations) == 0 {
		// No installations — fall back to GET /user/repos for broader discovery.
		// This handles the case where the user authenticated via GitHub App OAuth
		// but hasn't installed the App on any repos yet.
		return d.discoverFromGitHub(userToken)
	}

	var allWorkspaces []Workspace

	for _, inst := range installations {
		// Get an installation token to list repos under this installation.
		installToken, err := opts.InstallationTokenFunc(inst.ID)
		if err != nil {
			// Skip this installation if we can't get a token (e.g., revoked).
			continue
		}

		repos, err := d.listInstallationRepos(installToken)
		if err != nil {
			// Skip this installation on error.
			continue
		}

		for _, repo := range repos {
			instances := d.findEPFInstances(repo, installToken)
			// Tag each workspace with the installation ID.
			for i := range instances {
				instances[i].InstallationID = inst.ID
			}
			allWorkspaces = append(allWorkspaces, instances...)
		}
	}

	return allWorkspaces, nil
}

// ghInstallation represents a GitHub App installation from GET /user/installations.
type ghInstallation struct {
	ID      int64 `json:"id"`
	AppID   int64 `json:"app_id"`
	Account struct {
		Login string `json:"login"`
		Type  string `json:"type"` // "Organization" or "User"
	} `json:"account"`
	TargetType string `json:"target_type"` // "Organization" or "User"
}

// listUserInstallations calls GET /user/installations to list the user's
// accessible App installations, filtered to our App ID.
//
// This endpoint works with GitHub App user access tokens (ghu_) without
// any special scopes — org membership is implicit in the response.
func (d *Discoverer) listUserInstallations(userToken string, appID int64) ([]ghInstallation, error) {
	var allInstallations []ghInstallation
	page := 1
	perPage := 100

	for {
		url := fmt.Sprintf("https://api.github.com/user/installations?per_page=%d&page=%d", perPage, page)

		body, status, err := d.doRequest(url, userToken)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, fmt.Errorf("GET /user/installations returned %d: %s", status, truncate(string(body), 200))
		}

		// The response wraps installations in {"total_count": N, "installations": [...]}.
		var resp struct {
			TotalCount    int              `json:"total_count"`
			Installations []ghInstallation `json:"installations"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("parse installations: %w", err)
		}

		// Filter to only installations of our App.
		for _, inst := range resp.Installations {
			if appID == 0 || inst.AppID == appID {
				allInstallations = append(allInstallations, inst)
			}
		}

		if len(resp.Installations) < perPage {
			break // Last page.
		}
		page++
	}

	return allInstallations, nil
}

// listInstallationRepos calls GET /installation/repositories using an
// installation access token to list repos accessible under that installation.
func (d *Discoverer) listInstallationRepos(installToken string) ([]ghRepoListEntry, error) {
	var allRepos []ghRepoListEntry
	page := 1
	perPage := 100

	for len(allRepos) < d.maxRepos {
		url := fmt.Sprintf("https://api.github.com/installation/repositories?per_page=%d&page=%d", perPage, page)

		body, status, err := d.doRequest(url, installToken)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, fmt.Errorf("GET /installation/repositories returned %d: %s", status, truncate(string(body), 200))
		}

		// The response wraps repos in {"total_count": N, "repositories": [...]}.
		var resp struct {
			TotalCount   int               `json:"total_count"`
			Repositories []ghRepoListEntry `json:"repositories"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("parse installation repos: %w", err)
		}

		allRepos = append(allRepos, resp.Repositories...)

		if len(resp.Repositories) < perPage {
			break // Last page.
		}
		page++
	}

	// Cap at maxRepos.
	if len(allRepos) > d.maxRepos {
		allRepos = allRepos[:d.maxRepos]
	}

	return allRepos, nil
}

// ghRepoListEntry is a minimal GitHub repo from the list repos API.
type ghRepoListEntry struct {
	FullName      string `json:"full_name"`
	Name          string `json:"name"`
	Private       bool   `json:"private"`
	DefaultBranch string `json:"default_branch"`
	Owner         struct {
		Login string `json:"login"`
	} `json:"owner"`
	Permissions struct {
		Pull bool `json:"pull"`
	} `json:"permissions"`
}

// listUserRepos lists repos the user has access to, up to maxRepos.
func (d *Discoverer) listUserRepos(oauthToken string) ([]ghRepoListEntry, error) {
	var allRepos []ghRepoListEntry
	page := 1
	perPage := 100 // GitHub max per page.

	for len(allRepos) < d.maxRepos {
		url := fmt.Sprintf("https://api.github.com/user/repos?per_page=%d&page=%d&sort=pushed&direction=desc", perPage, page)

		body, status, err := d.doRequest(url, oauthToken)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, fmt.Errorf("workspace: GitHub API returned %d: %s", status, truncate(string(body), 200))
		}

		var repos []ghRepoListEntry
		if err := json.Unmarshal(body, &repos); err != nil {
			return nil, fmt.Errorf("workspace: parse repo list: %w", err)
		}

		if len(repos) == 0 {
			break // No more pages.
		}

		allRepos = append(allRepos, repos...)
		page++

		if len(repos) < perPage {
			break // Last page.
		}
	}

	// Cap at maxRepos.
	if len(allRepos) > d.maxRepos {
		allRepos = allRepos[:d.maxRepos]
	}

	return allRepos, nil
}

// findEPFInstances checks a repo for EPF instances by looking for _epf.yaml.
func (d *Discoverer) findEPFInstances(repo ghRepoListEntry, oauthToken string) []Workspace {
	// Check for _epf.yaml at repo root via the Contents API.
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/_epf.yaml",
		repo.Owner.Login, repo.Name)

	_, status, err := d.doRequest(url, oauthToken)
	if err == nil && status == http.StatusOK {
		// Found _epf.yaml at repo root — this is an EPF instance.
		ws := Workspace{
			Owner:         repo.Owner.Login,
			Repo:          repo.Name,
			InstancePath:  fmt.Sprintf("%s/%s", repo.Owner.Login, repo.Name),
			Private:       repo.Private,
			DefaultBranch: repo.DefaultBranch,
		}

		// Try to read product name from _epf.yaml content.
		d.enrichWorkspace(&ws, repo, oauthToken)

		return []Workspace{ws}
	}

	// Check for nested instances under docs/EPF/_instances/
	return d.findNestedInstances(repo, oauthToken)
}

// findNestedInstances looks for EPF instances under docs/EPF/_instances/*/
func (d *Discoverer) findNestedInstances(repo ghRepoListEntry, oauthToken string) []Workspace {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/docs/EPF/_instances",
		repo.Owner.Login, repo.Name)

	body, status, _ := d.doRequest(url, oauthToken)
	if status != http.StatusOK {
		return nil
	}

	var entries []struct {
		Name string `json:"name"`
		Type string `json:"type"`
	}
	if err := json.Unmarshal(body, &entries); err != nil {
		return nil
	}

	var workspaces []Workspace
	for _, entry := range entries {
		if entry.Type != "dir" {
			continue
		}

		// Check if this subdirectory has _epf.yaml.
		anchorURL := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/docs/EPF/_instances/%s/_epf.yaml",
			repo.Owner.Login, repo.Name, entry.Name)

		_, anchorStatus, _ := d.doRequest(anchorURL, oauthToken)
		if anchorStatus == http.StatusOK {
			subpath := fmt.Sprintf("docs/EPF/_instances/%s", entry.Name)
			ws := Workspace{
				Owner:         repo.Owner.Login,
				Repo:          repo.Name,
				InstancePath:  fmt.Sprintf("%s/%s/%s", repo.Owner.Login, repo.Name, subpath),
				ProductName:   entry.Name, // Use directory name as fallback.
				Private:       repo.Private,
				DefaultBranch: repo.DefaultBranch,
			}
			workspaces = append(workspaces, ws)
		}
	}

	return workspaces
}

// enrichWorkspace tries to read product_name and description from the _epf.yaml file.
func (d *Discoverer) enrichWorkspace(ws *Workspace, repo ghRepoListEntry, oauthToken string) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/_epf.yaml",
		repo.Owner.Login, repo.Name)

	body, status, err := d.doRequest(url, oauthToken)
	if err != nil || status != http.StatusOK {
		return
	}

	// Parse the GitHub Contents API response to get the file content.
	var ghFile struct {
		Content  string `json:"content"`
		Encoding string `json:"encoding"`
	}
	if err := json.Unmarshal(body, &ghFile); err != nil {
		return
	}
	if ghFile.Encoding != "base64" {
		return
	}

	// Decode base64 content (GitHub base64-encodes file content with newlines).
	decoded, err := base64.StdEncoding.DecodeString(
		strings.ReplaceAll(strings.ReplaceAll(ghFile.Content, "\n", ""), "\r", ""),
	)
	if err != nil {
		return
	}

	// We do a simple string search rather than full YAML parse to avoid
	// importing the yaml package. This is just for optional enrichment.
	content := string(decoded)
	ws.ProductName = extractYAMLField(content, "product_name")
	if ws.Description == "" {
		ws.Description = extractYAMLField(content, "description")
	}
}

// doRequest performs an authenticated GET request to the GitHub API.
func (d *Discoverer) doRequest(url, oauthToken string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("workspace: create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+oauthToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := d.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("workspace: request %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("workspace: read body: %w", err)
	}

	return body, resp.StatusCode, nil
}

// extractYAMLField does a simple line-by-line scan for "key: value" in YAML text.
// This is intentionally simple — no full YAML parsing needed for optional enrichment.
func extractYAMLField(content, fieldName string) string {
	prefix := fieldName + ":"
	for _, line := range strings.Split(content, "\n") {
		trimmed := strings.TrimLeft(line, " \t")
		if !strings.HasPrefix(trimmed, prefix) {
			continue
		}
		value := strings.TrimSpace(trimmed[len(prefix):])
		// Strip surrounding quotes.
		if len(value) >= 2 && (value[0] == '\'' || value[0] == '"') {
			value = value[1 : len(value)-1]
		}
		return value
	}
	return ""
}

// truncate truncates a string to maxLen with "..." suffix.
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen-3] + "..."
}

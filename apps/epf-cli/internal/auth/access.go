// Repo access control for multi-tenant authentication.
//
// AccessChecker verifies whether a user has read access to a GitHub repository
// by making a lightweight GET /repos/{owner}/{repo} API call with the user's
// OAuth access token. Results are cached per-user per-repo with a configurable
// TTL (default: 5 minutes) to avoid redundant GitHub API calls.
//
// Usage flow:
//  1. MCP tool handler resolves instance_path to owner/repo format.
//  2. Handler extracts the authenticated SessionUser from request context.
//  3. Handler retrieves the user's OAuth token via SessionManager.GetAccessToken.
//  4. Handler calls AccessChecker.CanAccess(userID, owner, repo, oauthToken).
//  5. If access denied, return an error. If granted, proceed with tool execution.
package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// AccessChecker verifies user access to GitHub repositories.
//
// It caches access check results per user per repo with a TTL. This avoids
// hitting the GitHub API on every MCP tool call for the same repo.
//
// It is safe for concurrent use.
type AccessChecker struct {
	ttl    time.Duration
	client *http.Client

	mu    sync.RWMutex
	cache map[accessCacheKey]*accessCacheEntry

	// nowFunc is injectable for testing.
	nowFunc func() time.Time
}

// accessCacheKey identifies a unique user+repo combination.
type accessCacheKey struct {
	UserID int64
	Owner  string
	Repo   string
}

// accessCacheEntry stores a cached access check result.
type accessCacheEntry struct {
	Allowed   bool
	CheckedAt time.Time
}

// DefaultAccessCheckTTL is the default cache TTL for access check results.
const DefaultAccessCheckTTL = 5 * time.Minute

// AccessCheckerOption configures an AccessChecker.
type AccessCheckerOption func(*AccessChecker)

// WithAccessCheckTTL sets the cache TTL for access check results.
func WithAccessCheckTTL(ttl time.Duration) AccessCheckerOption {
	return func(ac *AccessChecker) {
		ac.ttl = ttl
	}
}

// WithAccessCheckClock sets the time function for testing.
func WithAccessCheckClock(now func() time.Time) AccessCheckerOption {
	return func(ac *AccessChecker) {
		ac.nowFunc = now
	}
}

// WithAccessCheckHTTPClient sets a custom HTTP client (for testing).
func WithAccessCheckHTTPClient(c *http.Client) AccessCheckerOption {
	return func(ac *AccessChecker) {
		ac.client = c
	}
}

// NewAccessChecker creates a new repo access checker.
func NewAccessChecker(opts ...AccessCheckerOption) *AccessChecker {
	ac := &AccessChecker{
		ttl: DefaultAccessCheckTTL,
		client: &http.Client{
			Timeout: 10 * time.Second,
		},
		cache:   make(map[accessCacheKey]*accessCacheEntry),
		nowFunc: time.Now,
	}
	for _, opt := range opts {
		opt(ac)
	}
	return ac
}

// CanAccess checks whether the user has read access to the GitHub repository.
//
// It first checks the cache. If a valid (non-expired) entry exists, it returns
// the cached result. Otherwise, it makes a GitHub API call:
//
//	GET https://api.github.com/repos/{owner}/{repo}
//	Authorization: Bearer {oauthToken}
//
// A 200 response means the user has access. A 404 or 403 means they don't.
// Any other status code is treated as an error (not cached).
func (ac *AccessChecker) CanAccess(userID int64, owner, repo, oauthToken string) (bool, error) {
	key := accessCacheKey{UserID: userID, Owner: owner, Repo: repo}

	// Check cache first.
	ac.mu.RLock()
	entry, ok := ac.cache[key]
	ac.mu.RUnlock()

	if ok && ac.nowFunc().Before(entry.CheckedAt.Add(ac.ttl)) {
		return entry.Allowed, nil
	}

	// Cache miss or expired — call GitHub API.
	allowed, err := ac.checkGitHubAccess(owner, repo, oauthToken)
	if err != nil {
		return false, err
	}

	// Cache the result.
	ac.mu.Lock()
	ac.cache[key] = &accessCacheEntry{
		Allowed:   allowed,
		CheckedAt: ac.nowFunc(),
	}
	ac.mu.Unlock()

	return allowed, nil
}

// checkGitHubAccess makes a GET /repos/{owner}/{repo} API call to verify access.
//
// Returns:
//   - (true, nil) if the user can access the repo (200 OK)
//   - (false, nil) if the user cannot access the repo (403 or 404)
//   - (false, error) for unexpected API errors (rate limit, server error, etc.)
func (ac *AccessChecker) checkGitHubAccess(owner, repo, oauthToken string) (bool, error) {
	url := fmt.Sprintf("https://api.github.com/repos/%s/%s", owner, repo)

	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return false, fmt.Errorf("access: create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+oauthToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := ac.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("access: GitHub API request: %w", err)
	}
	defer resp.Body.Close()

	// Drain the body to allow connection reuse.
	io.Copy(io.Discard, resp.Body)

	switch resp.StatusCode {
	case http.StatusOK:
		return true, nil
	case http.StatusNotFound, http.StatusForbidden:
		return false, nil
	case http.StatusUnauthorized:
		return false, fmt.Errorf("access: OAuth token is invalid or expired")
	case http.StatusTooManyRequests:
		return false, fmt.Errorf("access: GitHub API rate limit exceeded")
	default:
		return false, fmt.Errorf("access: unexpected GitHub API status %d", resp.StatusCode)
	}
}

// InvalidateUser removes all cached access entries for a specific user.
// Call this when a user's session is revoked.
func (ac *AccessChecker) InvalidateUser(userID int64) {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	for key := range ac.cache {
		if key.UserID == userID {
			delete(ac.cache, key)
		}
	}
}

// InvalidateRepo removes all cached access entries for a specific repo.
// Call this when repo permissions are known to have changed.
func (ac *AccessChecker) InvalidateRepo(owner, repo string) {
	ac.mu.Lock()
	defer ac.mu.Unlock()

	for key := range ac.cache {
		if key.Owner == owner && key.Repo == repo {
			delete(ac.cache, key)
		}
	}
}

// CacheSize returns the number of cached entries (for monitoring).
func (ac *AccessChecker) CacheSize() int {
	ac.mu.RLock()
	defer ac.mu.RUnlock()
	return len(ac.cache)
}

// parseInstancePath parses an instance_path string into owner, repo, and subpath components.
//
// Resolution rules (from design.md):
//   - "owner/repo" → (owner, repo, "")
//   - "owner/repo/path/to/instance" → (owner, repo, "path/to/instance")
//   - "/absolute/path" → ("", "", "") with isLocal=true
//   - "relative/path" with >2 segments or starting with "." → ("", "", "") with isLocal=true
//
// Returns isRemote=true if the path was resolved as a GitHub repo reference.
func ParseInstancePath(instancePath string) (owner, repo, subpath string, isRemote bool) {
	if instancePath == "" {
		return "", "", "", false
	}

	// Absolute paths are always local.
	if instancePath[0] == '/' || instancePath[0] == '\\' {
		return "", "", "", false
	}

	// Paths starting with "." are local (relative).
	if instancePath[0] == '.' {
		return "", "", "", false
	}

	// Paths containing backslashes are Windows filesystem paths.
	for i := 0; i < len(instancePath); i++ {
		if instancePath[i] == '\\' {
			return "", "", "", false
		}
	}

	// Paths with "github://" prefix are explicitly remote.
	if len(instancePath) > 9 && instancePath[:9] == "github://" {
		remainder := instancePath[9:]
		return splitOwnerRepoPath(remainder)
	}

	// Split by "/" — if exactly 1 slash and both parts are non-empty,
	// treat as owner/repo. If 2+ slashes, treat as owner/repo/subpath.
	return splitOwnerRepoPath(instancePath)
}

// splitOwnerRepoPath splits "owner/repo" or "owner/repo/sub/path" into components.
func splitOwnerRepoPath(s string) (owner, repo, subpath string, isRemote bool) {
	// Find first slash.
	firstSlash := -1
	for i := 0; i < len(s); i++ {
		if s[i] == '/' {
			firstSlash = i
			break
		}
	}
	if firstSlash <= 0 || firstSlash == len(s)-1 {
		// No slash, or slash at start/end — not a valid owner/repo.
		return "", "", "", false
	}

	owner = s[:firstSlash]
	rest := s[firstSlash+1:]

	// Find second slash.
	secondSlash := -1
	for i := 0; i < len(rest); i++ {
		if rest[i] == '/' {
			secondSlash = i
			break
		}
	}

	if secondSlash < 0 {
		// Just owner/repo.
		repo = rest
		return owner, repo, "", true
	}

	// owner/repo/subpath
	repo = rest[:secondSlash]
	subpath = rest[secondSlash+1:]
	if repo == "" {
		return "", "", "", false
	}
	return owner, repo, subpath, true
}

// RepoAccessDeniedError is returned when a user does not have access to a repository.
type RepoAccessDeniedError struct {
	Owner    string
	Repo     string
	Username string
}

func (e *RepoAccessDeniedError) Error() string {
	return fmt.Sprintf("access denied: user %q does not have access to %s/%s. "+
		"Verify the repository exists, you have read access, and the EPF GitHub App (if used) is installed on the %s organization",
		e.Username, e.Owner, e.Repo, e.Owner)
}

// tokenForAccess is a helper type for passing token retrieval context.
type tokenForAccess struct {
	accessToken string
}

// accessCheckResult is used internally by the rate-limit-aware checker.
type accessCheckResult struct {
	allowed bool
	err     error
}

// --- GitHub API response (minimal) ---

// ghRepoResponse is a minimal representation of the GitHub repo API response.
// We only need to know if the request succeeded (200 = access, 404 = no access).
type ghRepoResponse struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
	Private  bool   `json:"private"`
}

// parseGitHubRepoResponse parses the GitHub repo API response.
// This is only used when we need additional repo metadata in the future.
func parseGitHubRepoResponse(body []byte) (*ghRepoResponse, error) {
	var resp ghRepoResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, fmt.Errorf("access: parse repo response: %w", err)
	}
	return &resp, nil
}

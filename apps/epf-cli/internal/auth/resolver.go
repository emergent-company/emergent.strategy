package auth

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"sync"
	"time"
)

// TokenResolver resolves the appropriate GitHub token for accessing a
// specific repository. It combines the SessionManager (user identity)
// with the InstallationTokenManager (per-org installation tokens) to
// select the right token based on the auth method and repo ownership.
//
// For GitHub App sessions: resolves the installation covering the repo
// and returns an installation token.
// For PAT/OAuth sessions: returns the user's token directly.
type TokenResolver struct {
	session       *SessionManager
	installations *InstallationTokenManager // nil when GitHub App is not configured

	appID      int64  // GitHub App ID for filtering installations
	baseURL    string // GitHub API base URL (default: "https://api.github.com")
	httpClient *http.Client

	mu    sync.Mutex
	cache map[repoCacheKey]*repoCacheEntry

	cacheTTL time.Duration
	nowFunc  func() time.Time
}

type repoCacheKey struct {
	UserID int64
	Owner  string
	Repo   string
}

type repoCacheEntry struct {
	InstallationID int64
	CachedAt       time.Time
}

// DefaultResolverCacheTTL is the default TTL for (owner, repo) -> installationID mappings.
const DefaultResolverCacheTTL = 10 * time.Minute

// TokenResolverConfig holds configuration for creating a TokenResolver.
type TokenResolverConfig struct {
	SessionManager *SessionManager
	Installations  *InstallationTokenManager // nil when GitHub App is not configured
	AppID          int64                     // GitHub App ID for filtering GET /user/installations
	CacheTTL       time.Duration             // defaults to DefaultResolverCacheTTL
	BaseURL        string                    // GitHub API base URL (default: "https://api.github.com")
	HTTPClient     *http.Client              // HTTP client for GitHub API calls (default: http.DefaultClient with 30s timeout)
}

// NewTokenResolver creates a resolver that selects the right token
// for repo access based on the session's auth method.
func NewTokenResolver(cfg TokenResolverConfig) *TokenResolver {
	if cfg.CacheTTL == 0 {
		cfg.CacheTTL = DefaultResolverCacheTTL
	}
	if cfg.BaseURL == "" {
		cfg.BaseURL = "https://api.github.com"
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	return &TokenResolver{
		session:       cfg.SessionManager,
		installations: cfg.Installations,
		appID:         cfg.AppID,
		baseURL:       cfg.BaseURL,
		httpClient:    cfg.HTTPClient,
		cache:         make(map[repoCacheKey]*repoCacheEntry),
		cacheTTL:      cfg.CacheTTL,
		nowFunc:       time.Now,
	}
}

// ResolveRepoToken returns a GitHub token suitable for accessing the
// given repository's contents.
//
// For GitHub App sessions: looks up which installation covers the repo
// and returns an installation token from the InstallationTokenManager.
// For PAT/OAuth sessions: returns the user's stored token directly.
//
// Returns an error if the repo is not covered by any installation and
// the session is not a PAT/OAuth session.
func (r *TokenResolver) ResolveRepoToken(sessionID, owner, repo string) (string, error) {
	method, ok := r.session.GetAuthMethod(sessionID)
	if !ok {
		return "", fmt.Errorf("auth: session expired or evicted; re-authenticate")
	}

	// PAT and legacy OAuth: use the stored token directly.
	if method == AuthMethodPAT || method == AuthMethodOAuth || r.installations == nil {
		token, ok := r.session.GetUserToken(sessionID)
		if !ok {
			return "", fmt.Errorf("auth: session expired or evicted; re-authenticate")
		}
		return token, nil
	}

	// GitHub App: resolve via installation.
	return r.resolveViaInstallation(sessionID, owner, repo)
}

// resolveViaInstallation finds the installation covering the repo and
// returns an installation token.
func (r *TokenResolver) resolveViaInstallation(sessionID, owner, repo string) (string, error) {
	// Get user info for cache key.
	userToken, ok := r.session.GetUserToken(sessionID)
	if !ok {
		return "", fmt.Errorf("auth: session expired or evicted; re-authenticate")
	}

	// Check the resolver cache for a known installation ID.
	// We need the user ID from the session for the cache key.
	// For now, use a composite key of sessionID + owner + repo.
	cacheKey := repoCacheKey{Owner: owner, Repo: repo}

	r.mu.Lock()
	entry, ok := r.cache[cacheKey]
	r.mu.Unlock()

	if ok && r.nowFunc().Before(entry.CachedAt.Add(r.cacheTTL)) {
		return r.installations.Token(entry.InstallationID)
	}

	// Cache miss — discover which installation covers this repo.
	installationID, err := r.findInstallationForRepo(userToken, owner, repo)
	if err != nil {
		// Fall back to user token if it's a PAT session.
		if r.session.IsPATSession(sessionID) {
			return userToken, nil
		}
		return "", fmt.Errorf("auth: no GitHub App installation covers %s/%s — install the EPF GitHub App on this repository", owner, repo)
	}

	// Cache the mapping.
	r.mu.Lock()
	r.cache[cacheKey] = &repoCacheEntry{
		InstallationID: installationID,
		CachedAt:       r.nowFunc(),
	}
	r.mu.Unlock()

	return r.installations.Token(installationID)
}

// findInstallationForRepo queries the GitHub API to find which
// installation of the App covers the given repo.
//
// Strategy:
//  1. GET /user/installations — list all installations the user can see
//  2. Filter to our App ID
//  3. For each matching installation, GET /installation/repositories
//     and check if the target repo is in the list
//
// A future optimization could use GET /repos/{owner}/{repo}/installation
// (single API call) but that endpoint requires the repo to already have
// the App installed and the caller to be an App JWT, not a user token.
func (r *TokenResolver) findInstallationForRepo(userToken, owner, repo string) (int64, error) {
	// List the user's installations of our App.
	installations, err := r.listUserInstallations(userToken)
	if err != nil {
		return 0, fmt.Errorf("list installations: %w", err)
	}

	targetFullName := owner + "/" + repo

	// Check each installation for the target repo.
	for _, inst := range installations {
		// Quick filter: if the installation is for a specific account,
		// skip it if the owner doesn't match.
		if inst.Account.Login != "" && inst.Account.Login != owner {
			continue
		}

		// Check if this installation has access to the target repo.
		hasRepo, err := r.installationHasRepo(userToken, inst.ID, targetFullName)
		if err != nil {
			continue // Skip on error, try next installation.
		}
		if hasRepo {
			return inst.ID, nil
		}
	}

	return 0, fmt.Errorf("no installation of the EPF GitHub App covers %s/%s", owner, repo)
}

// resolverInstallation is the minimal installation info needed by the resolver.
type resolverInstallation struct {
	ID      int64 `json:"id"`
	AppID   int64 `json:"app_id"`
	Account struct {
		Login string `json:"login"`
	} `json:"account"`
}

// listUserInstallations calls GET /user/installations to find installations
// of our App that the user can access.
func (r *TokenResolver) listUserInstallations(userToken string) ([]resolverInstallation, error) {
	var result []resolverInstallation
	page := 1

	for {
		url := fmt.Sprintf("%s/user/installations?per_page=100&page=%d", r.baseURL, page)

		body, status, err := r.doGitHubRequest(url, userToken)
		if err != nil {
			return nil, err
		}
		if status != http.StatusOK {
			return nil, fmt.Errorf("GET /user/installations returned %d", status)
		}

		var resp struct {
			Installations []resolverInstallation `json:"installations"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return nil, fmt.Errorf("parse installations response: %w", err)
		}

		for _, inst := range resp.Installations {
			if r.appID == 0 || inst.AppID == r.appID {
				result = append(result, inst)
			}
		}

		if len(resp.Installations) < 100 {
			break
		}
		page++
	}

	return result, nil
}

// installationHasRepo checks if a given installation has access to the target repo
// by calling GET /user/installations/{installation_id}/repositories and searching.
func (r *TokenResolver) installationHasRepo(userToken string, installationID int64, targetFullName string) (bool, error) {
	page := 1

	for {
		url := fmt.Sprintf("%s/user/installations/%d/repositories?per_page=100&page=%d",
			r.baseURL, installationID, page)

		body, status, err := r.doGitHubRequest(url, userToken)
		if err != nil {
			return false, err
		}
		if status != http.StatusOK {
			return false, fmt.Errorf("GET /user/installations/%d/repositories returned %d", installationID, status)
		}

		var resp struct {
			Repositories []struct {
				FullName string `json:"full_name"`
			} `json:"repositories"`
		}
		if err := json.Unmarshal(body, &resp); err != nil {
			return false, fmt.Errorf("parse repositories response: %w", err)
		}

		for _, r := range resp.Repositories {
			if r.FullName == targetFullName {
				return true, nil
			}
		}

		if len(resp.Repositories) < 100 {
			break
		}
		page++
	}

	return false, nil
}

// doGitHubRequest performs an authenticated GET request to the GitHub API.
func (r *TokenResolver) doGitHubRequest(url, token string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("create request: %w", err)
	}

	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	resp, err := r.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("request %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("read body: %w", err)
	}

	return body, resp.StatusCode, nil
}

// InvalidateCache removes cached installation mappings for a specific
// repo, forcing re-discovery on the next request.
func (r *TokenResolver) InvalidateCache(owner, repo string) {
	r.mu.Lock()
	defer r.mu.Unlock()

	// Remove all entries for this owner/repo regardless of user.
	for key := range r.cache {
		if key.Owner == owner && key.Repo == repo {
			delete(r.cache, key)
		}
	}
}

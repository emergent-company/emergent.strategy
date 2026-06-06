// scan.go — GitHub repository discovery for the connect flow.
// Provides ListInstallations and ScanInstallationRepos with an in-memory cache.
package sync

import (
	"context"
	"fmt"
	"log/slog"
	gosync "sync"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

// RepoScanResult is the outcome of scanning a single repository for EPF content.
type RepoScanResult struct {
	Name              string                `json:"name"`
	FullName          string                `json:"full_name"`
	Owner             string                `json:"owner"`
	HTMLURL           string                `json:"html_url"`
	DefaultBranch     string                `json:"default_branch"`
	Private           bool                  `json:"private"`
	Description       string                `json:"description,omitempty"`
	PushedAt          time.Time             `json:"pushed_at,omitempty"`
	HeadCommit        RepoCommitInfo        `json:"head_commit,omitempty"`
	HasEPF            bool                  `json:"has_epf"`
	DetectedInstances []DetectedEPFInstance `json:"detected_instances"`
	ScanTruncated     bool                  `json:"scan_truncated,omitempty"`
	ScanError         string                `json:"scan_error,omitempty"`
	// HasAppInstall is true when the GitHub App is installed on this repo's owner.
	// When false, read import works but write-back (sync to GitHub) is unavailable.
	HasAppInstall bool `json:"has_app_install"`
	// SubmoduleRefs are the git submodules this repo declares in .gitmodules.
	// Used to cross-reference subscriber repos on the canonical EPF repo cards.
	SubmoduleRefs []SubmoduleRef `json:"submodule_refs,omitempty"`
	// UsedByRepos are the full names (owner/repo) of repositories that reference
	// this repo as a git submodule. Populated in a post-scan pass.
	UsedByRepos []string `json:"used_by_repos,omitempty"`
}

// ---------------------------------------------------------------------------
// Scan cache
// ---------------------------------------------------------------------------

const scanCacheTTL = 30 * time.Minute

type scanCacheEntry struct {
	results []RepoScanResult
	expiry  time.Time
}

// scanCache holds in-memory scan results keyed by github_owner.
type scanCache struct {
	mu      gosync.Mutex
	entries map[string]scanCacheEntry
}

func newScanCache() *scanCache {
	return &scanCache{entries: make(map[string]scanCacheEntry)}
}

func (sc *scanCache) get(owner string) ([]RepoScanResult, bool) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	entry, ok := sc.entries[owner]
	if !ok || time.Now().After(entry.expiry) {
		return nil, false
	}
	return entry.results, true
}

func (sc *scanCache) set(owner string, results []RepoScanResult) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.entries[owner] = scanCacheEntry{
		results: results,
		expiry:  time.Now().Add(scanCacheTTL),
	}
}

func (sc *scanCache) invalidate(owner string) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	delete(sc.entries, owner)
}

// peek returns cached results without blocking, or (nil, false) when not ready.
func (sc *scanCache) peek(key string) ([]RepoScanResult, bool) {
	return sc.get(key)
}

// ---------------------------------------------------------------------------
// Service methods
// ---------------------------------------------------------------------------

// scanOnce is initialised in NewService; lazily created here to avoid requiring
// a new constructor parameter. The Service struct carries it.
func (s *Service) getScanCache() *scanCache {
	s.scanCacheMu.Lock()
	defer s.scanCacheMu.Unlock()
	if s.scanCacheStore == nil {
		s.scanCacheStore = newScanCache()
	}
	return s.scanCacheStore
}

// ListInstallations returns all GitHub App installations (App-level JWT).
// Returns ErrBadRequest when the GitHub App is not configured.
func (s *Service) ListInstallations(ctx context.Context) ([]InstallationInfo, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}
	return s.reader.ListInstallations(ctx)
}

// ListUserInstallations returns installations accessible to the user identified by userToken.
// Uses GET /user/installations — properly scoped per user for multi-tenant deployments.
func (s *Service) ListUserInstallations(ctx context.Context, userToken string) ([]InstallationInfo, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}
	return s.reader.ListUserInstallations(ctx, userToken)
}

// ScanUserRepos discovers all repositories the user has access to via their
// OAuth token (repo scope), detects EPF instances in each, and marks which
// repos have the GitHub App installed (enabling write-back).
// Results are cached in-memory for 5 minutes per user token prefix.
func (s *Service) ScanUserRepos(ctx context.Context, userToken string) ([]RepoScanResult, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}
	if userToken == "" {
		return nil, apperror.ErrBadRequest.WithDetail("user token is required")
	}

	cache := s.getScanCache()

	// Cache key: first 16 chars of token (never log the full token).
	cacheKey := "user:" + userToken[:min(16, len(userToken))]
	if cached, ok := cache.get(cacheKey); ok {
		slog.DebugContext(ctx, "scan repos: returning cached results")
		return cached, nil
	}

	// Fetch all repos the user has access to via OAuth (repo scope).
	userRepos, err := s.reader.ListUserRepos(ctx, userToken)
	if err != nil {
		return nil, fmt.Errorf("list user repos: %w", err)
	}

	// Fetch App installations to know which owners have write-back available.
	// Best-effort — failures just mean HasAppInstall=false for all repos.
	appInstallOwners := s.loadAppInstallOwners(ctx)

	// Detect EPF concurrently — max 5 goroutines.
	results := make([]RepoScanResult, len(userRepos))
	sem := make(chan struct{}, 5)
	var wg gosync.WaitGroup

	for i, repo := range userRepos {
		wg.Add(1)
		go func(idx int, r UserRepoInfo) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			result := RepoScanResult{
				Name:          r.Name,
				FullName:      r.FullName,
				Owner:         r.Owner,
				HTMLURL:       r.HTMLURL,
				DefaultBranch: r.DefaultBranch,
				Private:       r.Private,
				Description:   r.Description,
				PushedAt:      r.PushedAt,
				HasAppInstall: appInstallOwners[r.Owner],
			}

			// To detect EPF we need an App token for this owner, or we use
			// the user token directly to call the tree API.
			// Try App token first (for write-capable owners); fall back to user token.
			scanToken := userToken
			if result.HasAppInstall {
				if appTok, tokErr := s.reader.GetInstallationToken(ctx, r.Owner); tokErr == nil {
					scanToken = appTok
				}
			}

			branch := r.DefaultBranch
			if branch == "" {
				branch = "main"
			}

			instances, submodRefs, truncated, headCommit, detectErr := s.reader.DetectEPFInRepo(ctx, scanToken, r.Owner, r.Name, branch)
			if detectErr != nil {
				slog.WarnContext(ctx, "epf detection failed",
					"owner", r.Owner, "repo", r.Name, "err", detectErr)
				result.ScanError = detectErr.Error()
			} else {
				result.DetectedInstances = instances
				result.HasEPF = len(instances) > 0
				result.ScanTruncated = truncated
				result.SubmoduleRefs = submodRefs
				result.HeadCommit = headCommit
			}

			results[idx] = result
		}(i, repo)
	}

	wg.Wait()

	// Post-scan: cross-reference submodule subscriptions.
	// For each repo that declares submodules pointing at other repos in the scan,
	// annotate those target repos with this repo as a subscriber ("used by").
	annotateSubmoduleSubscribers(results)

	cache.set(cacheKey, results)

	slog.InfoContext(ctx, "scan user repos complete",
		"repos", len(userRepos),
		"with_epf", countEPF(results),
		"with_app_install", countAppInstall(results))

	return results, nil
}

// StartScanUserRepos kicks off a background scan goroutine and returns immediately.
// The caller should poll GetCachedUserRepos until results appear.
// If a scan is already cached for this token, it is a no-op.
func (s *Service) StartScanUserRepos(userToken string) {
	cache := s.getScanCache()
	cacheKey := "user:" + userToken[:min(16, len(userToken))]
	if _, ok := cache.peek(cacheKey); ok {
		return // already cached, no need to re-scan
	}
	go func() {
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		// ScanUserRepos populates the cache internally on success.
		if _, err := s.ScanUserRepos(ctx, userToken); err != nil {
			slog.Warn("background scan failed", "err", err)
		}
	}()
}

// GetCachedUserRepos returns cached scan results for the user token, or (nil, false)
// if the scan is still in progress.
func (s *Service) GetCachedUserRepos(userToken string) ([]RepoScanResult, bool) {
	if userToken == "" {
		return nil, false
	}
	cache := s.getScanCache()
	cacheKey := "user:" + userToken[:min(16, len(userToken))]
	return cache.peek(cacheKey)
}

// ScanInstallationRepos is kept for backward compat with MCP tools.
// New web UI flows use ScanUserRepos instead.
func (s *Service) ScanInstallationRepos(ctx context.Context, githubOwner string) ([]RepoScanResult, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}
	if githubOwner == "" {
		return nil, apperror.ErrBadRequest.WithDetail("github_owner is required")
	}

	cache := s.getScanCache()
	if cached, ok := cache.get(githubOwner); ok {
		return cached, nil
	}

	token, err := s.reader.GetInstallationToken(ctx, githubOwner)
	if err != nil {
		return nil, fmt.Errorf("github_owner %q: GitHub App not installed: %w", githubOwner, err)
	}

	repos, err := s.reader.ListInstallationRepos(ctx, token)
	if err != nil {
		return nil, fmt.Errorf("list installation repos for %q: %w", githubOwner, err)
	}

	results := make([]RepoScanResult, len(repos))
	sem := make(chan struct{}, 5)
	var wg gosync.WaitGroup

	for i, repo := range repos {
		wg.Add(1)
		go func(idx int, r RepoInfo) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			result := RepoScanResult{
				Name: r.Name, FullName: r.FullName, Owner: githubOwner,
				HTMLURL: r.HTMLURL, DefaultBranch: r.DefaultBranch, Private: r.Private,
				HasAppInstall: true, // by definition — we got here via App token
			}
			branch := r.DefaultBranch
			if branch == "" {
				branch = "main"
			}
			instances, submodRefs, truncated, headCommit, detectErr := s.reader.DetectEPFInRepo(ctx, token, githubOwner, r.Name, branch)
			if detectErr != nil {
				result.ScanError = detectErr.Error()
			} else {
				result.DetectedInstances = instances
				result.HasEPF = len(instances) > 0
				result.SubmoduleRefs = submodRefs
				result.ScanTruncated = truncated
				result.HeadCommit = headCommit
			}
			results[idx] = result
		}(i, repo)
	}

	wg.Wait()
	cache.set(githubOwner, results)
	return results, nil
}

// loadAppInstallOwners returns a set of owner logins where the GitHub App is installed.
// Best-effort — returns empty map on error.
func (s *Service) loadAppInstallOwners(ctx context.Context) map[string]bool {
	owners := make(map[string]bool)
	installs, err := s.reader.ListInstallations(ctx)
	if err != nil {
		slog.WarnContext(ctx, "load app install owners: list installations failed (write-back unavailable)", "err", err)
		return owners
	}
	for _, i := range installs {
		owners[i.OwnerLogin] = true
	}
	return owners
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// InvalidateScanCache clears the cached scan results for an owner.
// Called when an import completes so the next scan reflects reality.
func (s *Service) InvalidateScanCache(githubOwner string) {
	s.getScanCache().invalidate(githubOwner)
}

// annotateSubmoduleSubscribers cross-references the scan results so that each
// EPF repo card knows which other repos in the same scan use it as a submodule.
//
// Example: twentyfirst declares SubmoduleRefs[{RepoSlug:"eyedea-io/21st-epf"}].
// After this pass, the 21st-epf result gains UsedByRepos=["eyedea-io/twentyfirst"].
func annotateSubmoduleSubscribers(results []RepoScanResult) {
	// Build a lookup from full repo name → index.
	idx := make(map[string]int, len(results))
	for i, r := range results {
		idx[r.FullName] = i
	}

	for _, subscriber := range results {
		for _, ref := range subscriber.SubmoduleRefs {
			if ref.RepoSlug == "" {
				continue
			}
			if targetIdx, ok := idx[ref.RepoSlug]; ok {
				results[targetIdx].UsedByRepos = append(
					results[targetIdx].UsedByRepos,
					subscriber.FullName,
				)
			}
		}
	}
}

func countEPF(results []RepoScanResult) int {
	n := 0
	for _, r := range results {
		if r.HasEPF {
			n++
		}
	}
	return n
}

func countAppInstall(results []RepoScanResult) int {
	seen := make(map[string]bool)
	for _, r := range results {
		if r.HasAppInstall {
			seen[r.Owner] = true
		}
	}
	return len(seen)
}

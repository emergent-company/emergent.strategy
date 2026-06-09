// scan.go — GitHub repository discovery for the connect flow.
// Provides ListInstallations and ScanInstallationRepos with an in-memory cache.
package sync

import (
	"context"
	"errors"
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
const scanErrorTTL = 60 * time.Second    // minimum retry gap on non-rate-limit errors
const scanErrorBuffer = 10 * time.Second // extra buffer added to rate limit RetryAfter

type scanCacheEntry struct {
	results   []RepoScanResult
	scanError error // non-nil when the last scan failed
	expiry    time.Time
	running   bool // true while a background scan goroutine is active
	partial   bool // true when results are from quick scan only (full scan pending)
}

// scanCache holds in-memory scan results keyed by cache key.
type scanCache struct {
	mu      gosync.Mutex
	entries map[string]scanCacheEntry
}

func newScanCache() *scanCache {
	return &scanCache{entries: make(map[string]scanCacheEntry)}
}

// ScanState is the result of a non-blocking cache peek.
type ScanState struct {
	Ready   bool             // true when results (or a terminal error) are available
	Partial bool             // true when Ready but only quick-scan data is available (no EPF detection yet)
	Results []RepoScanResult // non-nil when Ready and no error
	Err     error            // non-nil when Ready and scan failed
}

// peek returns the current state of the cache entry without blocking.
func (sc *scanCache) peek(key string) ScanState {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	entry, ok := sc.entries[key]
	if !ok {
		return ScanState{}
	}
	if time.Now().After(entry.expiry) {
		// Expired — treat as not ready (will re-trigger scan).
		delete(sc.entries, key)
		return ScanState{}
	}
	if entry.running {
		return ScanState{} // scan in progress
	}
	return ScanState{Ready: true, Partial: entry.partial, Results: entry.results, Err: entry.scanError}
}

// markRunning sets the running flag, preventing duplicate goroutines.
// Returns false if a full scan is already running or full results are fresh.
// Partial results do NOT block a new full scan from starting.
func (sc *scanCache) markRunning(key string) bool {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	entry := sc.entries[key]
	if entry.running {
		return false // already in progress
	}
	// Only block if we have full (non-partial) fresh results.
	if !entry.expiry.IsZero() && time.Now().Before(entry.expiry) && !entry.partial {
		return false // fresh full result already cached
	}
	sc.entries[key] = scanCacheEntry{running: true, expiry: time.Now().Add(10 * time.Minute)}
	return true
}

// setPartialResult stores quick-scan results. The entry remains available for
// the polling loop but the full scan goroutine will overwrite it with full results.
func (sc *scanCache) setPartialResult(key string, results []RepoScanResult) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.entries[key] = scanCacheEntry{
		results: results,
		partial: true,
		expiry:  time.Now().Add(scanCacheTTL),
	}
}

func (sc *scanCache) setResult(key string, results []RepoScanResult) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.entries[key] = scanCacheEntry{
		results: results,
		expiry:  time.Now().Add(scanCacheTTL),
	}
}

func (sc *scanCache) setError(key string, err error, ttl time.Duration) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	sc.entries[key] = scanCacheEntry{
		scanError: err,
		expiry:    time.Now().Add(ttl),
	}
}

func (sc *scanCache) invalidate(key string) {
	sc.mu.Lock()
	defer sc.mu.Unlock()
	delete(sc.entries, key)
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
	if state := cache.peek(cacheKey); state.Ready {
		slog.DebugContext(ctx, "scan repos: returning cached results")
		return state.Results, state.Err
	}

	results, err := s.doScan(ctx, userToken)
	if err != nil {
		return nil, err
	}
	cache.setResult(cacheKey, results)
	return results, nil
}

// doScan performs the actual repo listing and EPF detection without touching the cache.
func (s *Service) doScan(ctx context.Context, userToken string) ([]RepoScanResult, error) {
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
	annotateSubmoduleSubscribers(results)

	slog.InfoContext(ctx, "scan user repos complete",
		"repos", len(userRepos),
		"with_epf", countEPF(results),
		"with_app_install", countAppInstall(results))

	return results, nil
}

// doQuickScan lists repos and returns basic metadata (name, PushedAt, description)
// without performing EPF detection. Much faster than doScan — no tree API calls.
func (s *Service) doQuickScan(ctx context.Context, userToken string) ([]RepoScanResult, error) {
	userRepos, err := s.reader.ListUserRepos(ctx, userToken)
	if err != nil {
		return nil, fmt.Errorf("list user repos (quick): %w", err)
	}
	appInstallOwners := s.loadAppInstallOwners(ctx)
	results := make([]RepoScanResult, len(userRepos))
	for i, r := range userRepos {
		results[i] = RepoScanResult{
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
	}
	slog.InfoContext(ctx, "quick scan complete", "repos", len(results))
	return results, nil
}

// StartScanUserRepos performs the quick scan synchronously and returns partial results
// immediately, then kicks off the full EPF detection in the background.
// Returns the partial ScanState so the caller can render the repo list right away
// without waiting for a poll cycle.
// Returns ScanState{} (not ready) when a scan is already running or results are fresh.
func (s *Service) StartScanUserRepos(ctx context.Context, userToken string) ScanState {
	cache := s.getScanCache()
	cacheKey := "user:" + userToken[:min(16, len(userToken))]
	if !cache.markRunning(cacheKey) {
		return ScanState{} // already running or full results fresh — caller uses GetCachedScanState
	}

	// Phase 1: quick scan — runs synchronously so the caller gets results immediately.
	quickResults, quickErr := s.doQuickScan(ctx, userToken)
	if quickErr != nil {
		slog.WarnContext(ctx, "quick scan failed", "err", quickErr)
		errTTL := scanErrorTTL
		var rle *RateLimitError
		if errors.As(quickErr, &rle) && rle.RetryAfter > 0 {
			errTTL = rle.RetryAfter + scanErrorBuffer
		}
		cache.setError(cacheKey, quickErr, errTTL)
		return ScanState{Ready: true, Err: quickErr}
	}
	cache.setPartialResult(cacheKey, quickResults)

	// Phase 2: full EPF detection runs in the background.
	go func() {
		bgCtx, cancel := context.WithTimeout(context.Background(), 10*time.Minute)
		defer cancel()
		results, err := s.doScan(bgCtx, userToken)
		if err != nil {
			slog.Warn("background EPF scan failed", "err", err)
			errTTL := scanErrorTTL
			var rle *RateLimitError
			if errors.As(err, &rle) && rle.RetryAfter > 0 {
				errTTL = rle.RetryAfter + scanErrorBuffer
			}
			cache.setError(cacheKey, err, errTTL)
			return
		}
		cache.setResult(cacheKey, results)
	}()

	return ScanState{Ready: true, Partial: true, Results: quickResults}
}

// GetCachedScanState returns the current scan state for the user token.
// Ready=false means the scan is still in progress.
func (s *Service) GetCachedScanState(userToken string) ScanState {
	if userToken == "" {
		return ScanState{}
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
	if state := cache.peek(githubOwner); state.Ready {
		return state.Results, state.Err
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
	cache.setResult(githubOwner, results)
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

package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/auth"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/source"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
	"github.com/mark3labs/mcp-go/mcp"
)

// strategyStoreCacheEntry wraps a strategy store with mtime tracking for staleness detection.
type strategyStoreCacheEntry struct {
	store      strategy.StrategyStore
	loadedAt   time.Time
	fileMtimes map[string]time.Time
}

// MaxRegisteredStores is the maximum number of dynamically-registered remote
// strategy stores (one per owner/repo). When exceeded, the least-recently-used
// store is evicted. Stores registered at startup (single-tenant mode) are not
// counted toward this limit.
const MaxRegisteredStores = 50

var (
	strategyStoreMu    sync.RWMutex
	strategyStoreCache = make(map[string]*strategyStoreCacheEntry)

	// registeredStores holds externally-created strategy stores (e.g., GitHub-backed).
	// These bypass mtime-based staleness detection since they manage their own caching
	// (e.g., via source.CachedSource TTL). Keys are synthetic paths like
	// "github://owner/repo/path" or real filesystem paths.
	registeredStores = make(map[string]strategy.StrategyStore)

	// registeredStoreOrder tracks LRU order for dynamically-registered stores.
	// Most recently used at the end. Used for eviction when MaxRegisteredStores
	// is exceeded. Only tracks dynamic stores (multi-tenant), not startup stores.
	registeredStoreOrder []string

	// startupStores tracks store keys registered at startup (single-tenant mode).
	// These are exempt from LRU eviction.
	startupStores = make(map[string]bool)
)

// IsRegisteredStore checks if a path corresponds to a pre-registered strategy store
// (e.g., a GitHub-backed store loaded from a github:// URI). This is used by tools
// that need to distinguish between filesystem and remote instances to skip filesystem
// validation (os.Stat, anchor file checks) for remote sources.
func IsRegisteredStore(key string) bool {
	strategyStoreMu.RLock()
	defer strategyStoreMu.RUnlock()
	_, ok := registeredStores[key]
	return ok
}

// RegisterStrategyStore adds a pre-configured strategy store to the cache.
// This is used for non-filesystem sources (e.g., GitHubSource) where the store
// is created and loaded externally (in cmd/serve.go) with its own caching.
// The registered store bypasses mtime-based staleness detection.
//
// Stores registered via this function (at startup) are exempt from LRU eviction.
// Only dynamically-created stores (from multi-tenant routing) are evicted.
//
// The key should be a unique identifier for the source — either a real filesystem
// path or a synthetic URI like "github://owner/repo/path".
func RegisterStrategyStore(key string, store strategy.StrategyStore) {
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()

	registeredStores[key] = store
	startupStores[key] = true // Exempt from LRU eviction.
}

// getOrCreateStrategyStore returns a cached or new strategy store for the given instance path.
// It first checks for pre-registered stores (e.g., GitHub-backed), then falls back to
// the mtime-based filesystem cache.
// On each call for filesystem stores, it checks whether any tracked files have been
// modified since the last load. If files changed, it automatically reloads.
func getOrCreateStrategyStore(instancePath string) (strategy.StrategyStore, error) {
	strategyStoreMu.RLock()

	// Check registered stores first (GitHub-backed, etc.) — these manage their own caching.
	if store, ok := registeredStores[instancePath]; ok {
		strategyStoreMu.RUnlock()
		return store, nil
	}

	entry, ok := strategyStoreCache[instancePath]
	strategyStoreMu.RUnlock()

	if ok {
		// Check if any tracked files have been modified since load
		currentMtimes := getInstanceFileMtimes(instancePath)
		if !mtimesChanged(entry.fileMtimes, currentMtimes) {
			return entry.store, nil
		}
		// Files changed — need to reload
		strategyStoreMu.Lock()
		defer strategyStoreMu.Unlock()

		// Double-check after acquiring write lock
		entry, ok = strategyStoreCache[instancePath]
		if ok {
			currentMtimes = getInstanceFileMtimes(instancePath)
			if !mtimesChanged(entry.fileMtimes, currentMtimes) {
				return entry.store, nil
			}
		}

		// Reload the store
		store := strategy.NewFileSystemSource(instancePath)
		if err := store.Load(context.Background()); err != nil {
			return nil, fmt.Errorf("reloading strategy store: %w", err)
		}
		strategyStoreCache[instancePath] = &strategyStoreCacheEntry{
			store:      store,
			loadedAt:   time.Now(),
			fileMtimes: currentMtimes,
		}
		return store, nil
	}

	// No cache entry — create new store
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()

	// Double-check after acquiring write lock
	if entry, ok := strategyStoreCache[instancePath]; ok {
		return entry.store, nil
	}

	store := strategy.NewFileSystemSource(instancePath)
	if err := store.Load(context.Background()); err != nil {
		return nil, fmt.Errorf("loading strategy store: %w", err)
	}

	strategyStoreCache[instancePath] = &strategyStoreCacheEntry{
		store:      store,
		loadedAt:   time.Now(),
		fileMtimes: getInstanceFileMtimes(instancePath),
	}
	return store, nil
}

// getStrategyStoreAge returns how long ago the store was loaded, or 0 if not cached.
// For registered stores (GitHub-backed), returns 1 second as a sentinel indicating
// the store is loaded but age is managed externally.
func getStrategyStoreAge(instancePath string) time.Duration {
	strategyStoreMu.RLock()
	defer strategyStoreMu.RUnlock()

	// Registered stores are always "loaded" but don't track age internally.
	if _, ok := registeredStores[instancePath]; ok {
		return 1 * time.Second
	}

	entry, ok := strategyStoreCache[instancePath]
	if !ok {
		return 0
	}
	return time.Since(entry.loadedAt)
}

// invalidateStrategyStore removes the cached strategy store for the given instance path,
// forcing a reload on next access. Call this after any write operation that modifies
// EPF instance files. For registered stores, this closes and removes the store.
func invalidateStrategyStore(instancePath string) {
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()

	// Check registered stores
	if store, ok := registeredStores[instancePath]; ok {
		store.Close()
		delete(registeredStores, instancePath)
	}

	if entry, ok := strategyStoreCache[instancePath]; ok {
		entry.store.Close()
		delete(strategyStoreCache, instancePath)
	}
}

// invalidateAnalyzer removes the cached relationship analyzer for the given instance path.
func (s *Server) invalidateAnalyzer(instancePath string) {
	s.analyzerMu.Lock()
	defer s.analyzerMu.Unlock()

	delete(s.analyzers, instancePath)
}

// invalidateInstanceCaches clears all cached data for the given instance path.
// This should be called after any write operation that modifies EPF instance files.
func (s *Server) invalidateInstanceCaches(instancePath string) {
	invalidateStrategyStore(instancePath)
	s.invalidateAnalyzer(instancePath)
}

// getInstanceFileMtimes collects current modification times for key EPF instance files.
// It checks READY/ YAML files, FIRE/definitions/product/, FIRE/value_models/,
// and anchor/meta files. This is lightweight (OS stat calls only, no file reads).
func getInstanceFileMtimes(instancePath string) map[string]time.Time {
	mtimes := make(map[string]time.Time)

	// Check anchor/meta files
	for _, name := range []string{"_epf.yaml", "_meta.yaml"} {
		path := filepath.Join(instancePath, name)
		if info, err := os.Stat(path); err == nil {
			mtimes[path] = info.ModTime()
		}
	}

	// Check READY/ YAML files
	readyDir := filepath.Join(instancePath, "READY")
	if entries, err := os.ReadDir(readyDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
				path := filepath.Join(readyDir, e.Name())
				if info, err := os.Stat(path); err == nil {
					mtimes[path] = info.ModTime()
				}
			}
		}
	}

	// Check FIRE/definitions/product/ YAML files
	fdDir := filepath.Join(instancePath, "FIRE", "definitions", "product")
	if entries, err := os.ReadDir(fdDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
				path := filepath.Join(fdDir, e.Name())
				if info, err := os.Stat(path); err == nil {
					mtimes[path] = info.ModTime()
				}
			}
		}
	}

	// Check FIRE/value_models/ YAML files
	vmDir := filepath.Join(instancePath, "FIRE", "value_models")
	if entries, err := os.ReadDir(vmDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
				path := filepath.Join(vmDir, e.Name())
				if info, err := os.Stat(path); err == nil {
					mtimes[path] = info.ModTime()
				}
			}
		}
	}

	// Check AIM/ YAML files
	aimDir := filepath.Join(instancePath, "AIM")
	if entries, err := os.ReadDir(aimDir); err == nil {
		for _, e := range entries {
			if !e.IsDir() && strings.HasSuffix(e.Name(), ".yaml") {
				path := filepath.Join(aimDir, e.Name())
				if info, err := os.Stat(path); err == nil {
					mtimes[path] = info.ModTime()
				}
			}
		}
	}

	return mtimes
}

// mtimesChanged returns true if any file mtime has changed between recorded and current state.
// It detects modifications, new files, and deleted files.
func mtimesChanged(recorded, current map[string]time.Time) bool {
	// Check for modified or new files
	for path, currentMtime := range current {
		if recordedMtime, ok := recorded[path]; ok {
			if !currentMtime.Equal(recordedMtime) {
				return true
			}
		} else {
			// New file appeared
			return true
		}
	}
	// Check for deleted files
	for path := range recorded {
		if _, ok := current[path]; !ok {
			return true
		}
	}
	return false
}

// SetMultiTenantAuth configures multi-tenant authentication on the server.
// Call this after creating the server when running in multi-tenant mode.
// The accessChecker and sessionManager enable per-request access control
// and dynamic instance routing for remote (GitHub-backed) EPF instances.
func (s *Server) SetMultiTenantAuth(ac *auth.AccessChecker, sm *auth.SessionManager, mode auth.ServerMode) {
	s.accessChecker = ac
	s.sessionManager = sm
	s.serverMode = mode
}

// SetTokenResolver configures the GitHub App token resolver for installation-scoped
// repo access. When set, the server uses installation tokens instead of the user's
// OAuth token for GitHub API access to repos where the App is installed.
func (s *Server) SetTokenResolver(tr *auth.TokenResolver) {
	s.tokenResolver = tr
}

// resolveAndLoadStore resolves an instance_path to a strategy store, with access control
// for remote (owner/repo) paths in multi-tenant mode.
//
// For local filesystem paths, delegates directly to getOrCreateStrategyStore.
// For remote paths (owner/repo format), it:
//  1. Extracts the authenticated user from the request context.
//  2. Retrieves the user's OAuth token from the session manager.
//  3. Verifies the user has read access to the repo via AccessChecker.
//  4. Creates or reuses a cached GitHubSource → CachedSource → SourceBackedStore.
//
// In local/single-tenant mode, remote paths that match a registered store key
// (from setupGitHubStore) are served directly. Access control is only enforced
// in multi-tenant mode.
func (s *Server) resolveAndLoadStore(ctx context.Context, instancePath string) (strategy.StrategyStore, error) {
	// Parse the instance path to determine if it's a remote repo reference.
	owner, repo, subpath, isRemote := auth.ParseInstancePath(instancePath)

	if !isRemote {
		// Local filesystem path — no access control needed, use existing logic.
		return getOrCreateStrategyStore(instancePath)
	}

	// Build the synthetic cache key for this remote instance.
	cacheKey := buildGitHubCacheKey(owner, repo, subpath)

	// Check if there's already a registered store for this key (e.g., from setupGitHubStore
	// in single-tenant mode, or a previous dynamic registration in multi-tenant mode).
	strategyStoreMu.Lock()
	if store, ok := registeredStores[cacheKey]; ok {
		touchRegisteredStoreLRU(cacheKey)
		strategyStoreMu.Unlock()

		// In multi-tenant mode, still need to verify access per-request.
		if s.serverMode == auth.ModeMultiTenant {
			if err := s.verifyRepoAccess(ctx, owner, repo); err != nil {
				return nil, err
			}
		}
		return store, nil
	}
	// Also check with the raw instance_path as key (single-tenant uses raw github:// URIs).
	if store, ok := registeredStores[instancePath]; ok {
		touchRegisteredStoreLRU(instancePath)
		strategyStoreMu.Unlock()
		if s.serverMode == auth.ModeMultiTenant {
			if err := s.verifyRepoAccess(ctx, owner, repo); err != nil {
				return nil, err
			}
		}
		return store, nil
	}
	strategyStoreMu.Unlock()

	// No registered store — only allowed in multi-tenant mode (dynamic routing).
	if s.serverMode != auth.ModeMultiTenant {
		return nil, fmt.Errorf("remote instance %q not configured; in single-tenant mode, configure EPF_GITHUB_OWNER and EPF_GITHUB_REPO", instancePath)
	}

	// Verify user has access before loading the instance.
	if err := s.verifyRepoAccess(ctx, owner, repo); err != nil {
		return nil, err
	}

	// Dynamically create and register the store for this repo.
	return s.createAndRegisterRemoteStore(ctx, owner, repo, subpath, cacheKey)
}

// verifyRepoAccess checks that the authenticated user has read access to the given repo.
//
// For GitHub App sessions with a TokenResolver configured, access is verified by
// checking whether an App installation covers the repo. This is more precise than
// the OAuth token check because it reflects the App's actual installation scope.
//
// For legacy OAuth and PAT sessions, falls back to GET /repos/{owner}/{repo} with
// the user's token.
//
// Returns an error if:
//   - No user is found in the context (not authenticated)
//   - No token is found for the session (session evicted)
//   - User doesn't have access to the repo
func (s *Server) verifyRepoAccess(ctx context.Context, owner, repo string) error {
	user := auth.UserFromContext(ctx)
	if user == nil {
		return fmt.Errorf("authentication required to access remote instance %s/%s", owner, repo)
	}

	if s.sessionManager == nil || s.accessChecker == nil {
		return fmt.Errorf("multi-tenant auth not configured")
	}

	// For GitHub App sessions, try installation-based token resolution first.
	// If the resolver can produce a token for this repo, the user has access
	// (they can see the installation, and the installation covers the repo).
	if s.tokenResolver != nil {
		authMethod, _ := s.sessionManager.GetAuthMethod(user.SessionID)
		if authMethod == auth.AuthMethodGitHubApp {
			_, err := s.tokenResolver.ResolveRepoToken(user.SessionID, owner, repo)
			if err == nil {
				return nil // Installation token resolved — access confirmed.
			}
			// If resolution fails, it could mean:
			// 1. The App is not installed on this repo's org
			// 2. The installation doesn't cover this repo
			// Fall through to the OAuth-based check as a fallback.
		}
	}

	// Get the user's token from the session store.
	userToken, ok := s.sessionManager.GetUserToken(user.SessionID)
	if !ok {
		return fmt.Errorf("session expired or evicted; re-authenticate at /auth/github/login")
	}

	// Check access via GitHub API (cached per-user per-repo).
	allowed, err := s.accessChecker.CanAccess(user.UserID, owner, repo, userToken)
	if err != nil {
		return fmt.Errorf("access check for %s/%s: %w", owner, repo, err)
	}
	if !allowed {
		// Provide a helpful error if GitHub App is configured but not installed.
		if s.tokenResolver != nil {
			return fmt.Errorf("access denied: user %q does not have access to %s/%s. "+
				"If using GitHub App auth, ensure the EPF GitHub App is installed on the %s organization",
				user.Username, owner, repo, owner)
		}
		return &auth.RepoAccessDeniedError{Owner: owner, Repo: repo, Username: user.Username}
	}

	return nil
}

// createAndRegisterRemoteStore creates a GitHubSource-backed store for a remote repo
// and registers it for future reuse. Uses the user's OAuth token for GitHub API access.
//
// Thread-safe: uses a write lock to prevent duplicate store creation.
func (s *Server) createAndRegisterRemoteStore(ctx context.Context, owner, repo, subpath, cacheKey string) (strategy.StrategyStore, error) {
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()

	// Double-check: another goroutine may have created the store while we waited.
	if store, ok := registeredStores[cacheKey]; ok {
		return store, nil
	}

	// Determine the token function for GitHub API access.
	// For GitHub App sessions, this resolves installation tokens per-repo.
	// For legacy OAuth/PAT, this returns the user's token directly.
	tokenFn := s.buildTokenFuncForRepo(ctx, owner, repo)

	// Build the GitHubSource with optional subpath.
	var opts []source.GitHubOption
	if subpath != "" {
		opts = append(opts, source.WithBasePath(subpath))
	}
	ghSrc := source.NewGitHubSource(owner, repo, tokenFn, opts...)

	// Wrap in a cache for performance.
	cachedSrc := source.NewCachedSource(ghSrc)

	// Create and load the strategy store.
	store := strategy.NewSourceBackedStore(cachedSrc)
	if err := store.Load(ctx); err != nil {
		return nil, fmt.Errorf("loading strategy from %s: %w", cacheKey, err)
	}

	// Register for future reuse. The cached source manages its own TTL.
	registeredStores[cacheKey] = store

	// Track in LRU order and evict if over limit.
	touchRegisteredStoreLRU(cacheKey)
	evictRegisteredStoresIfNeeded()

	return store, nil
}

// buildTokenFunc creates a TokenFunc for GitHub API access based on the current
// authentication context.
//
// For GitHub App sessions with a TokenResolver, this returns a function that
// resolves installation tokens per-repo. The returned function needs owner/repo
// context, which is available from the GitHubSource that calls it.
//
// For legacy OAuth and PAT sessions, returns the user's token directly.
// Falls back to no auth if context has no user.
func (s *Server) buildTokenFunc(ctx context.Context) source.TokenFunc {
	user := auth.UserFromContext(ctx)
	if user == nil || s.sessionManager == nil {
		return nil
	}

	// Capture the session ID for the token function closure.
	sessionID := user.SessionID
	return func() (string, error) {
		token, ok := s.sessionManager.GetUserToken(sessionID)
		if !ok {
			return "", fmt.Errorf("session expired; re-authenticate")
		}
		return token, nil
	}
}

// buildTokenFuncForRepo creates a TokenFunc that uses the TokenResolver when available,
// falling back to the user's direct token. This is used when creating GitHubSource
// instances for specific repos in multi-tenant mode.
func (s *Server) buildTokenFuncForRepo(ctx context.Context, owner, repo string) source.TokenFunc {
	user := auth.UserFromContext(ctx)
	if user == nil || s.sessionManager == nil {
		return nil
	}

	sessionID := user.SessionID

	// If we have a token resolver and the user authenticated via GitHub App,
	// try to use installation tokens for better scoping.
	if s.tokenResolver != nil {
		authMethod, _ := s.sessionManager.GetAuthMethod(sessionID)
		if authMethod == auth.AuthMethodGitHubApp {
			return func() (string, error) {
				token, err := s.tokenResolver.ResolveRepoToken(sessionID, owner, repo)
				if err == nil {
					return token, nil
				}
				// Fallback to user token if resolution fails.
				userToken, ok := s.sessionManager.GetUserToken(sessionID)
				if !ok {
					return "", fmt.Errorf("session expired; re-authenticate")
				}
				return userToken, nil
			}
		}
	}

	// Legacy OAuth / PAT — use user's token directly.
	return func() (string, error) {
		token, ok := s.sessionManager.GetUserToken(sessionID)
		if !ok {
			return "", fmt.Errorf("session expired; re-authenticate")
		}
		return token, nil
	}
}

// buildGitHubCacheKey creates a synthetic cache key for a remote GitHub instance.
func buildGitHubCacheKey(owner, repo, subpath string) string {
	key := fmt.Sprintf("github://%s/%s", owner, repo)
	if subpath != "" {
		key += "/" + subpath
	}
	return key
}

// touchRegisteredStoreLRU moves a dynamic store key to the end of the LRU list.
// Must be called with strategyStoreMu held.
func touchRegisteredStoreLRU(key string) {
	// Don't track startup stores.
	if startupStores[key] {
		return
	}
	// Remove existing entry.
	for i, k := range registeredStoreOrder {
		if k == key {
			registeredStoreOrder = append(registeredStoreOrder[:i], registeredStoreOrder[i+1:]...)
			break
		}
	}
	// Append to end (most recently used).
	registeredStoreOrder = append(registeredStoreOrder, key)
}

// evictRegisteredStoresIfNeeded evicts the least-recently-used dynamic stores
// if the total count of dynamic stores exceeds MaxRegisteredStores.
// Must be called with strategyStoreMu held.
func evictRegisteredStoresIfNeeded() {
	// Count dynamic stores (exclude startup stores).
	dynamicCount := 0
	for key := range registeredStores {
		if !startupStores[key] {
			dynamicCount++
		}
	}

	for dynamicCount > MaxRegisteredStores && len(registeredStoreOrder) > 0 {
		// Evict the oldest dynamic store.
		oldest := registeredStoreOrder[0]
		registeredStoreOrder = registeredStoreOrder[1:]

		if store, ok := registeredStores[oldest]; ok {
			store.Close()
			delete(registeredStores, oldest)
			dynamicCount--
		}
	}
}

// handleReloadInstance handles the epf_reload_instance tool.
// It forces a cache clear and reload for the given instance path.
func (s *Server) handleReloadInstance(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, err := request.RequireString("instance_path")
	if err != nil || instancePath == "" {
		return mcp.NewToolResultError("instance_path parameter is required"), nil
	}

	// Record pre-reload state
	cacheAge := getStrategyStoreAge(instancePath)
	wasLoaded := cacheAge > 0

	// Invalidate all caches
	s.invalidateInstanceCaches(instancePath)

	// Force a fresh load
	store, loadErr := s.resolveAndLoadStore(ctx, instancePath)

	result := map[string]interface{}{
		"instance_path":    instancePath,
		"cache_cleared":    true,
		"was_cached":       wasLoaded,
		"previous_age_sec": int(cacheAge.Seconds()),
	}

	if loadErr != nil {
		result["success"] = false
		result["reload_error"] = loadErr.Error()
		result["message"] = "Cache cleared, but reload failed. Strategy tools may not work until instance files are fixed."
	} else {
		result["success"] = true
		result["message"] = "Cache cleared and strategy data reloaded successfully."
		// Get model summary
		model := store.GetModel()
		if model != nil {
			summary := map[string]int{
				"features":     len(model.Features),
				"value_models": len(model.ValueModels),
			}
			if model.Roadmap != nil {
				okrCount := 0
				for _, track := range model.Roadmap.Tracks {
					okrCount += len(track.OKRs)
				}
				summary["okrs"] = okrCount
			}
			result["loaded_artifacts"] = summary
		}
	}

	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

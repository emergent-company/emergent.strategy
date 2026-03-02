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

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/strategy"
	"github.com/mark3labs/mcp-go/mcp"
)

// strategyStoreCacheEntry wraps a strategy store with mtime tracking for staleness detection.
type strategyStoreCacheEntry struct {
	store      strategy.StrategyStore
	loadedAt   time.Time
	fileMtimes map[string]time.Time
}

var (
	strategyStoreMu    sync.RWMutex
	strategyStoreCache = make(map[string]*strategyStoreCacheEntry)

	// registeredStores holds externally-created strategy stores (e.g., GitHub-backed).
	// These bypass mtime-based staleness detection since they manage their own caching
	// (e.g., via source.CachedSource TTL). Keys are synthetic paths like
	// "github://owner/repo/path" or real filesystem paths.
	registeredStores = make(map[string]strategy.StrategyStore)
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
// The key should be a unique identifier for the source — either a real filesystem
// path or a synthetic URI like "github://owner/repo/path".
func RegisterStrategyStore(key string, store strategy.StrategyStore) {
	strategyStoreMu.Lock()
	defer strategyStoreMu.Unlock()

	registeredStores[key] = store
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
	store, loadErr := getOrCreateStrategyStore(instancePath)

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

package source

import (
	"io/fs"
	"sync"
	"time"

	"golang.org/x/sync/singleflight"
)

// CachedSource wraps a Source with in-memory caching and request deduplication.
//
// Behavior:
//   - ReadFile, ReadDir, and Stat results are cached with a configurable TTL.
//   - Concurrent requests for the same key are deduplicated via Singleflight.
//   - On TTL expiry, the stale value is returned immediately and a background
//     goroutine refreshes the cache from the upstream source.
//   - Walk is delegated directly to the upstream source (not cached).
//   - Root is delegated directly to the upstream source.
//
// All methods are safe for concurrent use.
type CachedSource struct {
	upstream Source
	ttl      time.Duration
	now      func() time.Time // injectable clock for testing

	mu    sync.RWMutex
	items map[string]*cacheItem

	group singleflight.Group
}

// cacheItem holds a cached value with its expiry time.
type cacheItem struct {
	value     any
	err       error
	expiresAt time.Time
}

// CacheOption configures a CachedSource.
type CacheOption func(*CachedSource)

// WithTTL sets the cache time-to-live. Default is 5 minutes.
func WithTTL(ttl time.Duration) CacheOption {
	return func(c *CachedSource) {
		c.ttl = ttl
	}
}

// WithClock sets the time function used for expiry checks (for testing).
func WithClock(now func() time.Time) CacheOption {
	return func(c *CachedSource) {
		c.now = now
	}
}

// NewCachedSource creates a Source that caches results from upstream.
// Default TTL is 5 minutes.
func NewCachedSource(upstream Source, opts ...CacheOption) *CachedSource {
	c := &CachedSource{
		upstream: upstream,
		ttl:      5 * time.Minute,
		now:      time.Now,
		items:    make(map[string]*cacheItem),
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// get retrieves a cached value or fetches it from upstream.
// If the cached value is stale, it returns the stale value immediately
// and triggers a background refresh.
func (c *CachedSource) get(key string, fetch func() (any, error)) (any, error) {
	// Fast path: check for a valid cached value.
	c.mu.RLock()
	item, ok := c.items[key]
	c.mu.RUnlock()

	if ok {
		if c.now().Before(item.expiresAt) {
			// Fresh cache hit.
			return item.value, item.err
		}
		// Stale: return stale value, refresh in background.
		go c.refresh(key, fetch)
		return item.value, item.err
	}

	// Cache miss: fetch via singleflight.
	return c.fetchAndCache(key, fetch)
}

// fetchAndCache fetches a value through singleflight and caches the result.
func (c *CachedSource) fetchAndCache(key string, fetch func() (any, error)) (any, error) {
	v, err, _ := c.group.Do(key, func() (any, error) {
		val, fetchErr := fetch()
		c.mu.Lock()
		c.items[key] = &cacheItem{
			value:     val,
			err:       fetchErr,
			expiresAt: c.now().Add(c.ttl),
		}
		c.mu.Unlock()
		return val, fetchErr
	})
	return v, err
}

// refresh updates a cache entry in the background via singleflight.
func (c *CachedSource) refresh(key string, fetch func() (any, error)) {
	// Use singleflight to avoid duplicate background refreshes.
	c.group.Do(key, func() (any, error) { //nolint:errcheck
		val, fetchErr := fetch()
		c.mu.Lock()
		c.items[key] = &cacheItem{
			value:     val,
			err:       fetchErr,
			expiresAt: c.now().Add(c.ttl),
		}
		c.mu.Unlock()
		return val, fetchErr
	})
}

// ReadFile returns the contents of the named file, using the cache.
func (c *CachedSource) ReadFile(path string) ([]byte, error) {
	v, err := c.get("file:"+path, func() (any, error) {
		return c.upstream.ReadFile(path)
	})
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, nil
	}
	return v.([]byte), nil
}

// ReadDir returns the directory entries, using the cache.
func (c *CachedSource) ReadDir(path string) ([]fs.DirEntry, error) {
	v, err := c.get("dir:"+path, func() (any, error) {
		return c.upstream.ReadDir(path)
	})
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, nil
	}
	return v.([]fs.DirEntry), nil
}

// Stat returns file info for the named path, using the cache.
func (c *CachedSource) Stat(path string) (fs.FileInfo, error) {
	v, err := c.get("stat:"+path, func() (any, error) {
		return c.upstream.Stat(path)
	})
	if err != nil {
		return nil, err
	}
	if v == nil {
		return nil, nil
	}
	return v.(fs.FileInfo), nil
}

// Walk delegates directly to the upstream source. Walk results are not
// cached because they are typically one-off operations and the callback
// pattern does not lend itself to caching.
func (c *CachedSource) Walk(root string, fn fs.WalkDirFunc) error {
	return c.upstream.Walk(root, fn)
}

// Root returns the upstream source's root.
func (c *CachedSource) Root() string {
	return c.upstream.Root()
}

// Stats returns cache statistics for observability.
func (c *CachedSource) Stats() CacheStats {
	c.mu.RLock()
	defer c.mu.RUnlock()

	now := c.now()
	stats := CacheStats{
		TotalEntries: len(c.items),
	}
	for _, item := range c.items {
		if now.Before(item.expiresAt) {
			stats.FreshEntries++
		} else {
			stats.StaleEntries++
		}
	}
	return stats
}

// CacheStats provides observability into cache state.
type CacheStats struct {
	TotalEntries int
	FreshEntries int
	StaleEntries int
}

// Invalidate removes a specific key from the cache.
func (c *CachedSource) Invalidate(key string) {
	c.mu.Lock()
	delete(c.items, key)
	c.mu.Unlock()
}

// InvalidateAll clears the entire cache.
func (c *CachedSource) InvalidateAll() {
	c.mu.Lock()
	c.items = make(map[string]*cacheItem)
	c.mu.Unlock()
}

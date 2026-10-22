package github

import (
	"sync"
	"time"
)

const (
	// tokenRefreshMargin is how long before expiry a cached token stops being
	// served, so callers never receive one that expires mid-request.
	tokenRefreshMargin = 5 * time.Minute

	// notInstalledTTL bounds how long "the App is not installed on this owner"
	// is remembered. Kept short so a fresh installation is picked up quickly.
	notInstalledTTL = 30 * time.Second
)

type tokenEntry struct {
	token        string
	expiresAt    time.Time
	notInstalled error
}

// tokenCache holds GitHub App installation tokens keyed by owner. The zero
// value is ready to use.
type tokenCache struct {
	mu      sync.Mutex
	entries map[string]tokenEntry
}

// get returns a live entry for owner. notInstalled is non-nil for a cached
// negative result. ok is false when nothing usable is cached.
func (tc *tokenCache) get(owner string, now time.Time) (token string, notInstalled error, ok bool) {
	tc.mu.Lock()
	defer tc.mu.Unlock()

	e, found := tc.entries[owner]
	if !found || !now.Before(e.expiresAt) {
		return "", nil, false
	}
	return e.token, e.notInstalled, true
}

func (tc *tokenCache) put(owner, token string, expiresAt, now time.Time) {
	// A token that is already inside the refresh margin would never be served;
	// skip storing it rather than caching a dead entry.
	validUntil := expiresAt.Add(-tokenRefreshMargin)
	if !now.Before(validUntil) {
		return
	}
	tc.store(owner, tokenEntry{token: token, expiresAt: validUntil})
}

func (tc *tokenCache) putNotInstalled(owner string, err error, now time.Time) {
	tc.store(owner, tokenEntry{notInstalled: err, expiresAt: now.Add(notInstalledTTL)})
}

func (tc *tokenCache) store(owner string, e tokenEntry) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	if tc.entries == nil {
		tc.entries = make(map[string]tokenEntry)
	}
	tc.entries[owner] = e
}

func (tc *tokenCache) invalidate(owner string) {
	tc.mu.Lock()
	defer tc.mu.Unlock()
	delete(tc.entries, owner)
}

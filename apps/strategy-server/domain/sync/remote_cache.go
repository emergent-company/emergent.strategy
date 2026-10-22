package sync

import (
	"strings"
	gosync "sync"
	"time"
)

const (
	// headSHATTL bounds how stale a remote HEAD SHA served to the UI may be.
	headSHATTL = 45 * time.Second

	// defaultBranchTTL bounds how long a repo's default branch is remembered.
	// It changes rarely, and only by an explicit admin action on GitHub.
	defaultBranchTTL = 10 * time.Minute
)

type remoteCacheEntry struct {
	value   string
	expires time.Time
}

// remoteCache holds short-lived answers to read-only GitHub lookups that the
// web UI would otherwise repeat on every page render. The zero value is ready
// to use.
type remoteCache struct {
	mu       gosync.Mutex
	heads    map[string]remoteCacheEntry
	branches map[string]remoteCacheEntry

	// now is overridable for tests; nil means time.Now.
	now func() time.Time
}

func (rc *remoteCache) clock() time.Time {
	if rc.now != nil {
		return rc.now()
	}
	return time.Now()
}

func refKey(owner, repo, branch string) string {
	return owner + "/" + repo + "@" + branch
}

func repoKey(owner, repo string) string {
	return owner + "/" + repo
}

func lookup(m map[string]remoteCacheEntry, key string, now time.Time) (string, bool) {
	e, ok := m[key]
	if !ok || !now.Before(e.expires) {
		return "", false
	}
	return e.value, true
}

func (rc *remoteCache) headSHA(owner, repo, branch string) (string, bool) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	return lookup(rc.heads, refKey(owner, repo, branch), rc.clock())
}

func (rc *remoteCache) putHeadSHA(owner, repo, branch, sha string) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	if rc.heads == nil {
		rc.heads = make(map[string]remoteCacheEntry)
	}
	rc.heads[refKey(owner, repo, branch)] = remoteCacheEntry{value: sha, expires: rc.clock().Add(headSHATTL)}
}

func (rc *remoteCache) defaultBranch(owner, repo string) (string, bool) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	return lookup(rc.branches, repoKey(owner, repo), rc.clock())
}

func (rc *remoteCache) putDefaultBranch(owner, repo, branch string) {
	rc.mu.Lock()
	defer rc.mu.Unlock()
	if rc.branches == nil {
		rc.branches = make(map[string]remoteCacheEntry)
	}
	rc.branches[repoKey(owner, repo)] = remoteCacheEntry{value: branch, expires: rc.clock().Add(defaultBranchTTL)}
}

// invalidateRepo drops every cached HEAD SHA for the repo, across branches.
func (rc *remoteCache) invalidateRepo(owner, repo string) {
	prefix := repoKey(owner, repo) + "@"
	rc.mu.Lock()
	defer rc.mu.Unlock()
	for k := range rc.heads {
		if strings.HasPrefix(k, prefix) {
			delete(rc.heads, k)
		}
	}
}

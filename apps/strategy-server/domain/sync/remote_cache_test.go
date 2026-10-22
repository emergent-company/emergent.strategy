package sync

import (
	"testing"
	"time"
)

func TestRemoteCache_HeadSHA(t *testing.T) {
	now := time.Now()
	rc := &remoteCache{now: func() time.Time { return now }}

	if _, ok := rc.headSHA("o", "r", "main"); ok {
		t.Fatal("empty cache must miss")
	}

	rc.putHeadSHA("o", "r", "main", "abc")
	if got, ok := rc.headSHA("o", "r", "main"); !ok || got != "abc" {
		t.Fatalf("got %q ok=%v, want abc hit", got, ok)
	}
	if _, ok := rc.headSHA("o", "r", "dev"); ok {
		t.Error("other branch must not hit")
	}
	if _, ok := rc.headSHA("o", "other", "main"); ok {
		t.Error("other repo must not hit")
	}

	now = now.Add(headSHATTL - time.Second)
	if _, ok := rc.headSHA("o", "r", "main"); !ok {
		t.Error("entry should still be live just before the TTL")
	}
	now = now.Add(time.Second)
	if _, ok := rc.headSHA("o", "r", "main"); ok {
		t.Error("entry must expire at the TTL")
	}
}

func TestRemoteCache_InvalidateRepoClearsAllBranchesOnly(t *testing.T) {
	rc := &remoteCache{}
	rc.putHeadSHA("o", "r", "main", "a")
	rc.putHeadSHA("o", "r", "dev", "b")
	rc.putHeadSHA("o", "r2", "main", "c")
	rc.putDefaultBranch("o", "r", "main")

	rc.invalidateRepo("o", "r")

	if _, ok := rc.headSHA("o", "r", "main"); ok {
		t.Error("main should be invalidated")
	}
	if _, ok := rc.headSHA("o", "r", "dev"); ok {
		t.Error("dev should be invalidated")
	}
	if _, ok := rc.headSHA("o", "r2", "main"); !ok {
		t.Error("a repo whose name merely shares a prefix must survive")
	}
	if _, ok := rc.defaultBranch("o", "r"); !ok {
		t.Error("default branch is not tied to pushes and should survive")
	}
}

func TestRemoteCache_DefaultBranchTTL(t *testing.T) {
	now := time.Now()
	rc := &remoteCache{now: func() time.Time { return now }}

	rc.putDefaultBranch("o", "r", "trunk")
	if got, ok := rc.defaultBranch("o", "r"); !ok || got != "trunk" {
		t.Fatalf("got %q ok=%v", got, ok)
	}
	now = now.Add(defaultBranchTTL)
	if _, ok := rc.defaultBranch("o", "r"); ok {
		t.Error("default branch must expire at its TTL")
	}
}

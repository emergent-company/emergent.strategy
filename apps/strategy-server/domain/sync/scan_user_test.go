package sync_test

import (
	"errors"
	"testing"
	"time"

	syncdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

func twoRepos() []syncdom.RepoInfo {
	return []syncdom.RepoInfo{
		{Name: "alpha", FullName: "owner/alpha", DefaultBranch: "main"},
		{Name: "beta", FullName: "owner/beta", DefaultBranch: "main"},
	}
}

// Two users whose tokens begin with the same characters must not share a cached
// scan: the cache key used to be the first 16 characters of the token.
func TestScanCacheDoesNotMixTokensWithASharedPrefix(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = twoRepos()

	const prefix = "gho_0123456789ab" // 16 characters
	tokenA, tokenB := prefix+"AAAA", prefix+"BBBB"

	if _, err := svc.ScanUserRepos(newCtx(), tokenA); err != nil {
		t.Fatalf("scan: %v", err)
	}
	if !svc.GetCachedScanState(tokenA).Ready {
		t.Fatal("the scan of the first token is not cached for it")
	}
	if svc.GetCachedScanState(tokenB).Ready {
		t.Error("a token that shares a 16-character prefix reads another user's cached scan")
	}
}

// A new token (the user authorized again) never reads the scan of the old one.
func TestScanCacheIsKeyedByTheWholeToken(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = twoRepos()
	if _, err := svc.ScanUserRepos(newCtx(), "gho_old_token_value_1"); err != nil {
		t.Fatal(err)
	}
	if svc.GetCachedScanState("gho_old_token_value_2").Ready {
		t.Error("a different token read the cached scan")
	}
}

func TestInvalidateUserScanClearsOnlyThatToken(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = twoRepos()
	for _, tok := range []string{"gho_token_for_user_one", "gho_token_for_user_two"} {
		if _, err := svc.ScanUserRepos(newCtx(), tok); err != nil {
			t.Fatal(err)
		}
	}
	svc.InvalidateUserScan("gho_token_for_user_one")
	if svc.GetCachedScanState("gho_token_for_user_one").Ready {
		t.Error("the invalidated scan is still cached")
	}
	if !svc.GetCachedScanState("gho_token_for_user_two").Ready {
		t.Error("invalidating one token cleared another user's scan")
	}
}

func TestScanReportsARevokedToken(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.userReposErr = &syncdom.TokenRevokedError{}

	state := svc.StartScanUserRepos(newCtx(), "gho_revoked_token_value")
	var revoked *syncdom.TokenRevokedError
	if !state.Ready || !errors.As(state.Err, &revoked) {
		t.Fatalf("state = %+v, want a ready state with a TokenRevokedError", state)
	}
	cached := svc.GetCachedScanState("gho_revoked_token_value")
	if !errors.As(cached.Err, &revoked) {
		t.Errorf("the cached state lost the revoked-token error: %+v", cached)
	}
}

// A listing that could not read every organisation still returns what it read, and
// says that it is incomplete, in the quick results and in the full ones.
func TestScanReportsAnIncompleteList(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = twoRepos()
	reader.userReposErr = &syncdom.PartialResultError{Orgs: []string{"broken-org"}}

	quick := svc.StartScanUserRepos(newCtx(), "gho_partial_token_value")
	if quick.Err != nil || len(quick.Results) != 2 || !quick.Incomplete {
		t.Fatalf("quick state = %+v, want 2 results, no error, Incomplete", quick)
	}

	// The full scan runs in the background; wait for it to replace the quick results.
	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		if st := svc.GetCachedScanState("gho_partial_token_value"); st.Ready && !st.Partial {
			if st.Err != nil || len(st.Results) != 2 || !st.Incomplete {
				t.Fatalf("full state = %+v, want 2 results, no error, Incomplete", st)
			}
			return
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("the full scan did not finish")
}

func TestScanOfACompleteListIsNotMarkedIncomplete(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = twoRepos()
	quick := svc.StartScanUserRepos(newCtx(), "gho_complete_token_value")
	if quick.Incomplete {
		t.Error("a complete list is marked incomplete")
	}
}

func mixedOwners() []syncdom.RepoInfo {
	return []syncdom.RepoInfo{
		{Name: "a1", FullName: "acme/a1", DefaultBranch: "main"},
		{Name: "a2", FullName: "acme/a2", DefaultBranch: "main"},
		{Name: "z1", FullName: "zeta/z1", DefaultBranch: "main"},
	}
}

// Scanning one owner lists with the caller's own token, keeps only that owner's
// repositories, and runs EPF detection only for them.
func TestScanUserOwnerReposKeepsOnlyThatOwnerAndDetectsOnlyThere(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = mixedOwners()

	results, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_1", "ACME")
	if err != nil {
		t.Fatalf("scan: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("results = %d, want the 2 repositories of acme (the owner is matched ignoring case)", len(results))
	}
	for _, r := range results {
		if r.Owner != "acme" {
			t.Errorf("a repository of %q was returned", r.Owner)
		}
	}
	if got := reader.detectCalls.Load(); got != 2 {
		t.Errorf("EPF detection ran %d times, want 2 (only for acme's repositories)", got)
	}
}

func TestScanUserOwnerReposOfAnUnseenOwnerIsEmpty(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = mixedOwners()
	results, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_2", "not-visible")
	if err != nil || len(results) != 0 {
		t.Errorf("results=%d err=%v, want none and no error", len(results), err)
	}
	if reader.detectCalls.Load() != 0 {
		t.Error("detection ran for an owner the token cannot see")
	}
}

func TestScanUserOwnerReposIsCachedPerTokenAndOwner(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.repos = mixedOwners()

	if _, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_3", "acme"); err != nil {
		t.Fatal(err)
	}
	first := reader.detectCalls.Load()
	if _, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_3", "acme"); err != nil {
		t.Fatal(err)
	}
	if reader.detectCalls.Load() != first {
		t.Error("the second scan for the same token and owner ran detection again")
	}
	// Another token must not read it.
	if _, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_4", "acme"); err != nil {
		t.Fatal(err)
	}
	if reader.detectCalls.Load() == first {
		t.Error("another token was served the first token's cached scan")
	}
}

func TestScanUserOwnerReposReportsARevokedToken(t *testing.T) {
	db := database.TestDB(t)
	svc, reader := newScanTestService(t, db)
	reader.userReposErr = &syncdom.TokenRevokedError{}
	_, err := svc.ScanUserOwnerRepos(newCtx(), "gho_owner_scan_token_5", "acme")
	var revoked *syncdom.TokenRevokedError
	if !errors.As(err, &revoked) {
		t.Errorf("err = %v, want a TokenRevokedError", err)
	}
}

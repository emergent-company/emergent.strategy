package github

import (
	"context"
	"net/http"
	"sync/atomic"
	"testing"
	"time"

	gh "github.com/google/go-github/v68/github"
)

type installHits struct {
	find, create atomic.Int32
}

// installationMux serves one org installation and counts calls. expiresAt is
// what the mocked token endpoint reports. A nil installed owner list means the
// App is not installed anywhere (404 for both org and user lookups).
func installationMux(hits *installHits, installedOrg string, expiresAt time.Time) *http.ServeMux {
	mux := http.NewServeMux()
	mux.HandleFunc("/orgs/", func(w http.ResponseWriter, r *http.Request) {
		hits.find.Add(1)
		if installedOrg != "" && r.URL.Path == "/orgs/"+installedOrg+"/installation" {
			writeJSON(w, gh.Installation{ID: gh.Ptr(int64(42))})
			return
		}
		http.NotFound(w, r)
	})
	mux.HandleFunc("/users/", func(w http.ResponseWriter, r *http.Request) {
		hits.find.Add(1)
		http.NotFound(w, r)
	})
	mux.HandleFunc("/app/installations/42/access_tokens", func(w http.ResponseWriter, _ *http.Request) {
		hits.create.Add(1)
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]any{
			"token":      "ghs_cached",
			"expires_at": expiresAt.UTC().Format(time.RFC3339),
		})
	})
	return mux
}

func TestGetInstallationToken_CachesPerOwner(t *testing.T) {
	var hits installHits
	c, _ := newTestClient(t, installationMux(&hits, "myorg", time.Now().Add(time.Hour)))
	ctx := context.Background()

	for i := range 3 {
		tok, err := c.GetInstallationToken(ctx, "myorg")
		if err != nil {
			t.Fatalf("call %d: %v", i, err)
		}
		if tok != "ghs_cached" {
			t.Fatalf("call %d: token=%q", i, tok)
		}
	}
	if got := hits.find.Load(); got != 1 {
		t.Errorf("installation lookups=%d, want 1", got)
	}
	if got := hits.create.Load(); got != 1 {
		t.Errorf("token creations=%d, want 1", got)
	}
}

func TestGetInstallationToken_NearExpiryIsNotCached(t *testing.T) {
	var hits installHits
	// Inside the refresh margin: serving it from cache could hand out a token
	// that expires mid-request.
	c, _ := newTestClient(t, installationMux(&hits, "myorg", time.Now().Add(time.Minute)))
	ctx := context.Background()

	for range 2 {
		if _, err := c.GetInstallationToken(ctx, "myorg"); err != nil {
			t.Fatal(err)
		}
	}
	if got := hits.create.Load(); got != 2 {
		t.Errorf("token creations=%d, want 2 (no caching near expiry)", got)
	}
}

func TestGetInstallationToken_CachesNotInstalled(t *testing.T) {
	var hits installHits
	c, _ := newTestClient(t, installationMux(&hits, "", time.Now().Add(time.Hour)))
	ctx := context.Background()

	first, err := c.GetInstallationToken(ctx, "ghost-org")
	if err == nil {
		t.Fatal("expected error for owner without installation")
	}
	afterFirst := hits.find.Load()
	if afterFirst == 0 {
		t.Fatal("expected the first call to look up the installation")
	}

	second, err2 := c.GetInstallationToken(ctx, "ghost-org")
	if err2 == nil {
		t.Fatal("expected cached error on second call")
	}
	if first != "" || second != "" {
		t.Errorf("tokens must be empty on error, got %q / %q", first, second)
	}
	if got := hits.find.Load(); got != afterFirst {
		t.Errorf("second call made %d extra lookups, want 0", got-afterFirst)
	}
}

func TestGetInstallationToken_InvalidateForcesRefetch(t *testing.T) {
	var hits installHits
	c, _ := newTestClient(t, installationMux(&hits, "myorg", time.Now().Add(time.Hour)))
	ctx := context.Background()

	if _, err := c.GetInstallationToken(ctx, "myorg"); err != nil {
		t.Fatal(err)
	}
	c.InvalidateInstallationToken("myorg")
	if _, err := c.GetInstallationToken(ctx, "myorg"); err != nil {
		t.Fatal(err)
	}
	if got := hits.create.Load(); got != 2 {
		t.Errorf("token creations=%d, want 2 after invalidate", got)
	}
}

func TestTokenCache_Expiry(t *testing.T) {
	var tc tokenCache
	now := time.Now()

	tc.put("o", "tok", now.Add(time.Hour), now)
	if _, _, ok := tc.get("o", now.Add(time.Hour-tokenRefreshMargin-time.Second)); !ok {
		t.Error("token should be served until the refresh margin")
	}
	if _, _, ok := tc.get("o", now.Add(time.Hour-tokenRefreshMargin)); ok {
		t.Error("token must not be served inside the refresh margin")
	}

	tc.putNotInstalled("n", http.ErrNotSupported, now)
	if _, nerr, ok := tc.get("n", now.Add(notInstalledTTL-time.Second)); !ok || nerr == nil {
		t.Error("negative entry should be served within its TTL")
	}
	if _, _, ok := tc.get("n", now.Add(notInstalledTTL)); ok {
		t.Error("negative entry must expire after its TTL")
	}
}

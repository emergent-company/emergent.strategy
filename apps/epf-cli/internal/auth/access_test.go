package auth

import (
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

// --- AccessChecker tests ---

func TestAccessChecker_CanAccess_Allowed(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer test-token" {
			t.Errorf("expected Bearer test-token, got %s", r.Header.Get("Authorization"))
		}
		if r.URL.Path != "/repos/myorg/myrepo" {
			t.Errorf("unexpected path: %s", r.URL.Path)
		}
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123,"full_name":"myorg/myrepo"}`))
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	allowed, err := ac.CanAccess(42, "myorg", "myrepo", "test-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !allowed {
		t.Error("expected access to be allowed")
	}
}

func TestAccessChecker_CanAccess_Denied404(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	allowed, err := ac.CanAccess(42, "myorg", "private-repo", "test-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Error("expected access to be denied")
	}
}

func TestAccessChecker_CanAccess_Denied403(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	allowed, err := ac.CanAccess(42, "myorg", "forbidden-repo", "test-token")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if allowed {
		t.Error("expected access to be denied")
	}
}

func TestAccessChecker_CanAccess_InvalidToken(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	_, err := ac.CanAccess(42, "myorg", "myrepo", "bad-token")
	if err == nil {
		t.Fatal("expected error for unauthorized token")
	}
}

func TestAccessChecker_CanAccess_RateLimit(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusTooManyRequests)
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	_, err := ac.CanAccess(42, "myorg", "myrepo", "test-token")
	if err == nil {
		t.Fatal("expected error for rate limit")
	}
}

func TestAccessChecker_CacheHit(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123}`))
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)

	// First call — should hit the API.
	allowed, err := ac.CanAccess(42, "myorg", "myrepo", "test-token")
	if err != nil || !allowed {
		t.Fatalf("first call: err=%v, allowed=%v", err, allowed)
	}

	// Second call — should use cache, not API.
	allowed, err = ac.CanAccess(42, "myorg", "myrepo", "test-token")
	if err != nil || !allowed {
		t.Fatalf("second call: err=%v, allowed=%v", err, allowed)
	}

	if atomic.LoadInt32(&callCount) != 1 {
		t.Errorf("expected 1 API call, got %d", callCount)
	}
}

func TestAccessChecker_CacheExpiry(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123}`))
	}))
	defer srv.Close()

	now := time.Now()
	ac := newTestAccessChecker(srv)
	ac.nowFunc = func() time.Time { return now }

	// First call.
	ac.CanAccess(42, "myorg", "myrepo", "test-token")

	// Advance time past TTL.
	now = now.Add(6 * time.Minute)

	// Second call — cache expired, should hit API again.
	ac.CanAccess(42, "myorg", "myrepo", "test-token")

	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("expected 2 API calls (cache expired), got %d", callCount)
	}
}

func TestAccessChecker_DifferentUsers(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123}`))
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)

	// User 1 checks access.
	ac.CanAccess(1, "myorg", "myrepo", "token-1")
	// User 2 checks access — separate cache entry.
	ac.CanAccess(2, "myorg", "myrepo", "token-2")

	if atomic.LoadInt32(&callCount) != 2 {
		t.Errorf("expected 2 API calls (different users), got %d", callCount)
	}
}

func TestAccessChecker_DeniedResultCached(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(http.StatusNotFound)
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)

	// First call — denied.
	allowed, _ := ac.CanAccess(42, "myorg", "private", "token")
	if allowed {
		t.Error("expected denied")
	}

	// Second call — should use cached "denied" result.
	allowed, _ = ac.CanAccess(42, "myorg", "private", "token")
	if allowed {
		t.Error("expected denied (cached)")
	}

	if atomic.LoadInt32(&callCount) != 1 {
		t.Errorf("expected 1 API call (denied cached), got %d", callCount)
	}
}

func TestAccessChecker_InvalidateUser(t *testing.T) {
	var callCount int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&callCount, 1)
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123}`))
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)
	ac.CanAccess(42, "myorg", "myrepo", "token")

	if ac.CacheSize() != 1 {
		t.Errorf("expected cache size 1, got %d", ac.CacheSize())
	}

	ac.InvalidateUser(42)

	if ac.CacheSize() != 0 {
		t.Errorf("expected cache size 0 after invalidation, got %d", ac.CacheSize())
	}
}

func TestAccessChecker_InvalidateRepo(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"id":123}`))
	}))
	defer srv.Close()

	ac := newTestAccessChecker(srv)

	// Two users access the same repo.
	ac.CanAccess(1, "myorg", "myrepo", "token-1")
	ac.CanAccess(2, "myorg", "myrepo", "token-2")
	// One user accesses a different repo.
	ac.CanAccess(1, "myorg", "other-repo", "token-1")

	if ac.CacheSize() != 3 {
		t.Errorf("expected cache size 3, got %d", ac.CacheSize())
	}

	ac.InvalidateRepo("myorg", "myrepo")

	if ac.CacheSize() != 1 {
		t.Errorf("expected cache size 1 after repo invalidation, got %d", ac.CacheSize())
	}
}

// --- ParseInstancePath tests ---

func TestParseInstancePath(t *testing.T) {
	tests := []struct {
		input    string
		owner    string
		repo     string
		subpath  string
		isRemote bool
	}{
		// Remote paths.
		{"myorg/myrepo", "myorg", "myrepo", "", true},
		{"owner/repo/path/to/instance", "owner", "repo", "path/to/instance", true},
		{"owner/repo/sub", "owner", "repo", "sub", true},
		{"github://owner/repo", "owner", "repo", "", true},
		{"github://owner/repo/docs/EPF", "owner", "repo", "docs/EPF", true},

		// Local paths.
		{"/absolute/path", "", "", "", false},
		{"./relative/path", "", "", "", false},
		{"../parent/path", "", "", "", false},
		{`C:\windows\path`, "", "", "", false},
		{"", "", "", "", false},

		// Edge cases.
		{"just-a-name", "", "", "", false},  // No slash — not a repo ref.
		{"trailing/", "", "", "", false},    // Trailing slash, empty repo.
		{"/leading", "", "", "", false},     // Leading slash — absolute.
		{".hidden/repo", "", "", "", false}, // Starts with dot.
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			owner, repo, subpath, isRemote := ParseInstancePath(tt.input)
			if owner != tt.owner || repo != tt.repo || subpath != tt.subpath || isRemote != tt.isRemote {
				t.Errorf("ParseInstancePath(%q) = (%q, %q, %q, %v), want (%q, %q, %q, %v)",
					tt.input, owner, repo, subpath, isRemote,
					tt.owner, tt.repo, tt.subpath, tt.isRemote)
			}
		})
	}
}

// --- helpers ---

// newTestAccessChecker creates an AccessChecker that points at a test server.
func newTestAccessChecker(srv *httptest.Server) *AccessChecker {
	ac := NewAccessChecker(
		WithAccessCheckHTTPClient(srv.Client()),
	)
	// Override the GitHub API URL by replacing checkGitHubAccess.
	// We can't easily change the URL, so we use a custom HTTP transport
	// that redirects api.github.com to the test server.
	ac.client = &http.Client{
		Timeout:   10 * time.Second,
		Transport: &testTransport{srv: srv},
	}
	return ac
}

// testTransport redirects api.github.com requests to the test server.
type testTransport struct {
	srv *httptest.Server
}

func (t *testTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Rewrite the URL to point at our test server.
	req.URL.Scheme = "http"
	req.URL.Host = t.srv.Listener.Addr().String()
	return http.DefaultTransport.RoundTrip(req)
}

// Package github_test verifies the GitHub App client using httptest mock servers
// (task 3.2.8). These are unit tests — no real GitHub API is called.
package github

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	gh "github.com/google/go-github/v68/github"
)

// newTestClient generates a throw-away RSA key and an httptest server whose
// base URL is injected via a custom http.Client transport.
func newTestClient(t *testing.T, mux *http.ServeMux) (*Client, *httptest.Server) {
	t.Helper()

	srv := httptest.NewServer(mux)
	t.Cleanup(srv.Close)

	// Redirect all go-github API calls to the test server.
	transport := &redirectTransport{base: srv.URL}
	httpClient := &http.Client{Transport: transport}

	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate rsa key: %v", err)
	}

	c := newClientFromKey(1234, key, httpClient)
	return c, srv
}

// redirectTransport rewrites the host of every request to point at the test server.
type redirectTransport struct {
	base string // e.g. "http://127.0.0.1:12345"
}

func (rt *redirectTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req2 := req.Clone(req.Context())
	req2.URL.Scheme = "http"
	req2.URL.Host = req.URL.Host // kept as-is; overridden below
	// Replace the scheme+host entirely with the test server URL.
	req2.URL.Host = req.URL.Host
	// Build a new URL rooted at the test server.
	target := rt.base + req.URL.RequestURI()
	parsed, err := req.URL.Parse(target)
	if err != nil {
		return nil, err
	}
	req2.URL = parsed
	req2.Host = parsed.Host
	return http.DefaultTransport.RoundTrip(req2)
}

func writeJSON(w http.ResponseWriter, v any) {
	w.Header().Set("Content-Type", "application/json")
	_ = json.NewEncoder(w).Encode(v)
}

// ---------------------------------------------------------------------------
// ParseRepoSlug
// ---------------------------------------------------------------------------

func TestParseRepoSlug(t *testing.T) {
	cases := []struct {
		slug      string
		wantOwner string
		wantRepo  string
		wantErr   bool
	}{
		{"owner/repo", "owner", "repo", false},
		{"org-name/my-repo", "org-name", "my-repo", false},
		{"invalid", "", "", true},
		{"", "", "", true},
		{"/repo", "", "", true},
		{"owner/", "", "", true},
	}

	for _, tc := range cases {
		owner, repo, err := ParseRepoSlug(tc.slug)
		if (err != nil) != tc.wantErr {
			t.Errorf("ParseRepoSlug(%q): err=%v, wantErr=%v", tc.slug, err, tc.wantErr)
			continue
		}
		if !tc.wantErr {
			if owner != tc.wantOwner {
				t.Errorf("ParseRepoSlug(%q): owner=%q, want %q", tc.slug, owner, tc.wantOwner)
			}
			if repo != tc.wantRepo {
				t.Errorf("ParseRepoSlug(%q): repo=%q, want %q", tc.slug, repo, tc.wantRepo)
			}
		}
	}
}

// ---------------------------------------------------------------------------
// GetDefaultBranch
// ---------------------------------------------------------------------------

func TestGetDefaultBranch(t *testing.T) {
	mux := http.NewServeMux()

	// GET /repos/owner/repo → return default_branch
	mux.HandleFunc("/repos/owner/repo", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"id":             1,
			"name":           "repo",
			"default_branch": "main",
		})
	})

	c, _ := newTestClient(t, mux)
	ctx := context.Background()

	branch, err := c.GetDefaultBranch(ctx, "tok", "owner", "repo")
	if err != nil {
		t.Fatalf("GetDefaultBranch: %v", err)
	}
	if branch != "main" {
		t.Errorf("branch=%q, want main", branch)
	}
}

// ---------------------------------------------------------------------------
// CreateBranch
// ---------------------------------------------------------------------------

func TestCreateBranch(t *testing.T) {
	mux := http.NewServeMux()

	// GET base branch ref
	mux.HandleFunc("/repos/owner/repo/git/ref/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"ref": "refs/heads/main",
			"object": map[string]any{
				"sha":  "abc123",
				"type": "commit",
			},
		})
	})

	// POST create ref
	created := false
	mux.HandleFunc("/repos/owner/repo/git/refs", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPost {
			created = true
			w.WriteHeader(http.StatusCreated)
			writeJSON(w, map[string]any{
				"ref": "refs/heads/strategy-sync/test",
				"object": map[string]any{
					"sha":  "abc123",
					"type": "commit",
				},
			})
		}
	})

	c, _ := newTestClient(t, mux)
	ctx := context.Background()

	err := c.CreateBranch(ctx, "tok", "owner", "repo", "main", "strategy-sync/test")
	if err != nil {
		t.Fatalf("CreateBranch: %v", err)
	}
	if !created {
		t.Error("expected POST /repos/owner/repo/git/refs to be called")
	}
}

// ---------------------------------------------------------------------------
// CommitFiles
// ---------------------------------------------------------------------------

func TestCommitFiles(t *testing.T) {
	mux := http.NewServeMux()

	// GET branch ref
	mux.HandleFunc("/repos/owner/repo/git/ref/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"ref":    "refs/heads/strategy-sync/test",
			"object": map[string]any{"sha": "branchsha", "type": "commit"},
		})
	})

	// GET parent commit
	mux.HandleFunc("/repos/owner/repo/git/commits/branchsha", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"sha":  "branchsha",
			"tree": map[string]any{"sha": "treesha"},
		})
	})

	// POST create tree
	mux.HandleFunc("/repos/owner/repo/git/trees", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{"sha": "newtreesha"})
	})

	// POST create commit
	mux.HandleFunc("/repos/owner/repo/git/commits", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"sha":     "newcommitsha",
			"message": "test commit",
			"tree":    map[string]any{"sha": "newtreesha"},
		})
	})

	// PATCH update ref
	patched := false
	mux.HandleFunc("/repos/owner/repo/git/refs/", func(w http.ResponseWriter, r *http.Request) {
		if r.Method == http.MethodPatch {
			patched = true
			writeJSON(w, map[string]any{
				"ref":    "refs/heads/strategy-sync/test",
				"object": map[string]any{"sha": "newcommitsha"},
			})
		}
	})

	c, _ := newTestClient(t, mux)
	ctx := context.Background()

	files := []FileEntry{
		{Path: "FIRE/features/fd-001.yaml", Content: "name: Test Feature\n"},
	}
	err := c.CommitFiles(ctx, "tok", "owner", "repo", "strategy-sync/test", files, "chore: sync strategy artifacts")
	if err != nil {
		t.Fatalf("CommitFiles: %v", err)
	}
	if !patched {
		t.Error("expected PATCH on branch ref to update it")
	}
}

// ---------------------------------------------------------------------------
// CreatePullRequest
// ---------------------------------------------------------------------------

func TestCreatePullRequest(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/repos/owner/repo/pulls", func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			t.Errorf("unexpected method: %s", r.Method)
		}
		w.WriteHeader(http.StatusCreated)
		writeJSON(w, map[string]any{
			"number":   99,
			"html_url": "https://github.com/owner/repo/pull/99",
			"title":    "Strategy sync",
		})
	})

	c, _ := newTestClient(t, mux)
	ctx := context.Background()

	result, err := c.CreatePullRequest(ctx, "tok", "owner", "repo",
		"strategy-sync/test", "main", "Strategy sync", "Auto-generated by Emergent")
	if err != nil {
		t.Fatalf("CreatePullRequest: %v", err)
	}
	if result.Number != 99 {
		t.Errorf("pr.Number=%d, want 99", result.Number)
	}
	if result.URL != "https://github.com/owner/repo/pull/99" {
		t.Errorf("pr.URL=%q unexpected", result.URL)
	}
}

// ---------------------------------------------------------------------------
// GetInstallationToken
// ---------------------------------------------------------------------------

func TestGetInstallationToken(t *testing.T) {
	mux := http.NewServeMux()

	// GET app installation for org
	mux.HandleFunc("/orgs/myorg/installation", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, gh.Installation{
			ID: gh.Ptr(int64(42)),
		})
	})

	// POST create installation token
	mux.HandleFunc("/app/installations/42/access_tokens", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"token":      "ghs_testtoken",
			"expires_at": "2099-01-01T00:00:00Z",
		})
	})

	c, _ := newTestClient(t, mux)
	ctx := context.Background()

	token, err := c.GetInstallationToken(ctx, "myorg")
	if err != nil {
		t.Fatalf("GetInstallationToken: %v", err)
	}
	if token != "ghs_testtoken" {
		t.Errorf("token=%q, want ghs_testtoken", token)
	}
}

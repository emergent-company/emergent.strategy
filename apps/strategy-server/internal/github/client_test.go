// Package github_test verifies the GitHub App client using httptest mock servers
// (task 3.2.8). These are unit tests — no real GitHub API is called.
package github

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"encoding/json"
	"fmt"
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
// GetHeadCommitSHA
// ---------------------------------------------------------------------------

func TestGetHeadCommitSHA(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/repos/owner/repo/git/ref/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"ref": "refs/heads/main",
			"object": map[string]any{
				"sha":  "deadbeef1234567890abcdef",
				"type": "commit",
			},
		})
	})

	c, _ := newTestClient(t, mux)
	sha, err := c.GetHeadCommitSHA(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("GetHeadCommitSHA: %v", err)
	}
	if sha != "deadbeef1234567890abcdef" {
		t.Errorf("sha=%q, want deadbeef1234567890abcdef", sha)
	}
}

// ---------------------------------------------------------------------------
// GetTree
// ---------------------------------------------------------------------------

func TestGetTree(t *testing.T) {
	mux := http.NewServeMux()

	// Ref for the branch
	mux.HandleFunc("/repos/owner/repo/git/ref/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"ref":    "refs/heads/main",
			"object": map[string]any{"sha": "commitsha123", "type": "commit"},
		})
	})

	// Commit → tree SHA
	mux.HandleFunc("/repos/owner/repo/git/commits/commitsha123", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"sha":  "commitsha123",
			"tree": map[string]any{"sha": "treesha456"},
		})
	})

	// Tree → entries
	mux.HandleFunc("/repos/owner/repo/git/trees/treesha456", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"sha": "treesha456",
			"tree": []map[string]any{
				{"path": "docs/epf/READY/north_star.yaml", "type": "blob", "sha": "blobsha1", "size": 500},
				{"path": "docs/epf/FIRE/definitions", "type": "tree", "sha": "subtreesha"},
				{"path": "docs/epf/FIRE/features/fd-001.yaml", "type": "blob", "sha": "blobsha2", "size": 1200},
			},
		})
	})

	c, _ := newTestClient(t, mux)
	entries, err := c.GetTree(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("GetTree: %v", err)
	}
	if len(entries) != 3 {
		t.Fatalf("want 3 entries, got %d", len(entries))
	}
	if entries[0].Path != "docs/epf/READY/north_star.yaml" {
		t.Errorf("entry[0].Path=%q", entries[0].Path)
	}
	if entries[0].Type != "blob" {
		t.Errorf("entry[0].Type=%q, want blob", entries[0].Type)
	}
}

// ---------------------------------------------------------------------------
// GetPullRequestState
// ---------------------------------------------------------------------------

func TestGetPullRequestState(t *testing.T) {
	tests := []struct {
		name      string
		prPayload map[string]any
		wantState string
	}{
		{
			name:      "open PR",
			prPayload: map[string]any{"number": 1, "state": "open", "merged": false},
			wantState: "open",
		},
		{
			name:      "closed PR",
			prPayload: map[string]any{"number": 2, "state": "closed", "merged": false},
			wantState: "closed",
		},
		{
			name:      "merged PR",
			prPayload: map[string]any{"number": 3, "state": "closed", "merged": true},
			wantState: "merged",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			mux := http.NewServeMux()
			prNum := int(tc.prPayload["number"].(int))
			mux.HandleFunc(fmt.Sprintf("/repos/owner/repo/pulls/%d", prNum), func(w http.ResponseWriter, r *http.Request) {
				writeJSON(w, tc.prPayload)
			})

			c, _ := newTestClient(t, mux)
			state, err := c.GetPullRequestState(context.Background(), "tok", "owner", "repo", prNum)
			if err != nil {
				t.Fatalf("GetPullRequestState: %v", err)
			}
			if state != tc.wantState {
				t.Errorf("state=%q, want %q", state, tc.wantState)
			}
		})
	}
}

// ---------------------------------------------------------------------------
// ListInstallations
// ---------------------------------------------------------------------------

func TestListInstallations(t *testing.T) {
	mux := http.NewServeMux()

	// GET /app/installations — return two installations.
	mux.HandleFunc("/app/installations", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []map[string]any{
			{
				"id":       101,
				"html_url": "https://github.com/organizations/acme-corp/settings/installations/101",
				"account": map[string]any{
					"login": "acme-corp",
					"type":  "Organization",
				},
			},
			{
				"id":       202,
				"html_url": "https://github.com/settings/installations/202",
				"account": map[string]any{
					"login": "nikolai",
					"type":  "User",
				},
			},
		})
	})

	c, _ := newTestClient(t, mux)
	installs, err := c.ListInstallations(context.Background())
	if err != nil {
		t.Fatalf("ListInstallations: %v", err)
	}
	if len(installs) != 2 {
		t.Fatalf("want 2 installations, got %d", len(installs))
	}
	if installs[0].OwnerLogin != "acme-corp" {
		t.Errorf("installs[0].OwnerLogin=%q, want acme-corp", installs[0].OwnerLogin)
	}
	if installs[0].OwnerType != "Organization" {
		t.Errorf("installs[0].OwnerType=%q, want Organization", installs[0].OwnerType)
	}
	if installs[1].OwnerLogin != "nikolai" {
		t.Errorf("installs[1].OwnerLogin=%q, want nikolai", installs[1].OwnerLogin)
	}
	if installs[1].OwnerType != "User" {
		t.Errorf("installs[1].OwnerType=%q, want User", installs[1].OwnerType)
	}
}

func TestListUserInstallations(t *testing.T) {
	mux := http.NewServeMux()

	// GET /user/installations — called with user token (not App JWT)
	mux.HandleFunc("/user/installations", func(w http.ResponseWriter, r *http.Request) {
		// Verify it's using a Bearer token (user token, not App JWT)
		auth := r.Header.Get("Authorization")
		if auth == "" {
			t.Error("expected Authorization header")
		}
		writeJSON(w, map[string]any{
			"total_count": 2,
			"installations": []map[string]any{
				{
					"id":       201,
					"html_url": "https://github.com/organizations/emergent-company/settings/installations/201",
					"account": map[string]any{
						"login": "emergent-company",
						"type":  "Organization",
					},
				},
				{
					"id":       202,
					"html_url": "https://github.com/settings/installations/202",
					"account": map[string]any{
						"login": "nikolaifasting",
						"type":  "User",
					},
				},
			},
		})
	})

	c, _ := newTestClient(t, mux)
	installs, err := c.ListUserInstallations(context.Background(), "gho_usertoken")
	if err != nil {
		t.Fatalf("ListUserInstallations: %v", err)
	}
	if len(installs) != 2 {
		t.Fatalf("want 2 installations, got %d", len(installs))
	}
	if installs[0].OwnerLogin != "emergent-company" {
		t.Errorf("installs[0].OwnerLogin=%q, want emergent-company", installs[0].OwnerLogin)
	}
	if installs[1].OwnerLogin != "nikolaifasting" {
		t.Errorf("installs[1].OwnerLogin=%q, want nikolaifasting", installs[1].OwnerLogin)
	}
}

func TestListInstallationsEmpty(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/app/installations", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, []map[string]any{})
	})

	c, _ := newTestClient(t, mux)
	installs, err := c.ListInstallations(context.Background())
	if err != nil {
		t.Fatalf("ListInstallations: %v", err)
	}
	if len(installs) != 0 {
		t.Errorf("want 0 installations, got %d", len(installs))
	}
}

// ---------------------------------------------------------------------------
// ListInstallationRepos
// ---------------------------------------------------------------------------

func TestListInstallationRepos(t *testing.T) {
	mux := http.NewServeMux()

	mux.HandleFunc("/installation/repositories", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"total_count": 2,
			"repositories": []map[string]any{
				{
					"name":           "strategy",
					"full_name":      "acme-corp/strategy",
					"html_url":       "https://github.com/acme-corp/strategy",
					"default_branch": "main",
					"private":        false,
				},
				{
					"name":           "client-a-epf",
					"full_name":      "acme-corp/client-a-epf",
					"html_url":       "https://github.com/acme-corp/client-a-epf",
					"default_branch": "dev",
					"private":        true,
				},
			},
		})
	})

	c, _ := newTestClient(t, mux)
	repos, err := c.ListInstallationRepos(context.Background(), "tok")
	if err != nil {
		t.Fatalf("ListInstallationRepos: %v", err)
	}
	if len(repos) != 2 {
		t.Fatalf("want 2 repos, got %d", len(repos))
	}
	if repos[0].FullName != "acme-corp/strategy" {
		t.Errorf("repos[0].FullName=%q", repos[0].FullName)
	}
	if repos[0].Private {
		t.Error("repos[0].Private should be false")
	}
	if repos[1].DefaultBranch != "dev" {
		t.Errorf("repos[1].DefaultBranch=%q, want dev", repos[1].DefaultBranch)
	}
	if !repos[1].Private {
		t.Error("repos[1].Private should be true")
	}
}

// ---------------------------------------------------------------------------
// DetectEPFInRepo
// ---------------------------------------------------------------------------

// mockTreeServer returns a test client + server that serves the given root and
// full tree entries under the standard ref/commit/tree chain.
func mockTreeServer(t *testing.T, rootEntries, fullEntries []map[string]any, fullTruncated bool) *Client {
	t.Helper()
	mux := http.NewServeMux()

	// Ref → commit SHA
	mux.HandleFunc("/repos/owner/repo/git/ref/", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"ref":    "refs/heads/main",
			"object": map[string]any{"sha": "commitsha", "type": "commit"},
		})
	})
	// Commit → tree SHA
	mux.HandleFunc("/repos/owner/repo/git/commits/commitsha", func(w http.ResponseWriter, r *http.Request) {
		writeJSON(w, map[string]any{
			"sha":  "commitsha",
			"tree": map[string]any{"sha": "rootsha"},
		})
	})
	// Tree: recursive=0 → root entries, recursive=1 → full entries
	mux.HandleFunc("/repos/owner/repo/git/trees/rootsha", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("recursive") == "1" {
			writeJSON(w, map[string]any{
				"sha":       "rootsha",
				"truncated": fullTruncated,
				"tree":      fullEntries,
			})
		} else {
			writeJSON(w, map[string]any{
				"sha":  "rootsha",
				"tree": rootEntries,
			})
		}
	})

	c, _ := newTestClient(t, mux)
	return c
}

func TestDetectEPFInRepo_AtRoot(t *testing.T) {
	rootEntries := []map[string]any{
		{"path": "READY", "type": "tree", "sha": "readysha"},
		{"path": "_meta.yaml", "type": "blob", "sha": "metasha"},
		{"path": "FIRE", "type": "tree", "sha": "firesha"},
	}
	c := mockTreeServer(t, rootEntries, nil, false)
	instances, _, truncated, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if truncated {
		t.Error("truncated should be false")
	}
	if len(instances) != 1 {
		t.Fatalf("want 1 instance, got %d", len(instances))
	}
	if instances[0].BasePath != "" {
		t.Errorf("BasePath=%q, want empty (root)", instances[0].BasePath)
	}
	if !instances[0].HasMetaFile {
		t.Error("HasMetaFile should be true (_meta.yaml present)")
	}
}

func TestDetectEPFInRepo_InSubdirectory(t *testing.T) {
	// No EPF markers at root.
	rootEntries := []map[string]any{
		{"path": "src", "type": "tree", "sha": "srcsha"},
		{"path": "docs", "type": "tree", "sha": "docssha"},
		{"path": "README.md", "type": "blob", "sha": "readmesha"},
	}
	// Recursive scan finds READY/ under docs/strategy.
	fullEntries := []map[string]any{
		{"path": "src", "type": "tree", "sha": "srcsha"},
		{"path": "docs", "type": "tree", "sha": "docssha"},
		{"path": "docs/strategy", "type": "tree", "sha": "stratsha"},
		{"path": "docs/strategy/READY", "type": "tree", "sha": "readysha"},
		{"path": "docs/strategy/READY/north_star.yaml", "type": "blob", "sha": "nssha"},
		{"path": "docs/strategy/_meta.yaml", "type": "blob", "sha": "metasha"},
		{"path": "README.md", "type": "blob", "sha": "readmesha"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, truncated, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if truncated {
		t.Error("truncated should be false")
	}
	if len(instances) != 1 {
		t.Fatalf("want 1 instance, got %d", len(instances))
	}
	if instances[0].BasePath != "docs/strategy" {
		t.Errorf("BasePath=%q, want docs/strategy", instances[0].BasePath)
	}
	if !instances[0].HasMetaFile {
		t.Error("HasMetaFile should be true (_meta.yaml at docs/strategy)")
	}
}

func TestDetectEPFInRepo_MultipleInstances(t *testing.T) {
	rootEntries := []map[string]any{
		{"path": "README.md", "type": "blob", "sha": "sha1"},
	}
	fullEntries := []map[string]any{
		{"path": "strategy/product-a", "type": "tree", "sha": "sha2"},
		{"path": "strategy/product-a/READY", "type": "tree", "sha": "sha3"},
		{"path": "strategy/product-a/READY/north_star.yaml", "type": "blob", "sha": "sha4"},
		{"path": "strategy/product-b", "type": "tree", "sha": "sha5"},
		{"path": "strategy/product-b/READY", "type": "tree", "sha": "sha6"},
		{"path": "strategy/product-b/READY/north_star.yaml", "type": "blob", "sha": "sha7"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, _, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if len(instances) != 2 {
		t.Fatalf("want 2 instances, got %d", len(instances))
	}
	paths := map[string]bool{
		instances[0].BasePath: true,
		instances[1].BasePath: true,
	}
	if !paths["strategy/product-a"] || !paths["strategy/product-b"] {
		t.Errorf("unexpected base paths: %v", []string{instances[0].BasePath, instances[1].BasePath})
	}
}

func TestDetectEPFInRepo_NotFound(t *testing.T) {
	rootEntries := []map[string]any{
		{"path": "src", "type": "tree", "sha": "sha1"},
		{"path": "README.md", "type": "blob", "sha": "sha2"},
	}
	fullEntries := []map[string]any{
		{"path": "src", "type": "tree", "sha": "sha1"},
		{"path": "src/main.go", "type": "blob", "sha": "sha3"},
		{"path": "README.md", "type": "blob", "sha": "sha2"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, truncated, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if truncated {
		t.Error("truncated should be false")
	}
	if len(instances) != 0 {
		t.Errorf("want 0 instances, got %d", len(instances))
	}
}

func TestDetectEPFInRepo_TruncatedTree(t *testing.T) {
	rootEntries := []map[string]any{
		{"path": "README.md", "type": "blob", "sha": "sha1"},
	}
	// Truncated — but still has one READY dir in partial results.
	fullEntries := []map[string]any{
		{"path": "docs/strategy/READY", "type": "tree", "sha": "sha2"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, true)
	instances, _, truncated, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if !truncated {
		t.Error("truncated should be true")
	}
	// Partial results still returned.
	if len(instances) != 1 {
		t.Fatalf("want 1 instance from partial results, got %d", len(instances))
	}
	if instances[0].BasePath != "docs/strategy" {
		t.Errorf("BasePath=%q, want docs/strategy", instances[0].BasePath)
	}
}

func TestDetectEPFInRepo_SubmoduleSkipped(t *testing.T) {
	// Simulates twentyfirst: has docs/EPF as a git submodule (type "commit"),
	// and the submodule contains READY/. The subscriber repo should report 0 instances.
	rootEntries := []map[string]any{
		{"path": "docs", "type": "tree", "sha": "docssha"},
		{"path": "README.md", "type": "blob", "sha": "readmesha"},
	}
	fullEntries := []map[string]any{
		{"path": "docs", "type": "tree", "sha": "docssha"},
		{"path": "docs/EPF", "type": "commit", "sha": "submodsha"}, // submodule entry
		// These blobs/trees live inside the submodule — GitHub includes them in
		// a non-recursive tree but they would appear as submodule entries. In the
		// recursive tree they do NOT appear (GitHub does not recurse into submodules).
		// So this test correctly has no docs/EPF/READY entry.
		{"path": "README.md", "type": "blob", "sha": "readmesha"},
		{"path": "src", "type": "tree", "sha": "srcsha"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, _, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if len(instances) != 0 {
		t.Errorf("want 0 instances (submodule EPF should be skipped), got %d: %+v", len(instances), instances)
	}
}

func TestDetectEPFInRepo_SubmoduleAndNativeInstance(t *testing.T) {
	// A repo that has both: a native EPF instance AND a submodule that also contains EPF.
	// Only the native instance should be returned.
	rootEntries := []map[string]any{
		{"path": "README.md", "type": "blob", "sha": "sha1"},
	}
	fullEntries := []map[string]any{
		// Native EPF instance at strategy/
		{"path": "strategy", "type": "tree", "sha": "sha2"},
		{"path": "strategy/READY", "type": "tree", "sha": "sha3"},
		{"path": "strategy/_meta.yaml", "type": "blob", "sha": "sha4"},
		// Submodule at vendor/epf (type "commit") — GitHub does not recurse into it
		{"path": "vendor/epf", "type": "commit", "sha": "submodsha"},
		{"path": "README.md", "type": "blob", "sha": "sha1"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, _, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if len(instances) != 1 {
		t.Fatalf("want 1 instance (native only), got %d: %+v", len(instances), instances)
	}
	if instances[0].BasePath != "strategy" {
		t.Errorf("BasePath=%q, want strategy", instances[0].BasePath)
	}
}

func TestDetectEPFInRepo_CommittedFrameworkWithInstance(t *testing.T) {
	// Simulates huma-blueprint-ui: EPF framework committed directly into docs/EPF/,
	// with framework template dirs (templates/READY, phases/READY) and the real
	// instance at docs/EPF/_instances/huma-blueprint/READY.
	// Should return exactly 1 instance, not 3.
	rootEntries := []map[string]any{
		{"path": "docs", "type": "tree", "sha": "sha1"},
		{"path": "src", "type": "tree", "sha": "sha2"},
	}
	fullEntries := []map[string]any{
		{"path": "docs/EPF", "type": "tree", "sha": "sha3"},
		// Framework template dir — should be ignored (contains "templates")
		{"path": "docs/EPF/templates", "type": "tree", "sha": "sha4"},
		{"path": "docs/EPF/templates/READY", "type": "tree", "sha": "sha5"},
		{"path": "docs/EPF/templates/READY/00_north_star.yaml", "type": "blob", "sha": "sha6"},
		// Framework phases dir — should be ignored (contains "phases")
		{"path": "docs/EPF/phases", "type": "tree", "sha": "sha7"},
		{"path": "docs/EPF/phases/READY", "type": "tree", "sha": "sha8"},
		// Real instance — should be detected
		{"path": "docs/EPF/_instances", "type": "tree", "sha": "sha9"},
		{"path": "docs/EPF/_instances/huma-blueprint", "type": "tree", "sha": "sha10"},
		{"path": "docs/EPF/_instances/huma-blueprint/READY", "type": "tree", "sha": "sha11"},
		{"path": "docs/EPF/_instances/huma-blueprint/_meta.yaml", "type": "blob", "sha": "sha12"},
		{"path": "docs/EPF/_instances/huma-blueprint/READY/00_north_star.yaml", "type": "blob", "sha": "sha13"},
	}
	c := mockTreeServer(t, rootEntries, fullEntries, false)
	instances, _, _, err := c.DetectEPFInRepo(context.Background(), "tok", "owner", "repo", "main")
	if err != nil {
		t.Fatalf("DetectEPFInRepo: %v", err)
	}
	if len(instances) != 1 {
		t.Fatalf("want 1 instance, got %d: %+v", len(instances), instances)
	}
	if instances[0].BasePath != "docs/EPF/_instances/huma-blueprint" {
		t.Errorf("BasePath=%q, want docs/EPF/_instances/huma-blueprint", instances[0].BasePath)
	}
	if !instances[0].HasMetaFile {
		t.Error("HasMetaFile should be true (_meta.yaml present)")
	}
}

func TestIsUnderSubmodule(t *testing.T) {
	cases := []struct {
		basePath       string
		submodulePaths []string
		want           bool
	}{
		{"docs/EPF", []string{"docs/EPF"}, true},
		{"docs/EPF/_instances/foo", []string{"docs/EPF"}, true},
		{"docs/strategy", []string{"docs/EPF"}, false},
		{"", []string{"docs/EPF"}, false},
		{"docs/EPF-extra", []string{"docs/EPF"}, false}, // prefix match must be exact segment
		{"docs/EPF", []string{}, false},
	}
	for _, tc := range cases {
		got := isUnderSubmodule(tc.basePath, tc.submodulePaths)
		if got != tc.want {
			t.Errorf("isUnderSubmodule(%q, %v) = %v, want %v", tc.basePath, tc.submodulePaths, got, tc.want)
		}
	}
}

// ---------------------------------------------------------------------------
// parseGitmodules + githubSlugFromURL
// ---------------------------------------------------------------------------

func TestParseGitmodules(t *testing.T) {
	input := []byte(`[submodule "docs/EPF"]
	path = docs/EPF
	url = git@github.com:eyedea-io/21st-epf.git
[submodule "libs/shared"]
	path = libs/shared
	url = https://github.com/myorg/shared-lib.git
[submodule "non-github"]
	path = external/dep
	url = https://gitlab.com/some/repo.git
`)
	refs := parseGitmodules(input)
	if len(refs) != 3 {
		t.Fatalf("want 3 refs, got %d: %+v", len(refs), refs)
	}

	if refs[0].Path != "docs/EPF" {
		t.Errorf("refs[0].Path=%q, want docs/EPF", refs[0].Path)
	}
	if refs[0].RepoSlug != "eyedea-io/21st-epf" {
		t.Errorf("refs[0].RepoSlug=%q, want eyedea-io/21st-epf", refs[0].RepoSlug)
	}

	if refs[1].Path != "libs/shared" {
		t.Errorf("refs[1].Path=%q, want libs/shared", refs[1].Path)
	}
	if refs[1].RepoSlug != "myorg/shared-lib" {
		t.Errorf("refs[1].RepoSlug=%q, want myorg/shared-lib", refs[1].RepoSlug)
	}

	// Non-GitHub URL — RepoSlug should be empty.
	if refs[2].RepoSlug != "" {
		t.Errorf("refs[2].RepoSlug=%q, want empty for non-GitHub URL", refs[2].RepoSlug)
	}
}

func TestGithubSlugFromURL(t *testing.T) {
	cases := []struct{ url, want string }{
		{"git@github.com:eyedea-io/21st-epf.git", "eyedea-io/21st-epf"},
		{"https://github.com/myorg/myrepo.git", "myorg/myrepo"},
		{"https://github.com/myorg/myrepo", "myorg/myrepo"},
		{"https://gitlab.com/some/repo.git", ""},
		{"git@bitbucket.org:org/repo.git", ""},
	}
	for _, tc := range cases {
		got := githubSlugFromURL(tc.url)
		if got != tc.want {
			t.Errorf("githubSlugFromURL(%q) = %q, want %q", tc.url, got, tc.want)
		}
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

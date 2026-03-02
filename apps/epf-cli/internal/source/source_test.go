package source

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

// =============================================================================
// FileSystemSource Tests
// =============================================================================

func TestNewFileSystemSource(t *testing.T) {
	tmpDir := t.TempDir()
	src, err := NewFileSystemSource(tmpDir)
	if err != nil {
		t.Fatalf("NewFileSystemSource(%s): %v", tmpDir, err)
	}

	// Root should be an absolute path.
	if !filepath.IsAbs(src.Root()) {
		t.Errorf("Root() = %q, want absolute path", src.Root())
	}
}

func TestNewFileSystemSource_RelativePath(t *testing.T) {
	// Create a temp dir and use a relative path to it.
	tmpDir := t.TempDir()
	// Use the basename as a relative path from the parent.
	parent := filepath.Dir(tmpDir)
	base := filepath.Base(tmpDir)

	origDir, _ := os.Getwd()
	os.Chdir(parent)        //nolint:errcheck
	defer os.Chdir(origDir) //nolint:errcheck

	src, err := NewFileSystemSource(base)
	if err != nil {
		t.Fatalf("NewFileSystemSource(%s): %v", base, err)
	}

	if !filepath.IsAbs(src.Root()) {
		t.Errorf("Root() = %q, want absolute path", src.Root())
	}
}

func TestFileSystemSource_ReadFile(t *testing.T) {
	tmpDir := t.TempDir()
	content := []byte("hello world")
	if err := os.WriteFile(filepath.Join(tmpDir, "test.txt"), content, 0o644); err != nil {
		t.Fatal(err)
	}

	src, _ := NewFileSystemSource(tmpDir)
	data, err := src.ReadFile("test.txt")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != "hello world" {
		t.Errorf("ReadFile = %q, want %q", string(data), "hello world")
	}
}

func TestFileSystemSource_ReadFile_NotExists(t *testing.T) {
	tmpDir := t.TempDir()
	src, _ := NewFileSystemSource(tmpDir)
	_, err := src.ReadFile("nonexistent.txt")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestFileSystemSource_ReadFile_Nested(t *testing.T) {
	tmpDir := t.TempDir()
	nested := filepath.Join(tmpDir, "a", "b")
	os.MkdirAll(nested, 0o755)                                                  //nolint:errcheck
	os.WriteFile(filepath.Join(nested, "deep.yaml"), []byte("key: val"), 0o644) //nolint:errcheck

	src, _ := NewFileSystemSource(tmpDir)
	data, err := src.ReadFile("a/b/deep.yaml")
	if err != nil {
		t.Fatalf("ReadFile nested: %v", err)
	}
	if string(data) != "key: val" {
		t.Errorf("ReadFile = %q, want %q", string(data), "key: val")
	}
}

func TestFileSystemSource_ReadDir(t *testing.T) {
	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "a.txt"), []byte("a"), 0o644) //nolint:errcheck
	os.WriteFile(filepath.Join(tmpDir, "b.txt"), []byte("b"), 0o644) //nolint:errcheck
	os.MkdirAll(filepath.Join(tmpDir, "subdir"), 0o755)              //nolint:errcheck

	src, _ := NewFileSystemSource(tmpDir)
	entries, err := src.ReadDir(".")
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}

	names := make([]string, len(entries))
	for i, e := range entries {
		names[i] = e.Name()
	}
	sort.Strings(names)

	expected := []string{"a.txt", "b.txt", "subdir"}
	if len(names) != len(expected) {
		t.Fatalf("ReadDir returned %d entries, want %d", len(names), len(expected))
	}
	for i, name := range names {
		if name != expected[i] {
			t.Errorf("entry[%d] = %q, want %q", i, name, expected[i])
		}
	}
}

func TestFileSystemSource_ReadDir_NotExists(t *testing.T) {
	tmpDir := t.TempDir()
	src, _ := NewFileSystemSource(tmpDir)
	_, err := src.ReadDir("nonexistent")
	if err == nil {
		t.Fatal("expected error for nonexistent directory")
	}
}

func TestFileSystemSource_Stat(t *testing.T) {
	tmpDir := t.TempDir()
	os.WriteFile(filepath.Join(tmpDir, "file.txt"), []byte("content"), 0o644) //nolint:errcheck

	src, _ := NewFileSystemSource(tmpDir)

	// Stat a file.
	fi, err := src.Stat("file.txt")
	if err != nil {
		t.Fatalf("Stat file: %v", err)
	}
	if fi.IsDir() {
		t.Error("Stat file: expected not directory")
	}
	if fi.Size() != 7 {
		t.Errorf("Stat file: size = %d, want 7", fi.Size())
	}

	// Stat a directory.
	fi, err = src.Stat(".")
	if err != nil {
		t.Fatalf("Stat dir: %v", err)
	}
	if !fi.IsDir() {
		t.Error("Stat dir: expected directory")
	}
}

func TestFileSystemSource_Walk(t *testing.T) {
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0o755)                                      //nolint:errcheck
	os.WriteFile(filepath.Join(tmpDir, "READY", "ns.yaml"), []byte("north_star:"), 0o644)   //nolint:errcheck
	os.WriteFile(filepath.Join(tmpDir, "READY", "ia.yaml"), []byte("target_users:"), 0o644) //nolint:errcheck

	src, _ := NewFileSystemSource(tmpDir)

	var paths []string
	err := src.Walk("READY", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		paths = append(paths, path)
		return nil
	})
	if err != nil {
		t.Fatalf("Walk: %v", err)
	}

	// Should have directory itself + 2 files, all with forward slashes.
	if len(paths) != 3 {
		t.Fatalf("Walk returned %d paths, want 3: %v", len(paths), paths)
	}

	// All paths should use forward slashes (platform-independent).
	for _, p := range paths {
		if strings.Contains(p, "\\") {
			t.Errorf("Walk path %q contains backslash", p)
		}
	}
}

// =============================================================================
// GitHubSource Tests (with mock HTTP)
// =============================================================================

// mockGitHubServer creates a test HTTP server that simulates the GitHub Contents API.
func mockGitHubServer(t *testing.T, files map[string]string) *httptest.Server {
	t.Helper()
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract path from URL: /repos/{owner}/{repo}/contents/{path}
		parts := strings.SplitN(r.URL.Path, "/contents/", 2)
		if len(parts) != 2 {
			http.Error(w, "bad path", 400)
			return
		}
		reqPath := parts[1]

		// Check if it matches a file.
		if content, ok := files[reqPath]; ok {
			encoded := base64.StdEncoding.EncodeToString([]byte(content))
			entry := ghContentsEntry{
				Name:     filepath.Base(reqPath),
				Path:     reqPath,
				Type:     "file",
				Size:     int64(len(content)),
				Content:  encoded,
				Encoding: "base64",
			}
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(entry) //nolint:errcheck
			return
		}

		// Check if it's a directory prefix.
		var dirEntries []ghContentsEntry
		prefix := reqPath
		if !strings.HasSuffix(prefix, "/") {
			prefix += "/"
		}
		for path := range files {
			if strings.HasPrefix(path, prefix) {
				// Get the immediate child.
				rest := strings.TrimPrefix(path, prefix)
				childName := strings.SplitN(rest, "/", 2)[0]

				// Deduplicate children.
				found := false
				for _, e := range dirEntries {
					if e.Name == childName {
						found = true
						break
					}
				}
				if !found {
					entryType := "file"
					if strings.Contains(rest, "/") {
						entryType = "dir"
					}
					dirEntries = append(dirEntries, ghContentsEntry{
						Name: childName,
						Path: prefix + childName,
						Type: entryType,
						Size: int64(len(files[path])),
					})
				}
			}
		}

		// Check for exact directory match (no trailing slash in files).
		if len(dirEntries) == 0 {
			// Try without trailing slash for root-level paths.
			for path := range files {
				if strings.HasPrefix(path, reqPath+"/") {
					rest := strings.TrimPrefix(path, reqPath+"/")
					childName := strings.SplitN(rest, "/", 2)[0]

					found := false
					for _, e := range dirEntries {
						if e.Name == childName {
							found = true
							break
						}
					}
					if !found {
						entryType := "file"
						if strings.Contains(rest, "/") {
							entryType = "dir"
						}
						dirEntries = append(dirEntries, ghContentsEntry{
							Name: childName,
							Path: reqPath + "/" + childName,
							Type: entryType,
						})
					}
				}
			}
		}

		if len(dirEntries) > 0 {
			w.Header().Set("Content-Type", "application/json")
			json.NewEncoder(w).Encode(dirEntries) //nolint:errcheck
			return
		}

		http.Error(w, `{"message":"Not Found"}`, 404)
	}))
}

// newTestGitHubSource creates a GitHubSource pointed at a mock server.
func newTestGitHubSource(server *httptest.Server) *GitHubSource {
	// Override the API URL by using a custom HTTP client and replacing the base URL.
	src := NewGitHubSource("testowner", "testrepo", nil,
		WithHTTPClient(server.Client()),
	)
	// Override the apiURL method by embedding the server URL.
	// We'll achieve this by monkey-patching — instead, we wrap the
	// server to handle the standard API path format.
	src.client = server.Client()
	// Override the client's transport to redirect to the test server.
	src.client.Transport = &rewriteTransport{
		base:      server.Client().Transport,
		serverURL: server.URL,
	}
	return src
}

// rewriteTransport redirects GitHub API requests to the test server.
type rewriteTransport struct {
	base      http.RoundTripper
	serverURL string
}

func (t *rewriteTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	// Rewrite the URL to point to the test server.
	req.URL.Scheme = "http"
	req.URL.Host = strings.TrimPrefix(t.serverURL, "http://")
	if t.base != nil {
		return t.base.RoundTrip(req)
	}
	return http.DefaultTransport.RoundTrip(req)
}

func TestGitHubSource_ReadFile(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{
		"READY/00_north_star.yaml": "north_star:\n  organization: Test\n",
	})
	defer server.Close()

	src := newTestGitHubSource(server)
	data, err := src.ReadFile("READY/00_north_star.yaml")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if !strings.Contains(string(data), "organization: Test") {
		t.Errorf("ReadFile = %q, want to contain 'organization: Test'", string(data))
	}
}

func TestGitHubSource_ReadFile_NotFound(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{})
	defer server.Close()

	src := newTestGitHubSource(server)
	_, err := src.ReadFile("nonexistent.yaml")
	if err == nil {
		t.Fatal("expected error for nonexistent file")
	}
}

func TestGitHubSource_ReadFile_WithBasePath(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{
		"docs/EPF/_instances/test/READY/ns.yaml": "north_star:\n  org: BasePath\n",
	})
	defer server.Close()

	src := newTestGitHubSource(server)
	src.basePath = "docs/EPF/_instances/test"

	data, err := src.ReadFile("READY/ns.yaml")
	if err != nil {
		t.Fatalf("ReadFile with basePath: %v", err)
	}
	if !strings.Contains(string(data), "org: BasePath") {
		t.Errorf("ReadFile = %q, want to contain 'org: BasePath'", string(data))
	}
}

func TestGitHubSource_ReadDir(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{
		"READY/a.yaml": "a: 1",
		"READY/b.yaml": "b: 2",
	})
	defer server.Close()

	src := newTestGitHubSource(server)
	entries, err := src.ReadDir("READY")
	if err != nil {
		t.Fatalf("ReadDir: %v", err)
	}

	if len(entries) != 2 {
		t.Fatalf("ReadDir returned %d entries, want 2", len(entries))
	}

	// Entries should be sorted by name.
	if entries[0].Name() != "a.yaml" {
		t.Errorf("entries[0].Name() = %q, want %q", entries[0].Name(), "a.yaml")
	}
	if entries[1].Name() != "b.yaml" {
		t.Errorf("entries[1].Name() = %q, want %q", entries[1].Name(), "b.yaml")
	}
}

func TestGitHubSource_Stat_File(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{
		"test.yaml": "key: value",
	})
	defer server.Close()

	src := newTestGitHubSource(server)
	fi, err := src.Stat("test.yaml")
	if err != nil {
		t.Fatalf("Stat: %v", err)
	}
	if fi.IsDir() {
		t.Error("expected file, got directory")
	}
	if fi.Name() != "test.yaml" {
		t.Errorf("Name() = %q, want %q", fi.Name(), "test.yaml")
	}
}

func TestGitHubSource_Stat_NotFound(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{})
	defer server.Close()

	src := newTestGitHubSource(server)
	_, err := src.Stat("nonexistent.yaml")
	if err == nil {
		t.Fatal("expected error for nonexistent path")
	}
}

func TestGitHubSource_Root(t *testing.T) {
	src := NewGitHubSource("owner", "repo", nil)
	if src.Root() != "github://owner/repo" {
		t.Errorf("Root() = %q, want %q", src.Root(), "github://owner/repo")
	}

	srcWithBase := NewGitHubSource("owner", "repo", nil, WithBasePath("docs/EPF"))
	if srcWithBase.Root() != "github://owner/repo/docs/EPF" {
		t.Errorf("Root() = %q, want %q", srcWithBase.Root(), "github://owner/repo/docs/EPF")
	}
}

func TestGitHubSource_WithRef(t *testing.T) {
	src := NewGitHubSource("owner", "repo", nil, WithRef("v1.0"))
	if src.ref != "v1.0" {
		t.Errorf("ref = %q, want %q", src.ref, "v1.0")
	}
}

func TestGitHubSource_TokenFunc(t *testing.T) {
	var tokenUsed string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		tokenUsed = r.Header.Get("Authorization")
		// Return a file response.
		entry := ghContentsEntry{
			Name:     "test.yaml",
			Path:     "test.yaml",
			Type:     "file",
			Content:  base64.StdEncoding.EncodeToString([]byte("test")),
			Encoding: "base64",
		}
		json.NewEncoder(w).Encode(entry) //nolint:errcheck
	}))
	defer server.Close()

	tokenFn := func() (string, error) { return "my-secret-token", nil }
	src := NewGitHubSource("owner", "repo", tokenFn,
		WithHTTPClient(&http.Client{
			Transport: &rewriteTransport{serverURL: server.URL},
		}),
	)

	_, _ = src.ReadFile("test.yaml")
	if tokenUsed != "Bearer my-secret-token" {
		t.Errorf("Authorization = %q, want %q", tokenUsed, "Bearer my-secret-token")
	}
}

func TestGitHubSource_Walk(t *testing.T) {
	server := mockGitHubServer(t, map[string]string{
		"READY/a.yaml": "a: 1",
		"READY/b.yaml": "b: 2",
	})
	defer server.Close()

	src := newTestGitHubSource(server)

	var paths []string
	err := src.Walk("READY", func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		paths = append(paths, path)
		return nil
	})
	if err != nil {
		t.Fatalf("Walk: %v", err)
	}

	// Should have the directory + 2 files.
	if len(paths) < 2 {
		t.Fatalf("Walk returned %d paths, want at least 2: %v", len(paths), paths)
	}
}

// =============================================================================
// ghDirEntry / ghFileInfo Tests
// =============================================================================

func TestGhDirEntry_File(t *testing.T) {
	de := &ghDirEntry{entry: ghContentsEntry{Name: "test.yaml", Type: "file", Size: 42}}
	if de.Name() != "test.yaml" {
		t.Errorf("Name() = %q, want %q", de.Name(), "test.yaml")
	}
	if de.IsDir() {
		t.Error("expected not directory")
	}
	if de.Type() != 0 {
		t.Errorf("Type() = %v, want 0", de.Type())
	}
	fi, err := de.Info()
	if err != nil {
		t.Fatalf("Info(): %v", err)
	}
	if fi.Size() != 42 {
		t.Errorf("Size() = %d, want 42", fi.Size())
	}
}

func TestGhDirEntry_Dir(t *testing.T) {
	de := &ghDirEntry{entry: ghContentsEntry{Name: "subdir", Type: "dir"}}
	if !de.IsDir() {
		t.Error("expected directory")
	}
	if de.Type() != fs.ModeDir {
		t.Errorf("Type() = %v, want ModeDir", de.Type())
	}
}

func TestGhFileInfo_File(t *testing.T) {
	fi := &ghFileInfo{entry: ghContentsEntry{Name: "f.txt", Type: "file", Size: 100}}
	if fi.Name() != "f.txt" {
		t.Errorf("Name() = %q", fi.Name())
	}
	if fi.Size() != 100 {
		t.Errorf("Size() = %d", fi.Size())
	}
	if fi.Mode() != 0o644 {
		t.Errorf("Mode() = %v", fi.Mode())
	}
	if fi.IsDir() {
		t.Error("expected not directory")
	}
	if fi.Sys() != nil {
		t.Error("Sys() should be nil")
	}
	if !fi.ModTime().IsZero() {
		t.Error("ModTime() should be zero")
	}
}

func TestGhFileInfo_Dir(t *testing.T) {
	fi := &ghFileInfo{entry: ghContentsEntry{Name: "d", Type: "dir", Size: 500}}
	if !fi.IsDir() {
		t.Error("expected directory")
	}
	if fi.Size() != 0 {
		t.Errorf("Size() = %d, want 0 for directory", fi.Size())
	}
	if fi.Mode() != fs.ModeDir|0o755 {
		t.Errorf("Mode() = %v, want ModeDir|0755", fi.Mode())
	}
}

// =============================================================================
// CachedSource Tests
// =============================================================================

// mockSource is a minimal Source implementation for testing the cache layer.
type mockSource struct {
	readFileCount atomic.Int32
	readDirCount  atomic.Int32
	statCount     atomic.Int32
	walkCount     atomic.Int32
	files         map[string]string
	mu            sync.RWMutex
}

func newMockSource(files map[string]string) *mockSource {
	return &mockSource{files: files}
}

func (m *mockSource) ReadFile(path string) ([]byte, error) {
	m.readFileCount.Add(1)
	m.mu.RLock()
	defer m.mu.RUnlock()
	content, ok := m.files[path]
	if !ok {
		return nil, &fs.PathError{Op: "read", Path: path, Err: fs.ErrNotExist}
	}
	return []byte(content), nil
}

func (m *mockSource) ReadDir(path string) ([]fs.DirEntry, error) {
	m.readDirCount.Add(1)
	return nil, nil
}

func (m *mockSource) Stat(path string) (fs.FileInfo, error) {
	m.statCount.Add(1)
	return nil, nil
}

func (m *mockSource) Walk(root string, fn fs.WalkDirFunc) error {
	m.walkCount.Add(1)
	return nil
}

func (m *mockSource) Root() string {
	return "/mock"
}

func TestCachedSource_ReadFile_CachesResult(t *testing.T) {
	mock := newMockSource(map[string]string{
		"test.yaml": "cached content",
	})

	cached := NewCachedSource(mock, WithTTL(1*time.Hour))

	// First read — hits upstream.
	data, err := cached.ReadFile("test.yaml")
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	if string(data) != "cached content" {
		t.Errorf("ReadFile = %q, want %q", string(data), "cached content")
	}
	if mock.readFileCount.Load() != 1 {
		t.Errorf("upstream called %d times, want 1", mock.readFileCount.Load())
	}

	// Second read — should be cached.
	data, err = cached.ReadFile("test.yaml")
	if err != nil {
		t.Fatalf("ReadFile (cached): %v", err)
	}
	if string(data) != "cached content" {
		t.Errorf("ReadFile (cached) = %q, want %q", string(data), "cached content")
	}
	if mock.readFileCount.Load() != 1 {
		t.Errorf("upstream called %d times after cache hit, want 1", mock.readFileCount.Load())
	}
}

func TestCachedSource_ReadFile_DifferentKeys(t *testing.T) {
	mock := newMockSource(map[string]string{
		"a.yaml": "content a",
		"b.yaml": "content b",
	})

	cached := NewCachedSource(mock, WithTTL(1*time.Hour))

	_, _ = cached.ReadFile("a.yaml")
	_, _ = cached.ReadFile("b.yaml")

	if mock.readFileCount.Load() != 2 {
		t.Errorf("upstream called %d times, want 2 (one per key)", mock.readFileCount.Load())
	}
}

func TestCachedSource_TTLExpiry_ReturnsStale(t *testing.T) {
	mock := newMockSource(map[string]string{
		"test.yaml": "original",
	})

	now := time.Now()
	clock := func() time.Time { return now }

	cached := NewCachedSource(mock, WithTTL(1*time.Minute), WithClock(clock))

	// Populate cache.
	_, _ = cached.ReadFile("test.yaml")
	if mock.readFileCount.Load() != 1 {
		t.Fatalf("initial upstream count = %d, want 1", mock.readFileCount.Load())
	}

	// Advance time past TTL.
	now = now.Add(2 * time.Minute)

	// Update upstream content.
	mock.mu.Lock()
	mock.files["test.yaml"] = "updated"
	mock.mu.Unlock()

	// Read should return stale value immediately and trigger background refresh.
	data, err := cached.ReadFile("test.yaml")
	if err != nil {
		t.Fatalf("ReadFile (stale): %v", err)
	}
	if string(data) != "original" {
		t.Errorf("ReadFile (stale) = %q, want %q (stale value)", string(data), "original")
	}

	// Wait for background refresh to complete.
	time.Sleep(50 * time.Millisecond)

	// Now it should have the updated value.
	data, err = cached.ReadFile("test.yaml")
	if err != nil {
		t.Fatalf("ReadFile (refreshed): %v", err)
	}
	if string(data) != "updated" {
		t.Errorf("ReadFile (refreshed) = %q, want %q", string(data), "updated")
	}
}

func TestCachedSource_Invalidate(t *testing.T) {
	mock := newMockSource(map[string]string{
		"test.yaml": "content",
	})

	cached := NewCachedSource(mock, WithTTL(1*time.Hour))

	_, _ = cached.ReadFile("test.yaml")
	if mock.readFileCount.Load() != 1 {
		t.Fatal("expected 1 upstream call")
	}

	cached.Invalidate("file:test.yaml")

	_, _ = cached.ReadFile("test.yaml")
	if mock.readFileCount.Load() != 2 {
		t.Errorf("after invalidate, upstream called %d times, want 2", mock.readFileCount.Load())
	}
}

func TestCachedSource_InvalidateAll(t *testing.T) {
	mock := newMockSource(map[string]string{
		"a.yaml": "a",
		"b.yaml": "b",
	})

	cached := NewCachedSource(mock, WithTTL(1*time.Hour))

	_, _ = cached.ReadFile("a.yaml")
	_, _ = cached.ReadFile("b.yaml")
	if mock.readFileCount.Load() != 2 {
		t.Fatal("expected 2 upstream calls")
	}

	cached.InvalidateAll()

	_, _ = cached.ReadFile("a.yaml")
	_, _ = cached.ReadFile("b.yaml")
	if mock.readFileCount.Load() != 4 {
		t.Errorf("after invalidateAll, upstream called %d times, want 4", mock.readFileCount.Load())
	}
}

func TestCachedSource_Stats(t *testing.T) {
	mock := newMockSource(map[string]string{
		"a.yaml": "a",
		"b.yaml": "b",
	})

	now := time.Now()
	cached := NewCachedSource(mock,
		WithTTL(1*time.Minute),
		WithClock(func() time.Time { return now }),
	)

	_, _ = cached.ReadFile("a.yaml")
	_, _ = cached.ReadFile("b.yaml")

	stats := cached.Stats()
	if stats.TotalEntries != 2 {
		t.Errorf("TotalEntries = %d, want 2", stats.TotalEntries)
	}
	if stats.FreshEntries != 2 {
		t.Errorf("FreshEntries = %d, want 2", stats.FreshEntries)
	}
	if stats.StaleEntries != 0 {
		t.Errorf("StaleEntries = %d, want 0", stats.StaleEntries)
	}

	// Advance time to make entries stale.
	now = now.Add(2 * time.Minute)
	stats = cached.Stats()
	if stats.FreshEntries != 0 {
		t.Errorf("FreshEntries after TTL = %d, want 0", stats.FreshEntries)
	}
	if stats.StaleEntries != 2 {
		t.Errorf("StaleEntries after TTL = %d, want 2", stats.StaleEntries)
	}
}

func TestCachedSource_Walk_NotCached(t *testing.T) {
	mock := newMockSource(nil)
	cached := NewCachedSource(mock)

	_ = cached.Walk(".", func(path string, d fs.DirEntry, err error) error { return nil })
	_ = cached.Walk(".", func(path string, d fs.DirEntry, err error) error { return nil })

	if mock.walkCount.Load() != 2 {
		t.Errorf("Walk count = %d, want 2 (not cached)", mock.walkCount.Load())
	}
}

func TestCachedSource_Root_Delegates(t *testing.T) {
	mock := newMockSource(nil)
	cached := NewCachedSource(mock)

	if cached.Root() != "/mock" {
		t.Errorf("Root() = %q, want %q", cached.Root(), "/mock")
	}
}

func TestCachedSource_Singleflight(t *testing.T) {
	callCount := &atomic.Int32{}

	mock := &slowMockSource{
		files:     map[string]string{"test.yaml": "content"},
		delay:     50 * time.Millisecond,
		callCount: callCount,
	}

	cached := NewCachedSource(mock, WithTTL(1*time.Hour))

	// Launch 10 concurrent reads for the same key.
	var wg sync.WaitGroup
	results := make([]string, 10)
	for i := 0; i < 10; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			data, err := cached.ReadFile("test.yaml")
			if err != nil {
				t.Errorf("goroutine %d: %v", idx, err)
				return
			}
			results[idx] = string(data)
		}(i)
	}
	wg.Wait()

	// Singleflight should coalesce to 1 upstream call.
	if callCount.Load() != 1 {
		t.Errorf("upstream called %d times, want 1 (singleflight)", callCount.Load())
	}

	for i, r := range results {
		if r != "content" {
			t.Errorf("results[%d] = %q, want %q", i, r, "content")
		}
	}
}

// slowMockSource adds a delay to ReadFile for singleflight testing.
type slowMockSource struct {
	files     map[string]string
	delay     time.Duration
	callCount *atomic.Int32
}

func (m *slowMockSource) ReadFile(path string) ([]byte, error) {
	m.callCount.Add(1)
	time.Sleep(m.delay)
	content, ok := m.files[path]
	if !ok {
		return nil, fmt.Errorf("not found: %s", path)
	}
	return []byte(content), nil
}

func (m *slowMockSource) ReadDir(string) ([]fs.DirEntry, error) { return nil, nil }
func (m *slowMockSource) Stat(string) (fs.FileInfo, error)      { return nil, nil }
func (m *slowMockSource) Walk(string, fs.WalkDirFunc) error     { return nil }
func (m *slowMockSource) Root() string                          { return "/slow-mock" }

// =============================================================================
// Interface Compliance Tests
// =============================================================================

func TestSourceInterfaceCompliance(t *testing.T) {
	// Verify all implementations satisfy the Source interface at compile time.
	var _ Source = (*FileSystemSource)(nil)
	var _ Source = (*GitHubSource)(nil)
	var _ Source = (*CachedSource)(nil)
}

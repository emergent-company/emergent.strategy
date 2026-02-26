package lsp

import (
	"sync"
	"testing"
)

func TestURIToPath(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want string
	}{
		{
			name: "standard file URI",
			uri:  "file:///home/user/project/READY/00_north_star.yaml",
			want: "/home/user/project/READY/00_north_star.yaml",
		},
		{
			name: "macOS file URI",
			uri:  "file:///Users/dev/code/epf/FIRE/feature_definitions/fd-001.yaml",
			want: "/Users/dev/code/epf/FIRE/feature_definitions/fd-001.yaml",
		},
		{
			name: "plain path returned as-is",
			uri:  "/tmp/test.yaml",
			want: "/tmp/test.yaml",
		},
		{
			name: "non-file scheme returned as-is",
			uri:  "https://example.com/test.yaml",
			want: "https://example.com/test.yaml",
		},
		{
			name: "malformed URI returned as-is",
			uri:  "://broken",
			want: "://broken",
		},
		{
			name: "empty string",
			uri:  "",
			want: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := URIToPath(tt.uri)
			if got != tt.want {
				t.Errorf("URIToPath(%q) = %q, want %q", tt.uri, got, tt.want)
			}
		})
	}
}

func TestDocumentIsYAML(t *testing.T) {
	tests := []struct {
		name string
		uri  string
		want bool
	}{
		{
			name: "yaml extension",
			uri:  "file:///path/to/file.yaml",
			want: true,
		},
		{
			name: "yml extension",
			uri:  "file:///path/to/file.yml",
			want: true,
		},
		{
			name: "json extension",
			uri:  "file:///path/to/file.json",
			want: false,
		},
		{
			name: "markdown extension",
			uri:  "file:///path/to/README.md",
			want: false,
		},
		{
			name: "no extension",
			uri:  "file:///path/to/Makefile",
			want: false,
		},
		{
			name: "yaml in directory name but not extension",
			uri:  "file:///yaml/config.txt",
			want: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			doc := &Document{URI: tt.uri}
			if got := doc.IsYAML(); got != tt.want {
				t.Errorf("IsYAML() for URI %q = %v, want %v", tt.uri, got, tt.want)
			}
		})
	}
}

func TestDocumentFilePath(t *testing.T) {
	doc := &Document{URI: "file:///home/user/test.yaml"}
	want := "/home/user/test.yaml"
	if got := doc.FilePath(); got != want {
		t.Errorf("FilePath() = %q, want %q", got, want)
	}
}

func TestDocumentStoreOpenAndGet(t *testing.T) {
	store := NewDocumentStore()

	uri := "file:///test.yaml"
	doc := store.Open(uri, "yaml", 1, "key: value")

	if doc == nil {
		t.Fatal("Open returned nil")
	}
	if doc.URI != uri {
		t.Errorf("URI: got %q, want %q", doc.URI, uri)
	}
	if doc.LanguageID != "yaml" {
		t.Errorf("LanguageID: got %q, want %q", doc.LanguageID, "yaml")
	}
	if doc.Version != 1 {
		t.Errorf("Version: got %d, want %d", doc.Version, 1)
	}
	if doc.Content != "key: value" {
		t.Errorf("Content: got %q, want %q", doc.Content, "key: value")
	}

	// Get should return the same document
	got := store.Get(uri)
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got != doc {
		t.Error("Get returned different pointer than Open")
	}
}

func TestDocumentStoreGetNonExistent(t *testing.T) {
	store := NewDocumentStore()

	got := store.Get("file:///does-not-exist.yaml")
	if got != nil {
		t.Error("expected nil for non-existent document")
	}
}

func TestDocumentStoreUpdate(t *testing.T) {
	store := NewDocumentStore()

	uri := "file:///test.yaml"
	store.Open(uri, "yaml", 1, "original")

	doc := store.Update(uri, 2, "updated")
	if doc == nil {
		t.Fatal("Update returned nil")
	}
	if doc.Version != 2 {
		t.Errorf("Version: got %d, want %d", doc.Version, 2)
	}
	if doc.Content != "updated" {
		t.Errorf("Content: got %q, want %q", doc.Content, "updated")
	}

	// Verify via Get
	got := store.Get(uri)
	if got.Content != "updated" {
		t.Errorf("Get after Update: Content = %q, want %q", got.Content, "updated")
	}
}

func TestDocumentStoreUpdateNonExistent(t *testing.T) {
	store := NewDocumentStore()

	doc := store.Update("file:///missing.yaml", 1, "content")
	if doc != nil {
		t.Error("expected nil when updating non-existent document")
	}
}

func TestDocumentStoreClose(t *testing.T) {
	store := NewDocumentStore()

	uri := "file:///test.yaml"
	store.Open(uri, "yaml", 1, "content")

	store.Close(uri)

	got := store.Get(uri)
	if got != nil {
		t.Error("expected nil after Close")
	}
}

func TestDocumentStoreCloseNonExistent(t *testing.T) {
	store := NewDocumentStore()

	// Should not panic
	store.Close("file:///never-opened.yaml")
}

func TestDocumentStoreOpenReplace(t *testing.T) {
	store := NewDocumentStore()

	uri := "file:///test.yaml"
	store.Open(uri, "yaml", 1, "first")
	store.Open(uri, "yaml", 2, "second")

	got := store.Get(uri)
	if got == nil {
		t.Fatal("Get returned nil")
	}
	if got.Content != "second" {
		t.Errorf("Content: got %q, want %q", got.Content, "second")
	}
	if got.Version != 2 {
		t.Errorf("Version: got %d, want %d", got.Version, 2)
	}
}

func TestDocumentStoreMultipleDocs(t *testing.T) {
	store := NewDocumentStore()

	uri1 := "file:///a.yaml"
	uri2 := "file:///b.yaml"

	store.Open(uri1, "yaml", 1, "aaa")
	store.Open(uri2, "yaml", 1, "bbb")

	doc1 := store.Get(uri1)
	doc2 := store.Get(uri2)

	if doc1 == nil || doc2 == nil {
		t.Fatal("expected both documents to exist")
	}
	if doc1.Content != "aaa" {
		t.Errorf("doc1 Content: got %q, want %q", doc1.Content, "aaa")
	}
	if doc2.Content != "bbb" {
		t.Errorf("doc2 Content: got %q, want %q", doc2.Content, "bbb")
	}

	// Close one, other should remain
	store.Close(uri1)
	if store.Get(uri1) != nil {
		t.Error("uri1 should be gone after Close")
	}
	if store.Get(uri2) == nil {
		t.Error("uri2 should still exist")
	}
}

func TestDocumentStoreConcurrentAccess(t *testing.T) {
	store := NewDocumentStore()

	var wg sync.WaitGroup
	const numGoroutines = 100

	// Concurrent opens
	for i := 0; i < numGoroutines; i++ {
		wg.Add(1)
		go func(n int) {
			defer wg.Done()
			uri := "file:///concurrent.yaml"
			store.Open(uri, "yaml", n, "content")
		}(i)
	}
	wg.Wait()

	// Should have exactly one document (last write wins)
	doc := store.Get("file:///concurrent.yaml")
	if doc == nil {
		t.Fatal("expected document after concurrent opens")
	}

	// Concurrent reads + writes
	for i := 0; i < numGoroutines; i++ {
		wg.Add(2)
		go func(n int) {
			defer wg.Done()
			store.Update("file:///concurrent.yaml", n, "updated")
		}(i)
		go func() {
			defer wg.Done()
			store.Get("file:///concurrent.yaml")
		}()
	}
	wg.Wait()
}

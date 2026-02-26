package lsp

import (
	"net/url"
	"strings"
	"sync"
)

// Document represents an open text document in the editor.
type Document struct {
	URI          string // LSP document URI (file:///path/to/file.yaml)
	LanguageID   string // e.g., "yaml"
	Version      int    // Document version (incremented on each change)
	Content      string // Current full content of the document
	ArtifactType string // Detected EPF artifact type, or "" if not EPF
}

// FilePath returns the filesystem path from the document URI.
// Returns the URI as-is if it can't be parsed.
func (d *Document) FilePath() string {
	return URIToPath(d.URI)
}

// IsYAML returns true if the document appears to be a YAML file.
func (d *Document) IsYAML() bool {
	path := d.FilePath()
	return strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")
}

// DocumentStore manages open documents in the LSP session.
// It is safe for concurrent access.
type DocumentStore struct {
	mu   sync.RWMutex
	docs map[string]*Document // keyed by URI
}

// NewDocumentStore creates a new empty document store.
func NewDocumentStore() *DocumentStore {
	return &DocumentStore{
		docs: make(map[string]*Document),
	}
}

// Open adds a document to the store or replaces an existing one.
func (s *DocumentStore) Open(uri, languageID string, version int, content string) *Document {
	doc := &Document{
		URI:        uri,
		LanguageID: languageID,
		Version:    version,
		Content:    content,
	}
	s.mu.Lock()
	s.docs[uri] = doc
	s.mu.Unlock()
	return doc
}

// Update replaces the content and version of an existing document.
// Returns the updated document, or nil if the document is not open.
func (s *DocumentStore) Update(uri string, version int, content string) *Document {
	s.mu.Lock()
	defer s.mu.Unlock()
	doc, ok := s.docs[uri]
	if !ok {
		return nil
	}
	doc.Version = version
	doc.Content = content
	return doc
}

// Close removes a document from the store.
func (s *DocumentStore) Close(uri string) {
	s.mu.Lock()
	delete(s.docs, uri)
	s.mu.Unlock()
}

// Get retrieves a document by URI. Returns nil if not found.
func (s *DocumentStore) Get(uri string) *Document {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.docs[uri]
}

// URIToPath converts a file:// URI to a filesystem path.
func URIToPath(uri string) string {
	parsed, err := url.Parse(uri)
	if err != nil {
		return uri
	}
	if parsed.Scheme == "file" {
		return parsed.Path
	}
	return uri
}

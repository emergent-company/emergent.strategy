// Token store for persisting CLI authentication credentials.
//
// Credentials are stored in ~/.config/epf-cli/auth.json keyed by server URL.
// Each server entry contains the session JWT, user metadata, and optional
// selected instance path.
//
// The file is created with 0600 permissions (owner read/write only).
// Same security model as gh, gcloud, and aws CLI tools.
package auth

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"
)

// DefaultTokenStoreDir is the default directory for the token store.
const DefaultTokenStoreDir = ".config/epf-cli"

// DefaultTokenStoreFile is the default filename for the token store.
const DefaultTokenStoreFile = "auth.json"

// TokenStoreEntry is a single server's stored credentials.
type TokenStoreEntry struct {
	// Token is the server session JWT.
	Token string `json:"token"`

	// Username is the GitHub username.
	Username string `json:"username"`

	// UserID is the GitHub user ID.
	UserID int64 `json:"user_id"`

	// InstancePath is the selected workspace instance path (e.g., "emergent-company/emergent-epf").
	// Empty if no workspace has been selected yet.
	InstancePath string `json:"instance_path,omitempty"`

	// AuthenticatedAt is when the token was obtained.
	AuthenticatedAt time.Time `json:"authenticated_at"`
}

// TokenStoreData is the top-level structure of auth.json.
type TokenStoreData struct {
	Servers map[string]*TokenStoreEntry `json:"servers"`
}

// TokenStore manages reading and writing the local credential store.
type TokenStore struct {
	// path is the full path to auth.json.
	path string
}

// NewTokenStore creates a new TokenStore using the default path.
// (~/.config/epf-cli/auth.json)
func NewTokenStore() *TokenStore {
	home, err := os.UserHomeDir()
	if err != nil {
		home = "."
	}
	return &TokenStore{
		path: filepath.Join(home, DefaultTokenStoreDir, DefaultTokenStoreFile),
	}
}

// NewTokenStoreAt creates a TokenStore at a specific path (for testing).
func NewTokenStoreAt(path string) *TokenStore {
	return &TokenStore{path: path}
}

// Path returns the full path to the token store file.
func (s *TokenStore) Path() string {
	return s.path
}

// Get retrieves the stored credentials for a server URL.
// Returns nil if no credentials exist for the server.
func (s *TokenStore) Get(serverURL string) (*TokenStoreEntry, error) {
	data, err := s.load()
	if err != nil {
		return nil, err
	}

	entry, ok := data.Servers[serverURL]
	if !ok {
		return nil, nil
	}

	return entry, nil
}

// Set stores credentials for a server URL.
// Creates the directory and file if they don't exist.
func (s *TokenStore) Set(serverURL string, entry *TokenStoreEntry) error {
	data, err := s.load()
	if err != nil {
		return err
	}

	data.Servers[serverURL] = entry
	return s.save(data)
}

// Delete removes stored credentials for a server URL.
func (s *TokenStore) Delete(serverURL string) error {
	data, err := s.load()
	if err != nil {
		return err
	}

	delete(data.Servers, serverURL)
	return s.save(data)
}

// List returns all server URLs that have stored credentials.
func (s *TokenStore) List() ([]string, error) {
	data, err := s.load()
	if err != nil {
		return nil, err
	}

	urls := make([]string, 0, len(data.Servers))
	for url := range data.Servers {
		urls = append(urls, url)
	}
	return urls, nil
}

// SetInstancePath updates just the instance_path for a server entry.
// Returns an error if no entry exists for the server URL.
func (s *TokenStore) SetInstancePath(serverURL, instancePath string) error {
	data, err := s.load()
	if err != nil {
		return err
	}

	entry, ok := data.Servers[serverURL]
	if !ok {
		return fmt.Errorf("no credentials stored for %s", serverURL)
	}

	entry.InstancePath = instancePath
	return s.save(data)
}

// load reads the token store from disk.
// Returns an empty store if the file doesn't exist.
func (s *TokenStore) load() (*TokenStoreData, error) {
	f, err := os.Open(s.path)
	if err != nil {
		if os.IsNotExist(err) {
			// File doesn't exist yet — return empty store.
			return &TokenStoreData{
				Servers: make(map[string]*TokenStoreEntry),
			}, nil
		}
		return nil, fmt.Errorf("token store: open %s: %w", s.path, err)
	}
	defer f.Close()

	var data TokenStoreData
	if err := json.NewDecoder(f).Decode(&data); err != nil {
		return nil, fmt.Errorf("token store: parse %s: %w", s.path, err)
	}

	if data.Servers == nil {
		data.Servers = make(map[string]*TokenStoreEntry)
	}

	return &data, nil
}

// save writes the token store to disk with 0600 permissions.
func (s *TokenStore) save(data *TokenStoreData) error {
	// Ensure the directory exists.
	dir := filepath.Dir(s.path)
	if err := os.MkdirAll(dir, 0700); err != nil {
		return fmt.Errorf("token store: create directory %s: %w", dir, err)
	}

	// Marshal with indentation for human readability.
	content, err := json.MarshalIndent(data, "", "  ")
	if err != nil {
		return fmt.Errorf("token store: marshal: %w", err)
	}

	// Write atomically: write to temp file, then rename.
	tmpPath := s.path + ".tmp"
	if err := os.WriteFile(tmpPath, content, 0600); err != nil {
		return fmt.Errorf("token store: write %s: %w", tmpPath, err)
	}

	if err := os.Rename(tmpPath, s.path); err != nil {
		// Clean up tmp file on rename failure.
		os.Remove(tmpPath)
		return fmt.Errorf("token store: rename %s → %s: %w", tmpPath, s.path, err)
	}

	return nil
}

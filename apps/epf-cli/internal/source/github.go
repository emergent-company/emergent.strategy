package source

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"path"
	"sort"
	"strings"
	"time"
)

// TokenFunc returns a bearer token for GitHub API authentication.
// It is called on each request, allowing for token rotation.
type TokenFunc func() (string, error)

// GitHubSource implements Source by reading from a GitHub repository
// via the Contents API (https://docs.github.com/en/rest/repos/contents).
//
// Paths are relative to the configured base path within the repository.
// For example, if basePath is "docs/EPF/_instances/emergent" and ReadFile
// is called with "READY/00_north_star.yaml", the API request targets
// "docs/EPF/_instances/emergent/READY/00_north_star.yaml".
type GitHubSource struct {
	owner    string
	repo     string
	ref      string // branch, tag, or commit SHA (default: repo default branch)
	basePath string // path prefix within the repo
	tokenFn  TokenFunc
	client   *http.Client
}

// GitHubOption configures a GitHubSource.
type GitHubOption func(*GitHubSource)

// WithRef sets the Git ref (branch, tag, or SHA) to read from.
func WithRef(ref string) GitHubOption {
	return func(s *GitHubSource) {
		s.ref = ref
	}
}

// WithBasePath sets the path prefix within the repository.
func WithBasePath(basePath string) GitHubOption {
	return func(s *GitHubSource) {
		s.basePath = strings.TrimSuffix(basePath, "/")
	}
}

// WithHTTPClient sets a custom HTTP client (useful for testing).
func WithHTTPClient(c *http.Client) GitHubOption {
	return func(s *GitHubSource) {
		s.client = c
	}
}

// NewGitHubSource creates a Source that reads from a GitHub repository.
// tokenFn is called before each API request to obtain a bearer token.
// Pass nil for tokenFn to make unauthenticated requests (rate-limited).
func NewGitHubSource(owner, repo string, tokenFn TokenFunc, opts ...GitHubOption) *GitHubSource {
	s := &GitHubSource{
		owner:   owner,
		repo:    repo,
		tokenFn: tokenFn,
		client: &http.Client{
			Timeout: 30 * time.Second,
		},
	}
	for _, opt := range opts {
		opt(s)
	}
	return s
}

// ghContentsEntry represents a single entry from the GitHub Contents API.
type ghContentsEntry struct {
	Name        string `json:"name"`
	Path        string `json:"path"`
	Type        string `json:"type"` // "file" or "dir"
	Size        int64  `json:"size"`
	Content     string `json:"content"`  // base64-encoded, only for file responses
	Encoding    string `json:"encoding"` // "base64" for file content
	SHA         string `json:"sha"`
	DownloadURL string `json:"download_url"`
}

// fullPath joins the basePath with the given relative path.
func (s *GitHubSource) fullPath(relPath string) string {
	if s.basePath == "" {
		return relPath
	}
	if relPath == "" || relPath == "." {
		return s.basePath
	}
	return s.basePath + "/" + relPath
}

// apiURL builds the Contents API URL for a given repo-relative path.
func (s *GitHubSource) apiURL(repoPath string) string {
	u := fmt.Sprintf("https://api.github.com/repos/%s/%s/contents/%s",
		s.owner, s.repo, repoPath)
	if s.ref != "" {
		u += "?ref=" + s.ref
	}
	return u
}

// doRequest performs an authenticated GET request to the GitHub API.
func (s *GitHubSource) doRequest(url string) ([]byte, int, error) {
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, 0, fmt.Errorf("github: create request: %w", err)
	}

	req.Header.Set("Accept", "application/vnd.github.v3+json")
	req.Header.Set("User-Agent", "epf-cli")

	if s.tokenFn != nil {
		token, err := s.tokenFn()
		if err != nil {
			return nil, 0, fmt.Errorf("github: get token: %w", err)
		}
		if token != "" {
			req.Header.Set("Authorization", "Bearer "+token)
		}
	}

	resp, err := s.client.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("github: request %s: %w", url, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, resp.StatusCode, fmt.Errorf("github: read body: %w", err)
	}

	return body, resp.StatusCode, nil
}

// fetchFile fetches a single file's content from the Contents API.
func (s *GitHubSource) fetchFile(repoPath string) ([]byte, *ghContentsEntry, error) {
	url := s.apiURL(repoPath)
	body, status, err := s.doRequest(url)
	if err != nil {
		return nil, nil, err
	}

	if status == 404 {
		return nil, nil, &fs.PathError{
			Op:   "read",
			Path: repoPath,
			Err:  fs.ErrNotExist,
		}
	}
	if status != 200 {
		return nil, nil, fmt.Errorf("github: GET %s returned %d: %s", repoPath, status, string(body))
	}

	var entry ghContentsEntry
	if err := json.Unmarshal(body, &entry); err != nil {
		return nil, nil, fmt.Errorf("github: parse response for %s: %w", repoPath, err)
	}

	if entry.Type == "dir" {
		return nil, nil, fmt.Errorf("github: %s is a directory, not a file", repoPath)
	}

	if entry.Encoding != "base64" || entry.Content == "" {
		return nil, nil, fmt.Errorf("github: unexpected encoding %q for %s", entry.Encoding, repoPath)
	}

	decoded, err := base64.StdEncoding.DecodeString(
		strings.ReplaceAll(entry.Content, "\n", ""),
	)
	if err != nil {
		return nil, nil, fmt.Errorf("github: decode base64 for %s: %w", repoPath, err)
	}

	return decoded, &entry, nil
}

// fetchDir fetches directory listing from the Contents API.
func (s *GitHubSource) fetchDir(repoPath string) ([]ghContentsEntry, error) {
	url := s.apiURL(repoPath)
	body, status, err := s.doRequest(url)
	if err != nil {
		return nil, err
	}

	if status == 404 {
		return nil, &fs.PathError{
			Op:   "readdir",
			Path: repoPath,
			Err:  fs.ErrNotExist,
		}
	}
	if status != 200 {
		return nil, fmt.Errorf("github: GET %s returned %d: %s", repoPath, status, string(body))
	}

	var entries []ghContentsEntry
	if err := json.Unmarshal(body, &entries); err != nil {
		// The API returns a single object for files, array for dirs.
		// If we got a single object, the caller asked for a file path.
		var single ghContentsEntry
		if jsonErr := json.Unmarshal(body, &single); jsonErr == nil && single.Type == "file" {
			return nil, fmt.Errorf("github: %s is a file, not a directory", repoPath)
		}
		return nil, fmt.Errorf("github: parse directory listing for %s: %w", repoPath, err)
	}

	return entries, nil
}

// ReadFile returns the contents of the named file.
func (s *GitHubSource) ReadFile(relPath string) ([]byte, error) {
	data, _, err := s.fetchFile(s.fullPath(relPath))
	return data, err
}

// ReadDir returns the directory entries sorted by name.
func (s *GitHubSource) ReadDir(relPath string) ([]fs.DirEntry, error) {
	entries, err := s.fetchDir(s.fullPath(relPath))
	if err != nil {
		return nil, err
	}

	dirEntries := make([]fs.DirEntry, len(entries))
	for i, e := range entries {
		dirEntries[i] = &ghDirEntry{entry: e}
	}
	sort.Slice(dirEntries, func(i, j int) bool {
		return dirEntries[i].Name() < dirEntries[j].Name()
	})

	return dirEntries, nil
}

// Stat returns file info for the named path.
func (s *GitHubSource) Stat(relPath string) (fs.FileInfo, error) {
	repoPath := s.fullPath(relPath)
	url := s.apiURL(repoPath)
	body, status, err := s.doRequest(url)
	if err != nil {
		return nil, err
	}

	if status == 404 {
		return nil, &fs.PathError{
			Op:   "stat",
			Path: relPath,
			Err:  fs.ErrNotExist,
		}
	}
	if status != 200 {
		return nil, fmt.Errorf("github: stat %s returned %d: %s", repoPath, status, string(body))
	}

	// Try parsing as a single entry first (file).
	var entry ghContentsEntry
	if err := json.Unmarshal(body, &entry); err == nil && entry.Name != "" {
		return &ghFileInfo{entry: entry}, nil
	}

	// If it's an array, it's a directory.
	var entries []ghContentsEntry
	if err := json.Unmarshal(body, &entries); err == nil {
		// Return synthetic directory info.
		name := path.Base(repoPath)
		if name == "." || name == "" {
			name = s.repo
		}
		return &ghFileInfo{
			entry: ghContentsEntry{
				Name: name,
				Path: repoPath,
				Type: "dir",
			},
		}, nil
	}

	return nil, fmt.Errorf("github: could not parse stat response for %s", repoPath)
}

// Walk walks the file tree by recursively listing directories via the API.
// This is expensive — prefer targeted ReadFile/ReadDir calls when possible.
func (s *GitHubSource) Walk(root string, fn fs.WalkDirFunc) error {
	repoRoot := s.fullPath(root)
	return s.walkRecursive(repoRoot, root, fn)
}

func (s *GitHubSource) walkRecursive(repoPath, relPath string, fn fs.WalkDirFunc) error {
	// First, call fn for the root directory itself.
	dirInfo := &ghDirEntry{
		entry: ghContentsEntry{
			Name: path.Base(relPath),
			Path: repoPath,
			Type: "dir",
		},
	}
	if err := fn(relPath, dirInfo, nil); err != nil {
		if err == fs.SkipDir {
			return nil
		}
		return err
	}

	// List the directory.
	entries, err := s.fetchDir(repoPath)
	if err != nil {
		// Report the error to fn.
		if walkErr := fn(relPath, dirInfo, err); walkErr != nil {
			return walkErr
		}
		return nil
	}

	// Sort entries by name for consistent ordering.
	sort.Slice(entries, func(i, j int) bool {
		return entries[i].Name < entries[j].Name
	})

	for _, entry := range entries {
		childRel := relPath + "/" + entry.Name
		if relPath == "" || relPath == "." {
			childRel = entry.Name
		}
		childRepo := repoPath + "/" + entry.Name

		de := &ghDirEntry{entry: entry}

		if entry.Type == "dir" {
			if err := s.walkRecursive(childRepo, childRel, fn); err != nil {
				return err
			}
		} else {
			if err := fn(childRel, de, nil); err != nil {
				if err == fs.SkipDir {
					// SkipDir on a file is ignored per WalkDir contract.
					continue
				}
				return err
			}
		}
	}

	return nil
}

// Root returns a synthetic root identifier.
func (s *GitHubSource) Root() string {
	root := fmt.Sprintf("github://%s/%s", s.owner, s.repo)
	if s.basePath != "" {
		root += "/" + s.basePath
	}
	return root
}

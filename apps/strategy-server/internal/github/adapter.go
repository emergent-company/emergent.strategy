package github

import (
	"context"
	"errors"
	"fmt"
	gosync "sync"
	"strings"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
)

// RepoWriterAdapter adapts *Client to the sync.RepoWriter interface.
type RepoWriterAdapter struct {
	client *Client
}

// NewRepoWriterAdapter wraps a Client as a sync.RepoWriter.
func NewRepoWriterAdapter(c *Client) sync.RepoWriter {
	return &RepoWriterAdapter{client: c}
}

// RepoReaderAdapter adapts *Client to the sync.RepoReader interface.
type RepoReaderAdapter struct {
	client *Client
}

// NewRepoReaderAdapter wraps a Client as a sync.RepoReader.
func NewRepoReaderAdapter(c *Client) sync.RepoReader {
	return &RepoReaderAdapter{client: c}
}

func (a *RepoReaderAdapter) GetInstallationToken(ctx context.Context, owner string) (string, error) {
	return a.client.GetInstallationToken(ctx, owner)
}

func (a *RepoReaderAdapter) GetDefaultBranch(ctx context.Context, token, owner, repo string) (string, error) {
	return a.client.GetDefaultBranch(ctx, token, owner, repo)
}

func (a *RepoReaderAdapter) GetHeadCommitSHA(ctx context.Context, token, owner, repo, branch string) (string, error) {
	return a.client.GetHeadCommitSHA(ctx, token, owner, repo, branch)
}

// ListFiles returns paths of all YAML/YML files in the tree under basePath on the given branch.
func (a *RepoReaderAdapter) ListFiles(ctx context.Context, token, owner, repo, branch, basePath string) ([]string, error) {
	entries, err := a.client.GetTree(ctx, token, owner, repo, branch)
	if err != nil {
		return nil, err
	}

	var paths []string
	for _, e := range entries {
		if e.Type != "blob" {
			continue
		}
		if !isYAML(e.Path) {
			continue
		}
		if basePath != "" {
			prefix := strings.TrimSuffix(basePath, "/") + "/"
			if !strings.HasPrefix(e.Path, prefix) {
				continue
			}
		}
		paths = append(paths, e.Path)
	}
	return paths, nil
}

// GetFileContent fetches the raw bytes of a file by its tree path on a branch.
func (a *RepoReaderAdapter) GetFileContent(ctx context.Context, token, owner, repo, branch, path string) ([]byte, error) {
	// We need the blob SHA for the path. Get the tree again to resolve it.
	// In production this is called per-file after ListFiles, so the tree is already fetched.
	// A future optimisation could cache the tree within a single import operation.
	entries, err := a.client.GetTree(ctx, token, owner, repo, branch)
	if err != nil {
		return nil, err
	}

	for _, e := range entries {
		if e.Path == path && e.Type == "blob" {
			return a.client.GetBlob(ctx, token, owner, repo, e.SHA)
		}
	}
	return nil, fmt.Errorf("file not found in tree: %s", path)
}

// GetAllFileContents fetches the tree once, then downloads all YAML blobs in parallel.
// This avoids the N+1 problem of calling GetFileContent (which re-fetches the tree) per file.
func (a *RepoReaderAdapter) GetAllFileContents(ctx context.Context, token, owner, repo, branch, basePath string) (map[string][]byte, error) {
	entries, err := a.client.GetTree(ctx, token, owner, repo, branch)
	if err != nil {
		return nil, err
	}

	prefix := ""
	if basePath != "" {
		prefix = strings.TrimSuffix(basePath, "/") + "/"
	}

	// Collect blob entries that are YAML and under basePath.
	type blobEntry struct {
		path string
		sha  string
	}
	var blobs []blobEntry
	for _, e := range entries {
		if e.Type != "blob" {
			continue
		}
		if !isYAML(e.Path) {
			continue
		}
		if prefix != "" && !strings.HasPrefix(e.Path, prefix) {
			continue
		}
		blobs = append(blobs, blobEntry{path: e.Path, sha: e.SHA})
	}

	if len(blobs) == 0 {
		return map[string][]byte{}, nil
	}

	// Fetch blobs in parallel with a concurrency cap.
	const maxConcurrent = 10
	sem := make(chan struct{}, maxConcurrent)
	results := make(map[string][]byte, len(blobs))
	var mu gosync.Mutex
	var fetchErr error
	var wg gosync.WaitGroup

	for _, b := range blobs {
		b := b
		wg.Add(1)
		sem <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			content, err := a.client.GetBlob(ctx, token, owner, repo, b.sha)
			mu.Lock()
			defer mu.Unlock()
			if err != nil {
				fetchErr = fmt.Errorf("fetch blob %s: %w", b.path, err)
				return
			}
			// Strip basePath prefix to get repo-relative path for the parser.
			relPath := b.path
			if prefix != "" {
				relPath = strings.TrimPrefix(b.path, prefix)
			}
			results[relPath] = content
		}()
	}
	wg.Wait()

	if fetchErr != nil {
		return nil, fetchErr
	}
	return results, nil
}

func (a *RepoReaderAdapter) GetPullRequestState(ctx context.Context, token, owner, repo string, prNumber int) (string, error) {
	return a.client.GetPullRequestState(ctx, token, owner, repo, prNumber)
}

// ListUserRepos delegates to the user-token-scoped repo list (repo scope, all orgs).
// Rate limit errors are translated to sync.RateLimitError so the handler can show
// a clean retry UI without exposing raw GitHub API error messages.
func (a *RepoReaderAdapter) ListUserRepos(ctx context.Context, userToken string) ([]sync.UserRepoInfo, error) {
	repos, err := a.client.ListUserRepos(ctx, userToken)
	if err != nil {
		var rle *RateLimitError
		if errors.As(err, &rle) {
			return nil, &sync.RateLimitError{
				RetryAfter: time.Until(rle.ResetAt).Round(time.Second),
				Message:    rle.Error(),
			}
		}
		return nil, err
	}
	out := make([]sync.UserRepoInfo, len(repos))
	for i, r := range repos {
		out[i] = sync.UserRepoInfo{
			Name:          r.Name,
			FullName:      r.FullName,
			Owner:         r.Owner,
			HTMLURL:       r.HTMLURL,
			DefaultBranch: r.DefaultBranch,
			Private:       r.Private,
			Description:   r.Description,
			PushedAt:      r.PushedAt,
		}
	}
	return out, nil
}

// ListUserInstallations delegates to the user-token-scoped client method.
func (a *RepoReaderAdapter) ListUserInstallations(ctx context.Context, userToken string) ([]sync.InstallationInfo, error) {
	installs, err := a.client.ListUserInstallations(ctx, userToken)
	if err != nil {
		return nil, err
	}
	out := make([]sync.InstallationInfo, len(installs))
	for i, ins := range installs {
		out[i] = sync.InstallationInfo{
			ID:         ins.ID,
			OwnerLogin: ins.OwnerLogin,
			OwnerType:  ins.OwnerType,
			HTMLURL:    ins.HTMLURL,
		}
	}
	return out, nil
}

// ListInstallations delegates to the App-level client method (uses App JWT internally).
func (a *RepoReaderAdapter) ListInstallations(ctx context.Context) ([]sync.InstallationInfo, error) {
	installs, err := a.client.ListInstallations(ctx)
	if err != nil {
		return nil, err
	}
	out := make([]sync.InstallationInfo, len(installs))
	for i, ins := range installs {
		out[i] = sync.InstallationInfo{
			ID:         ins.ID,
			OwnerLogin: ins.OwnerLogin,
			OwnerType:  ins.OwnerType,
			HTMLURL:    ins.HTMLURL,
		}
	}
	return out, nil
}

// ListInstallationRepos delegates to the client using the provided installation token.
func (a *RepoReaderAdapter) ListInstallationRepos(ctx context.Context, token string) ([]sync.RepoInfo, error) {
	repos, err := a.client.ListInstallationRepos(ctx, token)
	if err != nil {
		return nil, err
	}
	out := make([]sync.RepoInfo, len(repos))
	for i, r := range repos {
		out[i] = sync.RepoInfo{
			Name:          r.Name,
			FullName:      r.FullName,
			HTMLURL:       r.HTMLURL,
			DefaultBranch: r.DefaultBranch,
			Private:       r.Private,
		}
	}
	return out, nil
}

// DetectEPFInRepo delegates to the client's two-pass EPF detection.
func (a *RepoReaderAdapter) DetectEPFInRepo(ctx context.Context, token, owner, repo, branch string) ([]sync.DetectedEPFInstance, []sync.SubmoduleRef, bool, sync.RepoCommitInfo, error) {
	detected, submodules, truncated, ci, err := a.client.DetectEPFInRepo(ctx, token, owner, repo, branch)
	if err != nil {
		return nil, nil, false, sync.RepoCommitInfo{}, err
	}
	out := make([]sync.DetectedEPFInstance, len(detected))
	for i, d := range detected {
		out[i] = sync.DetectedEPFInstance{
			BasePath:      d.BasePath,
			HasMetaFile:   d.HasMetaFile,
			IsSubmodule:   d.IsSubmodule,
			SubmoduleSlug: d.SubmoduleSlug,
		}
	}
	refs := make([]sync.SubmoduleRef, len(submodules))
	for i, s := range submodules {
		refs[i] = sync.SubmoduleRef{
			Path:     s.Path,
			URL:      s.URL,
			RepoSlug: s.RepoSlug,
		}
	}
	commit := sync.RepoCommitInfo{
		SHA:        ci.SHA,
		Message:    ci.Message,
		AuthorName: ci.AuthorName,
		AuthoredAt: ci.AuthoredAt,
	}
	return out, refs, truncated, commit, nil
}

func isYAML(path string) bool {
	return strings.HasSuffix(path, ".yaml") || strings.HasSuffix(path, ".yml")
}

func (a *RepoWriterAdapter) GetInstallationToken(ctx context.Context, owner string) (string, error) {
	return a.client.GetInstallationToken(ctx, owner)
}

func (a *RepoWriterAdapter) GetDefaultBranch(ctx context.Context, token, owner, repo string) (string, error) {
	return a.client.GetDefaultBranch(ctx, token, owner, repo)
}

func (a *RepoWriterAdapter) CreateBranch(ctx context.Context, token, owner, repo, baseBranch, newBranch string) error {
	return a.client.CreateBranch(ctx, token, owner, repo, baseBranch, newBranch)
}

func (a *RepoWriterAdapter) CommitFiles(ctx context.Context, token, owner, repo, branch string, files []sync.FileEntry, message string) error {
	ghFiles := make([]FileEntry, len(files))
	for i, f := range files {
		ghFiles[i] = FileEntry{Path: f.Path, Content: f.Content}
	}
	return a.client.CommitFiles(ctx, token, owner, repo, branch, ghFiles, message)
}

func (a *RepoWriterAdapter) CreatePullRequest(ctx context.Context, token, owner, repo, head, base, title, body string) (*sync.PRResult, error) {
	result, err := a.client.CreatePullRequest(ctx, token, owner, repo, head, base, title, body)
	if err != nil {
		return nil, err
	}
	return &sync.PRResult{
		Number: result.Number,
		URL:    result.URL,
	}, nil
}

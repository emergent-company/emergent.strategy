package github

import (
	"context"

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

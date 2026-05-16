// Package github provides a GitHub App client for creating branches, commits, and PRs.
//
// The client authenticates as a GitHub App installation, generating short-lived
// tokens per-organisation. This is the infrastructure layer — the domain service
// in domain/sync/ uses the RepoWriter interface and never imports this package.
package github

import (
	"context"
	"crypto/rsa"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/golang-jwt/jwt/v5"
	gh "github.com/google/go-github/v68/github"
)

// Client wraps a GitHub App identity and provides methods for repo operations.
type Client struct {
	appID      int64
	privateKey *rsa.PrivateKey
	httpClient *http.Client // overridable for testing
}

// Config holds the GitHub App credentials.
type Config struct {
	AppID          int64
	PrivateKeyPath string
	// HTTPClient overrides the default HTTP client (used in tests).
	HTTPClient *http.Client
}

// NewClient creates a GitHub App client from the given config.
func NewClient(cfg Config) (*Client, error) {
	keyData, err := os.ReadFile(cfg.PrivateKeyPath)
	if err != nil {
		return nil, fmt.Errorf("read github app private key: %w", err)
	}
	key, err := jwt.ParseRSAPrivateKeyFromPEM(keyData)
	if err != nil {
		return nil, fmt.Errorf("parse github app private key: %w", err)
	}

	httpClient := cfg.HTTPClient
	if httpClient == nil {
		httpClient = &http.Client{Timeout: 30 * time.Second}
	}

	return &Client{
		appID:      cfg.AppID,
		privateKey: key,
		httpClient: httpClient,
	}, nil
}

// newClientFromKey creates a client from an already-parsed key (for testing).
func newClientFromKey(appID int64, key *rsa.PrivateKey, httpClient *http.Client) *Client {
	return &Client{
		appID:      appID,
		privateKey: key,
		httpClient: httpClient,
	}
}

// ---------------------------------------------------------------------------
// JWT generation
// ---------------------------------------------------------------------------

// generateJWT creates a short-lived JWT signed with the App's private key.
// GitHub requires the JWT for authenticating as the App itself (before
// exchanging for an installation token).
func (c *Client) generateJWT() (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now.Add(-60 * time.Second)), // clock skew
		ExpiresAt: jwt.NewNumericDate(now.Add(10 * time.Minute)),
		Issuer:    fmt.Sprintf("%d", c.appID),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(c.privateKey)
}

// ---------------------------------------------------------------------------
// Installation token
// ---------------------------------------------------------------------------

// GetInstallationToken finds the App installation for the given owner (org or
// user) and returns a short-lived installation access token.
func (c *Client) GetInstallationToken(ctx context.Context, owner string) (string, error) {
	jwtToken, err := c.generateJWT()
	if err != nil {
		return "", fmt.Errorf("generate jwt: %w", err)
	}

	// Create an App-authenticated client.
	appClient := c.ghClient(jwtToken)

	// Find the installation for this owner.
	installation, _, err := appClient.Apps.FindOrganizationInstallation(ctx, owner)
	if err != nil {
		// Try user installation as fallback.
		installation, _, err = appClient.Apps.FindUserInstallation(ctx, owner)
		if err != nil {
			return "", fmt.Errorf("find github app installation for %q: %w", owner, err)
		}
	}

	// Create an installation access token.
	token, _, err := appClient.Apps.CreateInstallationToken(ctx, installation.GetID(), nil)
	if err != nil {
		return "", fmt.Errorf("create installation token for %q: %w", owner, err)
	}

	return token.GetToken(), nil
}

// ---------------------------------------------------------------------------
// Branch operations
// ---------------------------------------------------------------------------

// CreateBranch creates a new branch from the given base branch.
func (c *Client) CreateBranch(ctx context.Context, token, owner, repo, baseBranch, newBranch string) error {
	client := c.ghClient(token)

	// Get the base branch SHA.
	ref, _, err := client.Git.GetRef(ctx, owner, repo, "refs/heads/"+baseBranch)
	if err != nil {
		return fmt.Errorf("get base branch %q: %w", baseBranch, err)
	}

	// Create the new branch.
	newRef := &gh.Reference{
		Ref:    gh.Ptr("refs/heads/" + newBranch),
		Object: &gh.GitObject{SHA: ref.Object.SHA},
	}
	_, _, err = client.Git.CreateRef(ctx, owner, repo, newRef)
	if err != nil {
		return fmt.Errorf("create branch %q: %w", newBranch, err)
	}

	slog.Info("created github branch", "owner", owner, "repo", repo, "branch", newBranch)
	return nil
}

// ---------------------------------------------------------------------------
// Commit files
// ---------------------------------------------------------------------------

// FileEntry is a single file to commit.
type FileEntry struct {
	Path    string // relative path in the repo (e.g. "FIRE/definitions/features/fd-001.yaml")
	Content string // file content
}

// CommitFiles creates a Git tree with all files and commits it to the branch.
// This uses the Git Data API (tree + commit + update ref) to push all files
// in a single commit, regardless of file count.
func (c *Client) CommitFiles(ctx context.Context, token, owner, repo, branch string, files []FileEntry, message string) error {
	client := c.ghClient(token)

	// Get the current branch ref.
	ref, _, err := client.Git.GetRef(ctx, owner, repo, "refs/heads/"+branch)
	if err != nil {
		return fmt.Errorf("get branch ref: %w", err)
	}
	parentSHA := ref.Object.GetSHA()

	// Get the parent commit's tree.
	parentCommit, _, err := client.Git.GetCommit(ctx, owner, repo, parentSHA)
	if err != nil {
		return fmt.Errorf("get parent commit: %w", err)
	}
	baseTreeSHA := parentCommit.Tree.GetSHA()

	// Build tree entries.
	entries := make([]*gh.TreeEntry, 0, len(files))
	for _, f := range files {
		entries = append(entries, &gh.TreeEntry{
			Path:    gh.Ptr(f.Path),
			Mode:    gh.Ptr("100644"),
			Type:    gh.Ptr("blob"),
			Content: gh.Ptr(f.Content),
		})
	}

	// Create a new tree.
	tree, _, err := client.Git.CreateTree(ctx, owner, repo, baseTreeSHA, entries)
	if err != nil {
		return fmt.Errorf("create tree: %w", err)
	}

	// Create the commit.
	commit := &gh.Commit{
		Message: gh.Ptr(message),
		Tree:    tree,
		Parents: []*gh.Commit{{SHA: gh.Ptr(parentSHA)}},
	}
	newCommit, _, err := client.Git.CreateCommit(ctx, owner, repo, commit, nil)
	if err != nil {
		return fmt.Errorf("create commit: %w", err)
	}

	// Update the branch ref.
	ref.Object.SHA = newCommit.SHA
	_, _, err = client.Git.UpdateRef(ctx, owner, repo, ref, false)
	if err != nil {
		return fmt.Errorf("update branch ref: %w", err)
	}

	slog.Info("committed files to github",
		"owner", owner, "repo", repo, "branch", branch,
		"files", len(files), "sha", newCommit.GetSHA())
	return nil
}

// ---------------------------------------------------------------------------
// Pull request
// ---------------------------------------------------------------------------

// PRResult contains the outcome of creating a pull request.
type PRResult struct {
	Number int
	URL    string
}

// CreatePullRequest opens a PR from head to base branch.
func (c *Client) CreatePullRequest(ctx context.Context, token, owner, repo, head, base, title, body string) (*PRResult, error) {
	client := c.ghClient(token)

	pr, _, err := client.PullRequests.Create(ctx, owner, repo, &gh.NewPullRequest{
		Title: gh.Ptr(title),
		Body:  gh.Ptr(body),
		Head:  gh.Ptr(head),
		Base:  gh.Ptr(base),
	})
	if err != nil {
		return nil, fmt.Errorf("create pull request: %w", err)
	}

	slog.Info("created github pull request",
		"owner", owner, "repo", repo, "number", pr.GetNumber(), "url", pr.GetHTMLURL())
	return &PRResult{
		Number: pr.GetNumber(),
		URL:    pr.GetHTMLURL(),
	}, nil
}

// ---------------------------------------------------------------------------
// GetDefaultBranch returns the default branch name for a repository.
// ---------------------------------------------------------------------------

func (c *Client) GetDefaultBranch(ctx context.Context, token, owner, repo string) (string, error) {
	client := c.ghClient(token)
	repository, _, err := client.Repositories.Get(ctx, owner, repo)
	if err != nil {
		return "", fmt.Errorf("get repository: %w", err)
	}
	return repository.GetDefaultBranch(), nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (c *Client) ghClient(token string) *gh.Client {
	httpClient := &http.Client{
		Transport: &tokenTransport{
			token: token,
			base:  c.httpClient.Transport,
		},
		Timeout: c.httpClient.Timeout,
	}
	return gh.NewClient(httpClient)
}

// tokenTransport injects a Bearer token into every request.
type tokenTransport struct {
	token string
	base  http.RoundTripper
}

func (t *tokenTransport) RoundTrip(req *http.Request) (*http.Response, error) {
	req2 := req.Clone(req.Context())
	req2.Header.Set("Authorization", "Bearer "+t.token)
	base := t.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(req2)
}

// ParseRepoSlug splits "owner/repo" into owner and repo.
func ParseRepoSlug(slug string) (owner, repo string, err error) {
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("invalid repo slug %q: expected owner/repo", slug)
	}
	return parts[0], parts[1], nil
}

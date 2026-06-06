// Package github provides a GitHub App client for creating branches, commits, and PRs.
//
// The client authenticates as a GitHub App installation, generating short-lived
// tokens per-organisation. This is the infrastructure layer — the domain service
// in domain/sync/ uses the RepoWriter interface and never imports this package.
package github

import (
	"context"
	"crypto/rsa"
	"encoding/base64"
	"errors"
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
	PrivateKeyPath string // path to PEM file on disk
	PrivateKeyPEM  string // inline PEM content (alternative to PrivateKeyPath)
	// HTTPClient overrides the default HTTP client (used in tests).
	HTTPClient *http.Client
}

// NewClient creates a GitHub App client from the given config.
// Either PrivateKeyPath or PrivateKeyPEM must be set.
func NewClient(cfg Config) (*Client, error) {
	var keyData []byte
	var err error
	switch {
	case cfg.PrivateKeyPEM != "":
		keyData = []byte(cfg.PrivateKeyPEM)
	case cfg.PrivateKeyPath != "":
		keyData, err = os.ReadFile(cfg.PrivateKeyPath)
		if err != nil {
			return nil, fmt.Errorf("read github app private key: %w", err)
		}
	default:
		return nil, fmt.Errorf("github app client: either PrivateKeyPath or PrivateKeyPEM must be set")
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
// Read operations
// ---------------------------------------------------------------------------

// TreeEntry is a single entry from the Git tree API.
type TreeEntry struct {
	Path string // repo-relative path, e.g. "docs/epf/READY/north_star.yaml"
	Type string // "blob" or "tree"
	SHA  string // object SHA
	Size int    // blob size in bytes (0 for trees)
}

// GetTree returns the full recursive file tree for a repository branch.
// Uses one API call (recursive=1) regardless of file count — more efficient
// than per-directory traversal for large repos.
func (c *Client) GetTree(ctx context.Context, token, owner, repo, branch string) ([]TreeEntry, error) {
	client := c.ghClient(token)

	// Resolve branch to commit SHA via the ref.
	ref, _, err := client.Git.GetRef(ctx, owner, repo, "refs/heads/"+branch)
	if err != nil {
		return nil, fmt.Errorf("get ref for branch %q: %w", branch, err)
	}
	commitSHA := ref.Object.GetSHA()

	// Get the commit to find the root tree SHA.
	commit, _, err := client.Git.GetCommit(ctx, owner, repo, commitSHA)
	if err != nil {
		return nil, fmt.Errorf("get commit %q: %w", commitSHA, err)
	}
	treeSHA := commit.Tree.GetSHA()

	// Fetch the full recursive tree.
	tree, _, err := client.Git.GetTree(ctx, owner, repo, treeSHA, true)
	if err != nil {
		return nil, fmt.Errorf("get tree for %q: %w", treeSHA, err)
	}

	entries := make([]TreeEntry, 0, len(tree.Entries))
	for _, e := range tree.Entries {
		entries = append(entries, TreeEntry{
			Path: e.GetPath(),
			Type: e.GetType(),
			SHA:  e.GetSHA(),
			Size: e.GetSize(),
		})
	}
	return entries, nil
}

// GetBlob fetches and decodes the content of a Git blob by SHA.
// GitHub returns blobs base64-encoded; this method handles decoding.
func (c *Client) GetBlob(ctx context.Context, token, owner, repo, sha string) ([]byte, error) {
	client := c.ghClient(token)

	blob, _, err := client.Git.GetBlob(ctx, owner, repo, sha)
	if err != nil {
		return nil, fmt.Errorf("get blob %q: %w", sha, err)
	}

	content := blob.GetContent()
	if content == "" {
		return nil, nil
	}

	if blob.GetEncoding() == "base64" {
		// Strip newlines inserted by GitHub's line-wrapped base64.
		cleaned := strings.ReplaceAll(content, "\n", "")
		decoded, err := base64.StdEncoding.DecodeString(cleaned)
		if err != nil {
			return nil, fmt.Errorf("decode blob %q: %w", sha, err)
		}
		return decoded, nil
	}

	return []byte(content), nil
}

// GetHeadCommitSHA returns the HEAD commit SHA for a branch.
func (c *Client) GetHeadCommitSHA(ctx context.Context, token, owner, repo, branch string) (string, error) {
	client := c.ghClient(token)

	ref, _, err := client.Git.GetRef(ctx, owner, repo, "refs/heads/"+branch)
	if err != nil {
		return "", fmt.Errorf("get ref for branch %q: %w", branch, err)
	}
	return ref.Object.GetSHA(), nil
}

// GetPullRequestState returns the state of a pull request: "open", "closed", or "merged".
func (c *Client) GetPullRequestState(ctx context.Context, token, owner, repo string, prNumber int) (string, error) {
	client := c.ghClient(token)

	pr, _, err := client.PullRequests.Get(ctx, owner, repo, prNumber)
	if err != nil {
		return "", fmt.Errorf("get pull request #%d: %w", prNumber, err)
	}

	if pr.GetMerged() {
		return "merged", nil
	}
	if pr.GetState() == "closed" {
		return "closed", nil
	}
	return "open", nil
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

// ---------------------------------------------------------------------------
// App-level: list installations
// ---------------------------------------------------------------------------

// Installation represents a GitHub App installation on an org or personal account.
type Installation struct {
	ID        int64  // installation ID (used internally to get tokens)
	OwnerLogin string // org login or personal account login, e.g. "acme-company"
	OwnerType  string // "Organization" or "User"
	HTMLURL    string // link to the installation on GitHub
}

// ListInstallations returns all installations of this GitHub App.
// Uses the App-level JWT (not an installation token) to call GET /app/installations.
func (c *Client) ListInstallations(ctx context.Context) ([]Installation, error) {
	jwtToken, err := c.generateJWT()
	if err != nil {
		return nil, fmt.Errorf("generate jwt: %w", err)
	}

	appClient := c.ghClient(jwtToken)

	var all []Installation
	opts := &gh.ListOptions{PerPage: 100}
	for {
		installs, resp, apiErr := appClient.Apps.ListInstallations(ctx, opts)
		if apiErr != nil {
			return nil, fmt.Errorf("list installations: %w", apiErr)
		}
		for _, i := range installs {
			all = append(all, Installation{
				ID:         i.GetID(),
				OwnerLogin: i.GetAccount().GetLogin(),
				OwnerType:  i.GetAccount().GetType(),
				HTMLURL:    i.GetHTMLURL(),
			})
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}
	return all, nil
}

// UserRepo is a repository returned by GET /user/repos — all repos the user
// has access to across all their orgs, regardless of App installation.
type UserRepo struct {
	Name          string
	FullName      string // "owner/repo"
	Owner         string // org or user login
	HTMLURL       string
	DefaultBranch string
	Private       bool
	Description   string    // repo description (may be empty)
	PushedAt      time.Time // time of last push (zero when not set)
}

// ListUserRepos returns all repositories the user has access to via their
// OAuth token (repo scope). Uses a two-pass approach:
//
// Pass 1: GET /user/repos — returns repos where the user is owner/collaborator/
// org member AND the org has approved this OAuth App.
//
// Pass 2: GET /user/orgs → GET /orgs/{org}/repos for each org — catches repos
// in orgs that restrict OAuth App access (403 on /user/repos but may allow
// org-level listing if the user has member access). Results are merged and
// deduplicated by full_name.
//
// NOTE: If an org has enabled OAuth App access restrictions and has NOT approved
// this app, private repos in that org will still be inaccessible. The user or
// an org admin must approve the OAuth App in the org's third-party access settings:
// github.com/organizations/{org}/settings/oauth_application_policy
func (c *Client) ListUserRepos(ctx context.Context, userToken string) ([]UserRepo, error) {
	client := c.ghClient(userToken)

	seen := make(map[string]bool)
	var all []UserRepo

	addRepo := func(r *gh.Repository) {
		key := r.GetFullName()
		if seen[key] {
			return
		}
		seen[key] = true
		var pushedAt time.Time
		if t := r.GetPushedAt(); !t.IsZero() {
			pushedAt = t.Time
		}
		all = append(all, UserRepo{
			Name:          r.GetName(),
			FullName:      r.GetFullName(),
			Owner:         r.GetOwner().GetLogin(),
			HTMLURL:       r.GetHTMLURL(),
			DefaultBranch: r.GetDefaultBranch(),
			Private:       r.GetPrivate(),
			Description:   r.GetDescription(),
			PushedAt:      pushedAt,
		})
	}

	// Pass 1: user repos (includes orgs that approved this OAuth App).
	opts := &gh.RepositoryListByAuthenticatedUserOptions{
		Affiliation: "owner,collaborator,organization_member",
		Sort:        "updated",
		ListOptions: gh.ListOptions{PerPage: 100},
	}
	for {
		repos, resp, apiErr := client.Repositories.ListByAuthenticatedUser(ctx, opts)
		if apiErr != nil {
			if rle := wrapRateLimitError(apiErr); rle != nil {
				return nil, fmt.Errorf("list user repos: %w", rle)
			}
			return nil, fmt.Errorf("list user repos: %w", apiErr)
		}
		for _, r := range repos {
			addRepo(r)
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}

	// Pass 2: enumerate orgs and fetch their repos directly.
	// This catches orgs that restrict OAuth App access but still allow org-level
	// repo listing for members.
	orgOpts := &gh.ListOptions{PerPage: 100}
	for {
		orgs, resp, orgErr := client.Organizations.List(ctx, "", orgOpts)
		if orgErr != nil {
			slog.WarnContext(ctx, "list user orgs failed (pass 2 skipped)", "err", orgErr)
			break
		}
		for _, org := range orgs {
			orgLogin := org.GetLogin()
			repoOpts := &gh.RepositoryListByOrgOptions{
				Type:        "all",
				ListOptions: gh.ListOptions{PerPage: 100},
			}
			for {
				repos, repoResp, repoErr := client.Repositories.ListByOrg(ctx, orgLogin, repoOpts)
				if repoErr != nil {
					// 403 = org restricts this OAuth App — expected, skip silently.
					slog.DebugContext(ctx, "org repos inaccessible (OAuth App not approved by org)",
						"org", orgLogin, "err", repoErr)
					break
				}
				for _, r := range repos {
					addRepo(r)
				}
				if repoResp.NextPage == 0 {
					break
				}
				repoOpts.Page = repoResp.NextPage
			}
		}
		if resp.NextPage == 0 {
			break
		}
		orgOpts.Page = resp.NextPage
	}

	return all, nil
}

// ListUserInstallations returns all GitHub App installations accessible to the
// user identified by userToken (a GitHub OAuth access token, not the App JWT).
// Uses GET /user/installations — returns only installations the user has access
// to, giving proper per-user scoping in multi-tenant deployments.
func (c *Client) ListUserInstallations(ctx context.Context, userToken string) ([]Installation, error) {
	client := c.ghClient(userToken)

	var all []Installation
	opts := &gh.ListOptions{PerPage: 100}
	for {
		installs, resp, apiErr := client.Apps.ListUserInstallations(ctx, opts)
		if apiErr != nil {
			return nil, fmt.Errorf("list user installations: %w", apiErr)
		}
		for _, i := range installs {
			all = append(all, Installation{
				ID:         i.GetID(),
				OwnerLogin: i.GetAccount().GetLogin(),
				OwnerType:  i.GetAccount().GetType(),
				HTMLURL:    i.GetHTMLURL(),
			})
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}
	return all, nil
}

// ---------------------------------------------------------------------------
// Installation repos
// ---------------------------------------------------------------------------

// InstallationRepo is a repository accessible via a GitHub App installation.
type InstallationRepo struct {
	Name          string // e.g. "strategy"
	FullName      string // e.g. "acme-company/strategy"
	HTMLURL       string
	DefaultBranch string
	Private       bool
}

// ListInstallationRepos lists all repos accessible to the installation identified
// by the given token (obtained from GetInstallationToken).
func (c *Client) ListInstallationRepos(ctx context.Context, token string) ([]InstallationRepo, error) {
	client := c.ghClient(token)

	var all []InstallationRepo
	opts := &gh.ListOptions{PerPage: 100}
	for {
		result, resp, apiErr := client.Apps.ListRepos(ctx, opts)
		if apiErr != nil {
			return nil, fmt.Errorf("list installation repos: %w", apiErr)
		}
		for _, r := range result.Repositories {
			all = append(all, InstallationRepo{
				Name:          r.GetName(),
				FullName:      r.GetFullName(),
				HTMLURL:       r.GetHTMLURL(),
				DefaultBranch: r.GetDefaultBranch(),
				Private:       r.GetPrivate(),
			})
		}
		if resp.NextPage == 0 {
			break
		}
		opts.Page = resp.NextPage
	}
	return all, nil
}

// ---------------------------------------------------------------------------
// EPF detection
// ---------------------------------------------------------------------------

// DetectedInstance is a single EPF instance found within a repository.
type DetectedInstance struct {
	BasePath    string // repo-relative base path, "" = root
	HasMetaFile bool   // true when _meta.yaml or _epf.yaml found alongside READY/
}

// CommitInfo holds summary information about a single git commit.
type CommitInfo struct {
	SHA       string    // full 40-char SHA
	Message   string    // first line of the commit message
	AuthorName string   // committer display name
	AuthoredAt time.Time
}

// RateLimitError is returned when a GitHub API call is rejected due to rate limiting.
// It carries the time at which the limit resets so callers can schedule a retry.
type RateLimitError struct {
	ResetAt time.Time
	Message string
}

func (e *RateLimitError) Error() string {
	remaining := time.Until(e.ResetAt).Round(time.Second)
	if remaining > 0 {
		return fmt.Sprintf("GitHub API rate limit exceeded — resets in %s", remaining)
	}
	return "GitHub API rate limit exceeded"
}

// wrapRateLimitError converts a go-github RateLimitError into our typed error.
func wrapRateLimitError(err error) error {
	var rle *gh.RateLimitError
	if errors.As(err, &rle) {
		return &RateLimitError{ResetAt: rle.Rate.Reset.Time, Message: rle.Message}
	}
	var arle *gh.AbuseRateLimitError
	if errors.As(err, &arle) {
		resetAt := time.Now().Add(time.Minute) // abuse limit: retry after 1 min by default
		if arle.RetryAfter != nil {
			resetAt = time.Now().Add(*arle.RetryAfter)
		}
		return &RateLimitError{ResetAt: resetAt, Message: "GitHub secondary rate limit exceeded"}
	}
	return nil
}

// SubmoduleRef is a git submodule declared in .gitmodules, resolved to its
// checkout path within the repo and the remote URL.
type SubmoduleRef struct {
	// Path is the repo-relative checkout path, e.g. "docs/EPF".
	Path string
	// URL is the remote URL, e.g. "git@github.com:eyedea-io/21st-epf.git"
	// or "https://github.com/eyedea-io/21st-epf".
	URL string
	// RepoSlug is the parsed "owner/repo" derived from URL, e.g. "eyedea-io/21st-epf".
	// Empty when the URL cannot be parsed as a GitHub URL.
	RepoSlug string
}

// epfRootMarkers are filenames that indicate EPF at the root of a directory.
var epfRootMarkers = []string{"_meta.yaml", "_epf.yaml", "north_star.yaml", "00_north_star.yaml"}

// epfIgnoreSegments are path segment names that indicate a directory is NOT a real EPF instance.
// Any base path containing one of these segments is filtered out as a false positive.
var epfIgnoreSegments = []string{
	// Test/dev artifacts
	"testdata",
	"testdata-empty",
	"_testdata",
	"fixtures",
	"__fixtures__",
	"node_modules",
	"vendor",
	// Go/language embedded dirs
	"embedded",
	// EPF framework directories — the framework itself lives alongside instances,
	// and its sub-directories contain READY/ placeholders that are not instances.
	"templates",
	"phases",
	"schemas",
	"wizards",
	"scripts",
	"definitions",
	"outputs",
	"migrations",
	"features",
	"_legacy",
}

// parseGitmodules parses a .gitmodules file and returns one SubmoduleRef per entry.
// The format is a git config INI-like file:
//
//	[submodule "docs/EPF"]
//	    path = docs/EPF
//	    url = git@github.com:eyedea-io/21st-epf.git
//
// Unrecognised lines and malformed blocks are silently skipped.
func parseGitmodules(data []byte) []SubmoduleRef {
	var refs []SubmoduleRef
	var current struct{ path, url string }

	flush := func() {
		if current.path != "" && current.url != "" {
			refs = append(refs, SubmoduleRef{
				Path:     current.path,
				URL:      current.url,
				RepoSlug: githubSlugFromURL(current.url),
			})
		}
		current.path, current.url = "", ""
	}

	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if strings.HasPrefix(line, "[submodule") {
			flush()
			continue
		}
		if k, v, ok := strings.Cut(line, "="); ok {
			k = strings.TrimSpace(k)
			v = strings.TrimSpace(v)
			switch k {
			case "path":
				current.path = v
			case "url":
				current.url = v
			}
		}
	}
	flush()
	return refs
}

// githubSlugFromURL extracts "owner/repo" from a GitHub remote URL.
// Supports https://github.com/owner/repo(.git) and git@github.com:owner/repo(.git).
func githubSlugFromURL(rawURL string) string {
	rawURL = strings.TrimSuffix(rawURL, ".git")
	// HTTPS
	if after, ok := strings.CutPrefix(rawURL, "https://github.com/"); ok {
		return after
	}
	// SSH
	if after, ok := strings.CutPrefix(rawURL, "git@github.com:"); ok {
		return after
	}
	return ""
}

// epfLikeSegments are path segment names that strongly suggest a submodule contains EPF content.
var epfLikeSegments = []string{"epf", "strategy", "epm", "product-framework"}

// isLikelyPureSubscriber returns true when all submodule refs have paths that look
// like EPF mounts (contain an EPF-like segment). Used to skip Pass 2 for repos
// that are clearly just subscribing to an EPF instance, not hosting one.
func isLikelyPureSubscriber(refs []SubmoduleRef) bool {
	if len(refs) == 0 {
		return false
	}
	for _, ref := range refs {
		parts := strings.Split(strings.ToLower(ref.Path), "/")
		found := false
		for _, part := range parts {
			for _, seg := range epfLikeSegments {
				if part == seg || strings.Contains(part, seg) {
					found = true
					break
				}
			}
			if found {
				break
			}
		}
		if !found {
			// At least one submodule doesn't look EPF-related — not a pure subscriber.
			return false
		}
	}
	return true
}

// isUnderSubmodule returns true when basePath is equal to or nested under any of
// the given submodule paths. GitHub tree API entries for submodules have type "commit".
// Example: basePath="docs/EPF/_instances/foo", submodulePaths=["docs/EPF"] → true.
func isUnderSubmodule(basePath string, submodulePaths []string) bool {
	for _, sub := range submodulePaths {
		if basePath == sub || strings.HasPrefix(basePath, sub+"/") {
			return true
		}
	}
	return false
}

// isIgnoredEPFBasePath returns true when the candidate base path contains a segment
// that indicates it is a test fixture, embedded schema dir, or other non-instance path.
func isIgnoredEPFBasePath(basePath string) bool {
	if basePath == "" {
		return false
	}
	parts := strings.Split(basePath, "/")
	for _, part := range parts {
		for _, ignore := range epfIgnoreSegments {
			if part == ignore {
				return true
			}
		}
	}
	return false
}

// DetectEPFInRepo uses a two-pass scan to find EPF instances in a repository.
//   - Pass 1: non-recursive root tree (fast, one API call). Looks for READY/ tree
//     entry or known root marker files.
//   - Pass 2: recursive full tree (fallback for monorepos). Finds all paths where
//     a READY/ directory appears.
//
// Returns an empty slice when no EPF content is found. ScanTruncated is set when
// the recursive tree response was too large for GitHub to return in full.
// DetectEPFInRepo uses a two-pass scan to find EPF instances in a repository.
//   - Pass 1: non-recursive root tree (fast, one API call). Looks for READY/ tree
//     entry or known root marker files. Also fetches .gitmodules when present.
//   - Pass 2: recursive full tree (fallback for monorepos). Finds all paths where
//     a READY/ directory appears.
//
// Returns instances, submodule references declared in .gitmodules, and whether
// the tree response was truncated. Submodule-sourced EPF paths are filtered out
// so subscriber repos do not produce duplicate import targets.
func (c *Client) DetectEPFInRepo(ctx context.Context, token, owner, repo, branch string) (instances []DetectedInstance, submodules []SubmoduleRef, scanTruncated bool, commitInfo CommitInfo, err error) { //nolint:gocognit // two-pass scan logic is inherently complex
	client := c.ghClient(token)

	// Resolve branch to tree SHA via ref → commit → tree.
	ref, _, refErr := client.Git.GetRef(ctx, owner, repo, "refs/heads/"+branch)
	if refErr != nil {
		return nil, nil, false, CommitInfo{}, fmt.Errorf("get ref for branch %q: %w", branch, refErr)
	}
	commitSHA := ref.Object.GetSHA()

	commit, _, commitErr := client.Git.GetCommit(ctx, owner, repo, commitSHA)
	if commitErr != nil {
		return nil, nil, false, CommitInfo{}, fmt.Errorf("get commit %q: %w", commitSHA, commitErr)
	}
	treeSHA := commit.Tree.GetSHA()

	// Capture commit summary — already fetched, zero extra API calls.
	commitInfo = CommitInfo{
		SHA:        commitSHA,
		Message:    firstLine(commit.GetMessage()),
		AuthorName: commit.GetAuthor().GetName(),
		AuthoredAt: commit.GetAuthor().GetDate().Time,
	}

	// Pass 1 — non-recursive root scan.
	rootTree, _, rootErr := client.Git.GetTree(ctx, owner, repo, treeSHA, false)
	if rootErr != nil {
		return nil, nil, false, commitInfo, fmt.Errorf("get root tree: %w", rootErr)
	}

	hasReadyDir := false
	metaAtRoot := false
	var gitmodulesSHA string
	for _, e := range rootTree.Entries {
		if e.GetType() == "tree" && e.GetPath() == "READY" {
			hasReadyDir = true
		}
		if e.GetPath() == ".gitmodules" && e.GetType() == "blob" {
			gitmodulesSHA = e.GetSHA()
		}
		for _, marker := range epfRootMarkers {
			if e.GetPath() == marker {
				metaAtRoot = true
			}
		}
	}

	// Fetch and parse .gitmodules when present (best-effort).
	submodules = c.fetchSubmoduleRefs(ctx, token, owner, repo, gitmodulesSHA)

	// Early exit: if .gitmodules declares submodule(s) and there is no READY/ at root,
	// skip Pass 2 for repos where ALL .gitmodules entries point to EPF-named paths.
	// This avoids an expensive recursive tree call for pure subscriber repos.
	// We still need Pass 2 for repos that have BOTH submodules and native EPF instances.
	if !hasReadyDir && gitmodulesSHA != "" && len(submodules) > 0 && isLikelyPureSubscriber(submodules) {
		slog.DebugContext(ctx, "EPF scan: pure subscriber detected via .gitmodules — skipping Pass 2",
			"owner", owner, "repo", repo)
		return nil, submodules, false, commitInfo, nil
	}

	if hasReadyDir {
		// Root-level READY/ — no submodule filtering needed (root is never a submodule path).
		return []DetectedInstance{{BasePath: "", HasMetaFile: metaAtRoot}}, submodules, false, commitInfo, nil
	}

	// Pass 2 — recursive scan (monorepo fallback).
	fullTree, _, fullErr := client.Git.GetTree(ctx, owner, repo, treeSHA, true)
	if fullErr != nil {
		return nil, nil, false, commitInfo, fmt.Errorf("get full tree: %w", fullErr)
	}

	truncated := fullTree.GetTruncated()
	if truncated {
		slog.WarnContext(ctx, "git tree response truncated — EPF scan results may be incomplete",
			"owner", owner, "repo", repo, "branch", branch)
	}

	// Build a set of all paths for meta-file lookups.
	// Also collect submodule checkout paths from type "commit" entries — used to
	// filter out EPF content that originates from a git submodule.
	pathSet := make(map[string]bool, len(fullTree.Entries))
	var submodulePaths []string
	for _, e := range fullTree.Entries {
		pathSet[e.GetPath()] = true
		if e.GetType() == "commit" {
			submodulePaths = append(submodulePaths, e.GetPath())
		}
	}

	if len(submodulePaths) > 0 {
		slog.DebugContext(ctx, "EPF scan: found submodule checkout paths",
			"owner", owner, "repo", repo, "submodule_paths", submodulePaths)
	}

	// Find all READY/ directories — collect base paths first.
	seen := make(map[string]bool)
	var candidateBasePaths []string
	for _, e := range fullTree.Entries {
		if e.GetType() != "tree" {
			continue
		}
		// Match paths that end with "/READY" or are exactly "READY".
		p := e.GetPath()
		var basePath string
		if p == "READY" {
			basePath = ""
		} else if strings.HasSuffix(p, "/READY") {
			basePath = strings.TrimSuffix(p, "/READY")
		} else {
			continue
		}

		// Skip paths that are test fixtures, embedded schema dirs, etc.
		if isIgnoredEPFBasePath(basePath) {
			slog.DebugContext(ctx, "EPF scan: skipping ignored path", "base_path", basePath)
			continue
		}

		// Skip paths sourced from a git submodule — the canonical EPF instance
		// lives in its own repo and will be discovered there. Subscriber repos
		// (e.g. twentyfirst with 21st-epf as a submodule) should not produce a
		// duplicate import target.
		if isUnderSubmodule(basePath, submodulePaths) {
			slog.DebugContext(ctx, "EPF scan: skipping submodule-sourced path",
				"base_path", basePath, "submodule_paths", submodulePaths)
			continue
		}

		if seen[basePath] {
			continue
		}
		seen[basePath] = true
		candidateBasePaths = append(candidateBasePaths, basePath)
	}

	// Keep only shallowest base paths — discard any path that is a child of another.
	for _, candidate := range candidateBasePaths {
		isNested := false
		for _, other := range candidateBasePaths {
			if other == candidate {
				continue
			}
			if other == "" || strings.HasPrefix(candidate, other+"/") {
				isNested = true
				break
			}
		}
		if isNested {
			continue
		}

		hasMeta := false
		for _, marker := range epfRootMarkers {
			lookup := marker
			if candidate != "" {
				lookup = candidate + "/" + marker
			}
			if pathSet[lookup] {
				hasMeta = true
				break
			}
		}

		instances = append(instances, DetectedInstance{BasePath: candidate, HasMetaFile: hasMeta})
	}

	return instances, submodules, truncated, commitInfo, nil
}

// firstLine returns the first line of a string (commit message subject).
func firstLine(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// fetchSubmoduleRefs fetches and parses .gitmodules when a blob SHA is provided.
// Returns nil (not an error) when .gitmodules is absent or cannot be fetched.
func (c *Client) fetchSubmoduleRefs(ctx context.Context, token, owner, repo, blobSHA string) []SubmoduleRef {
	if blobSHA == "" {
		return nil
	}
	data, err := c.GetBlob(ctx, token, owner, repo, blobSHA)
	if err != nil {
		slog.DebugContext(ctx, "fetch .gitmodules blob failed (non-fatal)", "owner", owner, "repo", repo, "err", err)
		return nil
	}
	refs := parseGitmodules(data)
	if len(refs) > 0 {
		slog.DebugContext(ctx, "EPF scan: parsed .gitmodules", "owner", owner, "repo", repo, "submodule_count", len(refs))
	}
	return refs
}

// ParseRepoSlug splits "owner/repo" into owner and repo.
func ParseRepoSlug(slug string) (owner, repo string, err error) {
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("invalid repo slug %q: expected owner/repo", slug)
	}
	return parts[0], parts[1], nil
}

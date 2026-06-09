// import.go — GitHub import path for the sync domain service.
// Implements DetermineSyncState, ImportFromGithub, and CheckAndUpdateSyncStatus.
package sync

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/epfimport"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// ---------------------------------------------------------------------------
// RepoReader interface
// ---------------------------------------------------------------------------

// RepoReader abstracts the read operations needed to import artifacts from a
// remote repository. internal/github.Client implements this interface.
type RepoReader interface {
	// GetInstallationToken returns a short-lived token for the given org/user.
	GetInstallationToken(ctx context.Context, owner string) (string, error)
	// GetDefaultBranch returns the default branch name (e.g. "main").
	GetDefaultBranch(ctx context.Context, token, owner, repo string) (string, error)
	// GetHeadCommitSHA returns the HEAD commit SHA for a branch.
	GetHeadCommitSHA(ctx context.Context, token, owner, repo, branch string) (string, error)
	// GetHeadCommitInfo returns the HEAD commit SHA and authored timestamp for a branch.
	GetHeadCommitInfo(ctx context.Context, token, owner, repo, branch string) (sha string, date time.Time, err error)
	// ListFiles returns all YAML file paths under basePath on the given branch.
	ListFiles(ctx context.Context, token, owner, repo, branch, basePath string) ([]string, error)
	// GetFileContent fetches the raw bytes of a file at the given path on the given branch.
	GetFileContent(ctx context.Context, token, owner, repo, branch, path string) ([]byte, error)
	// GetAllFileContents fetches all YAML files under basePath in a single tree walk.
	// Returns a map of repo-relative path → raw bytes. More efficient than calling
	// ListFiles + GetFileContent per file (avoids re-fetching the tree per file).
	GetAllFileContents(ctx context.Context, token, owner, repo, branch, basePath string) (map[string][]byte, error)
	// GetPullRequestState returns "open", "closed", or "merged" for a PR.
	GetPullRequestState(ctx context.Context, token, owner, repo string, prNumber int) (string, error)

	// --- Discovery methods (connect flow) ---

	// ListInstallations returns all GitHub App installations (App-level JWT, no owner token needed).
	ListInstallations(ctx context.Context) ([]InstallationInfo, error)
	// ListUserInstallations returns installations accessible to the user identified by userToken.
	// Uses GET /user/installations — properly scoped per user for multi-tenant deployments.
	ListUserInstallations(ctx context.Context, userToken string) ([]InstallationInfo, error)
	// ListUserRepos returns all repos the user has access to via their OAuth token (repo scope).
	// Crosses all orgs without requiring the GitHub App to be pre-installed.
	ListUserRepos(ctx context.Context, userToken string) ([]UserRepoInfo, error)
	// ListInstallationRepos returns all repos accessible to the installation identified by token.
	ListInstallationRepos(ctx context.Context, token string) ([]RepoInfo, error)
	// DetectEPFInRepo uses a two-pass scan to find EPF instances in a repository.
	// Returns detected instances, declared submodule references, whether the tree
	// was truncated, and any error.
	DetectEPFInRepo(ctx context.Context, token, owner, repo, branch string) ([]DetectedEPFInstance, []SubmoduleRef, bool, RepoCommitInfo, error)
}

// UserRepoInfo is a repository the user has direct access to via OAuth token.
// HasAppInstall indicates whether the GitHub App is installed on the repo's owner org —
// if false, read import works but write-back (sync to GitHub) is unavailable.
type UserRepoInfo struct {
	Name          string    `json:"name"`
	FullName      string    `json:"full_name"`
	Owner         string    `json:"owner"`
	HTMLURL       string    `json:"html_url"`
	DefaultBranch string    `json:"default_branch"`
	Private       bool      `json:"private"`
	HasAppInstall bool      `json:"has_app_install"` // true when App is installed on this owner
	Description   string    `json:"description,omitempty"`
	PushedAt      time.Time `json:"pushed_at,omitempty"`
}

// RepoCommitInfo holds summary information about the HEAD commit of a repository.
type RepoCommitInfo struct {
	SHA        string
	Message    string // first line only
	AuthorName string
	AuthoredAt time.Time
}

// InstallationInfo describes a GitHub App installation on an org or personal account.
type InstallationInfo struct {
	ID         int64  `json:"id"`
	OwnerLogin string `json:"owner_login"`
	OwnerType  string `json:"owner_type"` // "Organization" or "User"
	HTMLURL    string `json:"html_url"`
}

// RepoInfo is a repository accessible via a GitHub App installation.
type RepoInfo struct {
	Name          string `json:"name"`
	FullName      string `json:"full_name"`
	HTMLURL       string `json:"html_url"`
	DefaultBranch string `json:"default_branch"`
	Private       bool   `json:"private"`
}

// RateLimitError is returned by scan operations when GitHub's API rate limit is hit.
// RetryAfter is the duration to wait before retrying (derived from the reset timestamp).
type RateLimitError struct {
	RetryAfter time.Duration
	Message    string
}

func (e *RateLimitError) Error() string { return e.Message }

// DetectedEPFInstance is a single EPF instance found within a repository.
type DetectedEPFInstance struct {
	BasePath    string `json:"base_path"`     // repo-relative base path; "" = root
	HasMetaFile bool   `json:"has_meta_file"` // true when _meta.yaml or _epf.yaml found
	// IsSubmodule is true when the EPF instance lives inside a git submodule checkout
	// (e.g. emergent-strategy has its EPF at docs/EPF/_instances/emergent/ as a submodule).
	// The EPF content belongs to SubmoduleSlug; importing requires reading from that repo.
	IsSubmodule   bool   `json:"is_submodule,omitempty"`
	SubmoduleSlug string `json:"submodule_slug,omitempty"` // "owner/repo" of the EPF source repo
}

// SubmoduleRef is a git submodule declared in .gitmodules, with its checkout path
// and resolved GitHub repo slug.
type SubmoduleRef struct {
	// Path is the repo-relative checkout path, e.g. "docs/EPF".
	Path string `json:"path"`
	// URL is the raw remote URL from .gitmodules.
	URL string `json:"url"`
	// RepoSlug is "owner/repo" derived from the URL, e.g. "eyedea-io/21st-epf".
	// Empty when the URL is not a recognisable GitHub URL.
	RepoSlug string `json:"repo_slug,omitempty"`
}

// ---------------------------------------------------------------------------
// Sync state
// ---------------------------------------------------------------------------

// SyncState describes the relationship between the server's state and GitHub.
type SyncState string

const (
	// SyncStateUnlinked — instance has no github_repo configured.
	SyncStateUnlinked SyncState = "unlinked"
	// SyncStateInSync — same commit SHA, no local changes since last sync.
	SyncStateInSync SyncState = "in_sync"
	// SyncStateServerAhead — server has been enriched on top of the same commit.
	// Import would overwrite enrichments; recommend push instead.
	SyncStateServerAhead SyncState = "server_ahead"
	// SyncStateGithubAhead — remote has a newer commit; server is clean.
	// Safe to import directly.
	SyncStateGithubAhead SyncState = "github_ahead"
	// SyncStateDiverged — both sides changed since last sync.
	// Server will create safety PR then import.
	SyncStateDiverged SyncState = "diverged"
)

// SyncStateResult describes the current sync relationship for an instance.
type SyncStateResult struct {
	State             SyncState `json:"state"`
	LocalSHA          string    `json:"local_sha,omitempty"`  // github_commit_sha on instance
	RemoteSHA         string    `json:"remote_sha,omitempty"` // HEAD SHA on target branch
	TargetBranch      string    `json:"target_branch"`
	HasLocalChanges   bool      `json:"has_local_changes"`
	PendingBatchCount int       `json:"pending_batch_count"`
}

// ImportParams controls an import operation.
type ImportParams struct {
	InstanceID uuid.UUID
	// Branch is the branch to import from. If empty, uses the instance's
	// tracked github_branch, or the repo's default branch if that is also unset.
	Branch string
}

// ImportResult is the outcome of an import operation.
type ImportResult struct {
	Status            string    `json:"status"` // "imported", "already_in_sync", "server_ahead", "safety_pr_created"
	Recommendation    string    `json:"recommendation,omitempty"`
	TargetBranch      string    `json:"target_branch"`
	ArtifactCount     int       `json:"artifact_count"`
	SafetyPRURL       string    `json:"safety_pr_url,omitempty"`
	SnapshotVersionID string    `json:"snapshot_version_id,omitempty"` // auto-published before overwrite
	SyncState         SyncState `json:"sync_state"`
}

// ---------------------------------------------------------------------------
// DetermineSyncState
// ---------------------------------------------------------------------------

// DetermineSyncState computes the current sync state for an instance.
// It fetches the remote HEAD SHA and compares it with the instance's tracked SHA.
// Returns ErrGitHubNotConfigured when the reader is nil.
func (s *Service) DetermineSyncState(ctx context.Context, instanceID uuid.UUID, branch string) (*SyncStateResult, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured")
	}

	inst, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	if inst.GithubRepo == nil || *inst.GithubRepo == "" {
		return &SyncStateResult{State: SyncStateUnlinked}, nil
	}

	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(err.Error())
	}

	token, err := s.reader.GetInstallationToken(ctx, owner)
	if err != nil {
		return nil, fmt.Errorf("get installation token: %w", err)
	}

	// Resolve target branch.
	targetBranch := branch
	if targetBranch == "" && inst.GithubBranch != nil && *inst.GithubBranch != "" {
		targetBranch = *inst.GithubBranch
	}
	if targetBranch == "" {
		targetBranch, err = s.reader.GetDefaultBranch(ctx, token, owner, repo)
		if err != nil {
			return nil, fmt.Errorf("get default branch: %w", err)
		}
	}

	remoteSHA, err := s.reader.GetHeadCommitSHA(ctx, token, owner, repo, targetBranch)
	if err != nil {
		return nil, fmt.Errorf("get remote HEAD SHA: %w", err)
	}

	localSHA := ""
	if inst.GithubCommitSHA != nil {
		localSHA = *inst.GithubCommitSHA
	}

	// hasLocalChanges is true when the instance has unpushed work:
	// staged mutations OR committed mutations created after the last GitHub sync.
	stagedCount, dbErr := s.db.NewSelect().
		TableExpr("strategy_mutations").
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.MutationStatusStaged).
		Count(ctx)
	if dbErr != nil {
		slog.WarnContext(ctx, "failed to count staged mutations", "err", dbErr)
	}
	committedAfterSync, dbErr2 := s.db.NewSelect().
		TableExpr("strategy_mutations").
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.MutationStatusCommitted).
		Where("source != ?", "system").
		Where(`created_at > COALESCE(
			(SELECT MAX(created_at) FROM github_sync_log WHERE instance_id = ?), ?
		)`, instanceID, "1970-01-01").
		Count(ctx)
	if dbErr2 != nil {
		slog.WarnContext(ctx, "failed to count committed-after-sync mutations", "err", dbErr2)
	}

	hasLocalChanges := stagedCount > 0 || committedAfterSync > 0

	// Four-state logic.
	var state SyncState
	switch {
	case localSHA == "" && !hasLocalChanges:
		// Never synced; treat as github-ahead (safe to import).
		state = SyncStateGithubAhead
	case localSHA == "" && hasLocalChanges:
		// Never synced but has server-only changes.
		state = SyncStateServerAhead
	case localSHA == remoteSHA && !hasLocalChanges:
		state = SyncStateInSync
	case localSHA == remoteSHA && hasLocalChanges:
		state = SyncStateServerAhead
	case localSHA != remoteSHA && !hasLocalChanges:
		state = SyncStateGithubAhead
	default:
		// localSHA != remoteSHA && hasLocalChanges
		state = SyncStateDiverged
	}

	return &SyncStateResult{
		State:             state,
		LocalSHA:          localSHA,
		RemoteSHA:         remoteSHA,
		TargetBranch:      targetBranch,
		HasLocalChanges:   hasLocalChanges,
		PendingBatchCount: int(stagedCount),
	}, nil
}

// ---------------------------------------------------------------------------
// ImportFromGithub
// ---------------------------------------------------------------------------

// ImportFromGithub imports EPF artifacts from the instance's linked GitHub repo.
// Decision logic:
//   - InSync     → no-op, return "already_in_sync"
//   - ServerAhead → refuse import, return "server_ahead" with recommendation to push
//   - GithubAhead → import directly
//   - Diverged    → push safety PR, then import (abort if safety push fails)
func (s *Service) ImportFromGithub(ctx context.Context, p ImportParams) (*ImportResult, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}

	actorID := audit.ActorFromContext(ctx)

	inst, err := s.loadInstance(ctx, p.InstanceID)
	if err != nil {
		return nil, err
	}
	if inst.GithubRepo == nil || *inst.GithubRepo == "" {
		return nil, apperror.ErrBadRequest.WithDetail("instance has no github_repo configured; set it via update_instance before importing")
	}

	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(err.Error())
	}

	token, err := s.reader.GetInstallationToken(ctx, owner)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(
			fmt.Sprintf("GitHub App is not installed on %q. Install at https://github.com/apps/YOUR_APP/installations/new", owner))
	}

	// Determine sync state (resolves target branch internally).
	syncState, err := s.DetermineSyncState(ctx, p.InstanceID, p.Branch)
	if err != nil {
		return nil, err
	}

	targetBranch := syncState.TargetBranch

	switch syncState.State {
	case SyncStateUnlinked:
		return nil, apperror.ErrBadRequest.WithDetail("instance has no github_repo configured")

	case SyncStateInSync:
		return &ImportResult{
			Status:        "already_in_sync",
			TargetBranch:  targetBranch,
			SyncState:     syncState.State,
			ArtifactCount: 0,
		}, nil

	case SyncStateServerAhead:
		return &ImportResult{
			Status:         "server_ahead",
			Recommendation: "The server has been enriched on top of the same GitHub commit. Use sync_to_github to push the enrichments to GitHub instead.",
			TargetBranch:   targetBranch,
			SyncState:      syncState.State,
		}, nil

	case SyncStateDiverged:
		// Push safety PR before importing.
		safetyPRURL, pushErr := s.pushSafetyPR(ctx, inst, token, owner, repo, targetBranch, actorID)
		if pushErr != nil {
			return nil, fmt.Errorf("push safety PR (abort import to preserve server state): %w", pushErr)
		}
		slog.InfoContext(ctx, "safety PR created before diverged import",
			"instance_id", p.InstanceID, "pr_url", safetyPRURL)
		// Fall through to import.
		_ = safetyPRURL // referenced in result below after import

		count, importErr := s.doImport(ctx, inst, token, owner, repo, targetBranch, p.Branch, actorID)
		if importErr != nil {
			return nil, importErr
		}
		return &ImportResult{
			Status:        "imported",
			TargetBranch:  targetBranch,
			ArtifactCount: count,
			SafetyPRURL:   safetyPRURL,
			SyncState:     syncState.State,
		}, nil

	default: // SyncStateGithubAhead
		count, importErr := s.doImport(ctx, inst, token, owner, repo, targetBranch, p.Branch, actorID)
		if importErr != nil {
			return nil, importErr
		}
		return &ImportResult{
			Status:        "imported",
			TargetBranch:  targetBranch,
			ArtifactCount: count,
			SyncState:     syncState.State,
		}, nil
	}
}

// ImportFromGithubWithUserToken imports artifacts using a user OAuth token instead of a
// GitHub App installation token. Used when the GitHub App is not installed on the target org.
//
// Guard: compares the remote HEAD SHA against the instance's last-synced SHA.
//   - Never synced (no local SHA) → import freely
//   - Remote SHA == local SHA → already in sync, no-op
//   - Remote SHA != local SHA AND instance has pending mutations → refuse (server_ahead)
//   - Remote SHA != local SHA → import (github_ahead)
//
// The pending-mutations check is a lightweight proxy for DetermineSyncState.HasLocalChanges.
func (s *Service) ImportFromGithubWithUserToken(ctx context.Context, instanceID uuid.UUID, branch, userToken string) (*ImportResult, error) {
	if s.reader == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub reader is not configured")
	}
	actorID := audit.ActorFromContext(ctx)

	inst, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return nil, err
	}
	if inst.GithubRepo == nil || *inst.GithubRepo == "" {
		return nil, apperror.ErrBadRequest.WithDetail("instance has no github_repo configured")
	}

	// Resolve branch: explicit arg → instance's tracked branch → "main" fallback.
	if branch == "" && inst.GithubBranch != nil && *inst.GithubBranch != "" {
		branch = *inst.GithubBranch
	}
	if branch == "" {
		branch = "main"
	}

	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(err.Error())
	}

	// Fetch remote HEAD SHA to determine sync state.
	remoteSHA, _, shaErr := s.reader.GetHeadCommitInfo(ctx, userToken, owner, repo, branch)
	if shaErr != nil {
		return nil, fmt.Errorf("get remote HEAD: %w", shaErr)
	}

	localSHA := ""
	if inst.GithubCommitSHA != nil {
		localSHA = *inst.GithubCommitSHA
	}

	// hasServerChanges returns true when the instance has user-authored local work
	// not yet in GitHub. Excludes system-generated mutations (source='system') such
	// as strategic index backfills and alignment jobs triggered by the import itself.
	hasServerChanges := func() (int, bool) {
		// Staged mutations (any source — staged means waiting for human review).
		staged, _ := s.db.NewSelect().
			TableExpr("strategy_mutations").
			Where("instance_id = ?", instanceID).
			Where("status = ?", domain.MutationStatusStaged).
			Count(ctx)
		if staged > 0 {
			return int(staged), true
		}
		// Non-system committed mutations created after the last sync log entry.
		committed, _ := s.db.NewSelect().
			TableExpr("strategy_mutations").
			Where("instance_id = ?", instanceID).
			Where("status = ?", domain.MutationStatusCommitted).
			Where("source != ?", "system").
			Where(`created_at > COALESCE(
				(SELECT MAX(created_at) FROM github_sync_log WHERE instance_id = ?), ?
			)`, instanceID, "1970-01-01").
			Count(ctx)
		return int(committed), committed > 0
	}

	// Already in sync — no-op, unless there are local changes not yet pushed.
	if localSHA != "" && remoteSHA == localSHA {
		if n, ahead := hasServerChanges(); ahead {
			return &ImportResult{
				Status:         "server_ahead",
				Recommendation: fmt.Sprintf("You have %d local change(s) not yet pushed to GitHub. Push first, or discard staged changes before importing.", n),
				TargetBranch:   branch,
				SyncState:      SyncStateServerAhead,
			}, nil
		}
		return &ImportResult{
			Status:        "already_in_sync",
			TargetBranch:  branch,
			SyncState:     SyncStateInSync,
			ArtifactCount: 0,
		}, nil
	}

	// Remote has moved ahead (or was never synced). Auto-publish a snapshot of the
	// current server state before overwriting — the current state becomes the previous
	// version and can be restored at any time.
	//
	// If local user changes also exist (diverged), include them in the snapshot.
	// We no longer block — snapshot + import is always safe.
	var snapshotID string
	if localSHA != "" || func() bool { _, ok := hasServerChanges(); return ok }() {
		label := "Pre-import snapshot (GitHub ahead)"
		if _, hasDiverged := hasServerChanges(); hasDiverged {
			label = "Pre-import snapshot (diverged — local changes preserved)"
		}
		snap, snapErr := s.versionSvc.Publish(ctx, instanceID, label,
			"Automatic snapshot taken before importing newer content from GitHub.")
		if snapErr != nil {
			slog.WarnContext(ctx, "failed to auto-publish pre-import snapshot", "err", snapErr)
			// Non-fatal: continue with import even if snapshot fails.
		} else {
			snapshotID = snap.ID.String()
			slog.InfoContext(ctx, "pre-import snapshot published",
				"instance_id", instanceID, "version_id", snapshotID, "label", label)
		}
	}

	count, importErr := s.doImport(ctx, inst, userToken, owner, repo, branch, branch, actorID)
	if importErr != nil {
		return nil, importErr
	}
	return &ImportResult{
		Status:            "imported",
		TargetBranch:      branch,
		ArtifactCount:     count,
		SyncState:         SyncStateGithubAhead,
		SnapshotVersionID: snapshotID,
	}, nil
}

// doImport fetches YAML files from GitHub and reimports them into the instance.
// Updates github_commit_sha and github_branch after successful import.
func (s *Service) doImport(ctx context.Context, inst *domain.StrategyInstance, token, owner, repo, targetBranch, requestedBranch string, actorID *uuid.UUID) (int, error) {
	basePath := ""
	if inst.GithubBasePath != nil {
		basePath = *inst.GithubBasePath
	}

	// Fetch all YAML file contents in a single tree walk + parallel blob downloads.
	files, err := s.reader.GetAllFileContents(ctx, token, owner, repo, targetBranch, basePath)
	if err != nil {
		return 0, fmt.Errorf("fetch files from GitHub: %w", err)
	}

	if len(files) == 0 {
		return 0, apperror.ErrBadRequest.WithDetail("no YAML files found in the repository at the configured base path")
	}

	// Parse into artifact payloads.
	payloads, _, parseErr := epfimport.ParseFiles(files)
	if parseErr != nil {
		return 0, fmt.Errorf("parse YAML files: %w", parseErr)
	}

	if len(payloads) == 0 {
		return 0, apperror.ErrBadRequest.WithDetail("no recognizable EPF artifacts found in the repository")
	}

	// Get HEAD SHA + commit date for recording after import.
	remoteSHA, commitDate, shaErr := s.reader.GetHeadCommitInfo(ctx, token, owner, repo, targetBranch)
	if shaErr != nil {
		return 0, fmt.Errorf("get HEAD commit info post-fetch: %w", shaErr)
	}

	// Reimport artifacts into the instance.
	if err := s.instSvc.ReimportArtifacts(ctx, inst.ID, payloads); err != nil {
		return 0, fmt.Errorf("reimport artifacts: %w", err)
	}

	// Backfill the strategic index.
	count, bfErr := s.strategySvc.BackfillIndex(ctx, inst.ID)
	if bfErr != nil {
		slog.WarnContext(ctx, "backfill index failed after import", "err", bfErr)
	}

	// Update commit SHA and branch on instance.
	newBranch := (*string)(nil)
	if requestedBranch != "" {
		// Explicit branch requested — store it.
		newBranch = &requestedBranch
	}
	// If requestedBranch is "" and instance already had a branch, clear it (switching to default).
	// Actually: only clear if requestedBranch is "" AND the instance had a non-default branch.
	// The semantics: empty request = "use tracked branch or default" — don't clear unless
	// the user explicitly wants to switch back (which is signaled by empty + instance has branch).
	if requestedBranch == "" && inst.GithubBranch != nil && *inst.GithubBranch != "" {
		// User called import without a branch while instance tracked a branch → switch to default.
		emptyStr := ""
		newBranch = &emptyStr
	}

	q := s.db.NewUpdate().
		TableExpr("strategy_instances").
		Set("github_commit_sha = ?", remoteSHA).
		Set("updated_at = NOW()").
		Where("id = ?", inst.ID)
	if !commitDate.IsZero() {
		q = q.Set("github_commit_date = ?", commitDate)
	}

	if newBranch != nil {
		if *newBranch == "" {
			q = q.Set("github_branch = NULL")
		} else {
			q = q.Set("github_branch = ?", *newBranch)
		}
	}

	if _, updateErr := q.Exec(ctx); updateErr != nil {
		slog.WarnContext(ctx, "failed to update commit SHA on instance after import", "err", updateErr)
	}

	// Record in sync log.
	logEntry := &domain.GithubSyncLog{
		ID:            uuid.New(),
		InstanceID:    inst.ID,
		GithubRepo:    *inst.GithubRepo,
		BranchName:    targetBranch,
		Status:        domain.SyncStatusPushed,
		Direction:     domain.SyncDirectionImport,
		Source:        domain.SyncSourceManual,
		ArtifactCount: count,
		CreatedBy:     actorID,
	}
	if _, logErr := s.db.NewInsert().Model(logEntry).Exec(ctx); logErr != nil {
		slog.WarnContext(ctx, "failed to record import sync log", "err", logErr)
	}

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "github_sync",
		EntityID:   logEntry.ID,
		Action:     "import_from_github",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details: map[string]any{
			"instance_id":    inst.ID,
			"github_repo":    *inst.GithubRepo,
			"branch":         targetBranch,
			"artifact_count": count,
			"commit_sha":     remoteSHA,
		},
	})

	slog.InfoContext(ctx, "import from github complete",
		"instance_id", inst.ID,
		"branch", targetBranch,
		"artifact_count", count,
		"commit_sha", remoteSHA)

	return count, nil
}

// pushSafetyPR pushes the current server state to a safety branch + PR before
// overwriting it with the GitHub import. This ensures server-side enrichments
// are never lost during a diverged import.
func (s *Service) pushSafetyPR(ctx context.Context, inst *domain.StrategyInstance, token, owner, repo, targetBranch string, actorID *uuid.UUID) (string, error) {
	if s.writer == nil {
		return "", fmt.Errorf("GitHub App write access not configured; cannot create safety PR")
	}

	exportResult, err := s.strategySvc.ExportInstance(ctx, inst.ID)
	if err != nil {
		return "", fmt.Errorf("export instance for safety PR: %w", err)
	}

	files := exportEntriesToFiles(exportResult, inst.GithubBasePath)
	if len(files) == 0 {
		return "", fmt.Errorf("no artifacts to push to safety branch")
	}

	// Safety branch name.
	safetyBranch := fmt.Sprintf("strategy-safety/%s/%s", sanitizeInstanceName(inst.Name), time.Now().UTC().Format("2006-01-02-150405"))

	if err := s.writer.CreateBranch(ctx, token, owner, repo, targetBranch, safetyBranch); err != nil {
		return "", fmt.Errorf("create safety branch: %w", err)
	}

	commitMsg := fmt.Sprintf("strategy-safety: server state backup before import (%s)", inst.Name)
	if err := s.writer.CommitFiles(ctx, token, owner, repo, safetyBranch, files, commitMsg); err != nil {
		return "", fmt.Errorf("commit files to safety branch: %w", err)
	}

	prTitle := fmt.Sprintf("Strategy safety: server state for %s before import", inst.Name)
	prBody := fmt.Sprintf("## Safety PR\n\nThis PR was automatically created to preserve the server state of **%s** before importing a newer version from the `%s` branch.\n\nThis branch has enrichments not present in GitHub. Review and merge if you want to keep them, or close if they are already captured elsewhere.\n\n---\n_Created automatically by Emergent Strategy._", inst.Name, targetBranch)

	pr, err := s.writer.CreatePullRequest(ctx, token, owner, repo, safetyBranch, targetBranch, prTitle, prBody)
	if err != nil {
		return "", fmt.Errorf("create safety pull request: %w", err)
	}

	// Record in sync log.
	logEntry := &domain.GithubSyncLog{
		ID:            uuid.New(),
		InstanceID:    inst.ID,
		GithubRepo:    *inst.GithubRepo,
		BranchName:    safetyBranch,
		PRNumber:      &pr.Number,
		PRUrl:         &pr.URL,
		Status:        domain.SyncStatusPRCreated,
		Direction:     domain.SyncDirectionExport,
		Source:        domain.SyncSourceManual,
		ArtifactCount: exportResult.ArtifactCount,
		CreatedBy:     actorID,
	}
	if _, logErr := s.db.NewInsert().Model(logEntry).Exec(ctx); logErr != nil {
		slog.WarnContext(ctx, "failed to record safety PR sync log", "err", logErr)
	}

	return pr.URL, nil
}

// ---------------------------------------------------------------------------
// CheckAndUpdateSyncStatus
// ---------------------------------------------------------------------------

// CheckAndUpdateSyncStatus checks whether any open sync PRs have been merged or
// closed and updates their status accordingly. When a PR is detected as merged,
// it also updates the instance's github_commit_sha to signal that the server
// and GitHub are now in sync at the merge commit.
//
// This is a lazy poll triggered on settings page load. It is best-effort — errors
// are logged but never returned to avoid breaking the settings page load.
func (s *Service) CheckAndUpdateSyncStatus(ctx context.Context, instanceID uuid.UUID) {
	if s.reader == nil {
		return
	}

	inst, err := s.loadInstance(ctx, instanceID)
	if err != nil || inst.GithubRepo == nil || *inst.GithubRepo == "" {
		return
	}

	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		return
	}

	token, err := s.reader.GetInstallationToken(ctx, owner)
	if err != nil {
		slog.WarnContext(ctx, "CheckAndUpdateSyncStatus: get token failed", "err", err)
		return
	}

	// Find sync log entries with pr_created status that need checking.
	var logs []*domain.GithubSyncLog
	err = s.db.NewSelect().
		Model((*domain.GithubSyncLog)(nil)).
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.SyncStatusPRCreated).
		Where("pr_number IS NOT NULL").
		Scan(ctx, &logs)
	if err != nil {
		return
	}

	for _, log := range logs {
		if log.PRNumber == nil {
			continue
		}

		state, stateErr := s.reader.GetPullRequestState(ctx, token, owner, repo, *log.PRNumber)
		if stateErr != nil {
			slog.WarnContext(ctx, "CheckAndUpdateSyncStatus: get PR state failed",
				"pr_number", *log.PRNumber, "err", stateErr)
			continue
		}

		switch state {
		case "merged":
			s.updateSyncLog(ctx, log.ID, domain.SyncStatusMerged, nil, nil)
			// Update the instance's commit SHA — it's now in sync at the merge commit.
			// We can't easily get the merge commit SHA from the PR object here without
			// another API call, so we just fetch the current HEAD SHA of the base branch.
			if inst.GithubBranch != nil {
				if sha, cd, shaErr := s.reader.GetHeadCommitInfo(ctx, token, owner, repo, *inst.GithubBranch); shaErr == nil {
					q := s.db.NewUpdate().
						TableExpr("strategy_instances").
						Set("github_commit_sha = ?", sha).
						Set("updated_at = NOW()").
						Where("id = ?", instanceID)
					if !cd.IsZero() {
						q = q.Set("github_commit_date = ?", cd)
					}
					_, _ = q.Exec(ctx)
				}
			}
		case "closed":
			s.updateSyncLog(ctx, log.ID, domain.SyncStatusClosed, nil, nil)
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *Service) loadInstance(ctx context.Context, id uuid.UUID) (*domain.StrategyInstance, error) {
	var inst domain.StrategyInstance
	err := s.db.NewSelect().Model(&inst).Where("id = ? AND deleted_at IS NULL", id).Scan(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, apperror.ErrInstanceNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("load instance: %w", err)
	}
	return &inst, nil
}

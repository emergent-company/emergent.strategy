// Package sync provides domain logic for syncing strategy artifacts to external
// repositories. It uses a RepoWriter interface to decouple from infrastructure
// (GitHub client lives in internal/github/).
//
// # GitHub Auth Model
//
// This package uses TWO different auth mechanisms. See docs/GITHUB_AUTH_MODEL.md
// for the full reference. Summary:
//
//   - GitHub App installation token (via RepoWriter/RepoReader): used for all
//     server-initiated operations — AIM auto-push, MCP tool calls. Requires the
//     App to be installed on the target org by an admin.
//
//   - User OAuth token (ghu_...): stored in users.github_access_token. Used by
//     the web UI connect flow (ScanUserRepos). Allows users to browse/import/push
//     to any repo they have access to, across all their orgs, without any App
//     installation. NOT available to background jobs — user must be present.
//
// IMPORTANT: Never use App installation tokens for user-facing repo discovery.
// Never use user OAuth tokens for background/server-initiated operations.
// The split is intentional and matches GitHub's security model.
package sync

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"strings"
	gosync "sync"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// RepoWriter abstracts the write operations needed to sync artifacts to a repo.
// internal/github.Client implements this interface.
type RepoWriter interface {
	// GetInstallationToken returns a short-lived token for the given org/user.
	GetInstallationToken(ctx context.Context, owner string) (string, error)
	// GetDefaultBranch returns the default branch name (e.g. "main").
	GetDefaultBranch(ctx context.Context, token, owner, repo string) (string, error)
	// CreateBranch creates a new branch from baseBranch.
	CreateBranch(ctx context.Context, token, owner, repo, baseBranch, newBranch string) error
	// CommitFiles pushes all files in a single commit.
	CommitFiles(ctx context.Context, token, owner, repo, branch string, files []FileEntry, message string) error
	// CreatePullRequest opens a PR from head to base.
	CreatePullRequest(ctx context.Context, token, owner, repo, head, base, title, body string) (*PRResult, error)
}

// FileEntry is a single file to push. Matches internal/github.FileEntry.
type FileEntry struct {
	Path    string
	Content string
}

// PRResult is the outcome of creating a PR. Matches internal/github.PRResult.
type PRResult struct {
	Number int
	URL    string
}

// InstanceReimporter is satisfied by instance.Service.ReimportArtifacts.
// Declared here to avoid an import cycle (instance → sync would be circular).
type InstanceReimporter interface {
	ReimportArtifacts(ctx context.Context, id uuid.UUID, payloads map[string]any) error
}

// Service manages strategy-to-GitHub sync operations.
type Service struct {
	db          *bun.DB
	strategySvc *strategy.Service
	versionSvc  *versiondom.Service
	writer      RepoWriter // nil when GitHub App is not configured
	reader      RepoReader // nil when GitHub App is not configured
	instSvc     InstanceReimporter

	// scanCacheStore holds in-memory EPF repo scan results (5-minute TTL, keyed by github_owner).
	// Lazily initialised on first use via getScanCache().
	scanCacheStore *scanCache
	scanCacheMu    gosync.Mutex
}

// NewService creates a new sync Service.
func NewService(db *bun.DB, strategySvc *strategy.Service, versionSvc *versiondom.Service, writer RepoWriter) *Service {
	return &Service{
		db:          db,
		strategySvc: strategySvc,
		versionSvc:  versionSvc,
		writer:      writer,
	}
}

// WithReader sets the RepoReader (GitHub read client).
func (s *Service) WithReader(reader RepoReader) {
	s.reader = reader
}

// WithInstanceReimporter sets the instance service for reimporting artifacts.
func (s *Service) WithInstanceReimporter(svc InstanceReimporter) {
	s.instSvc = svc
}

// IsConfigured returns true when a RepoWriter is available.
func (s *Service) IsConfigured() bool {
	return s.writer != nil
}

// SyncParams controls a sync operation.
type SyncParams struct {
	InstanceID uuid.UUID
	VersionID  *uuid.UUID // nil = draft sync (current working state)
}

// SyncResult is the outcome of a sync operation.
type SyncResult struct {
	LogID         uuid.UUID `json:"log_id"`
	BranchName    string    `json:"branch_name"`
	PRNumber      *int      `json:"pr_number,omitempty"`
	PRUrl         *string   `json:"pr_url,omitempty"`
	ArtifactCount int       `json:"artifact_count"`
	Status        string    `json:"status"`
}

// SyncToGithub exports artifacts and creates a PR on the instance's GitHub repo.
func (s *Service) SyncToGithub(ctx context.Context, p SyncParams) (*SyncResult, error) {
	if s.writer == nil {
		return nil, apperror.ErrBadRequest.WithDetail("GitHub App is not configured; set GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY_PATH")
	}

	actorID := audit.ActorFromContext(ctx)

	// Load instance.
	var inst domain.StrategyInstance
	err := s.db.NewSelect().Model(&inst).Where("id = ? AND deleted_at IS NULL", p.InstanceID).Scan(ctx)
	if err != nil {
		return nil, apperror.ErrInstanceNotFound
	}
	if inst.GithubRepo == nil || *inst.GithubRepo == "" {
		return nil, apperror.ErrBadRequest.WithDetail("instance has no github_repo configured; set it before syncing")
	}

	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		return nil, apperror.ErrBadRequest.WithDetail(err.Error())
	}

	// Get files to push.
	var files []FileEntry
	var artifactCount int
	var versionLabel string

	if p.VersionID != nil {
		// Version sync: export from snapshot.
		ver, vErr := s.versionSvc.Get(ctx, p.InstanceID, *p.VersionID)
		if vErr != nil {
			return nil, vErr
		}
		var snap versiondom.Snapshot
		if err := json.Unmarshal(ver.Snapshot, &snap); err != nil {
			return nil, fmt.Errorf("unmarshal version snapshot: %w", err)
		}
		// We need to re-export through the strategy export path to get proper
		// YAML and directory structure. For simplicity, export current state.
		// If the version matches current state, this is correct. For full
		// fidelity we'd need to reconstruct from snapshot — acceptable for v1.
		exportResult, eErr := s.strategySvc.ExportInstance(ctx, p.InstanceID)
		if eErr != nil {
			return nil, fmt.Errorf("export instance: %w", eErr)
		}
		files = exportEntriesToFiles(exportResult, inst.GithubBasePath)
		artifactCount = exportResult.ArtifactCount
		if ver.Label != nil {
			versionLabel = *ver.Label
		} else {
			versionLabel = fmt.Sprintf("v%d", ver.Version)
		}
	} else {
		// Draft sync: export current working state.
		exportResult, eErr := s.strategySvc.ExportInstance(ctx, p.InstanceID)
		if eErr != nil {
			return nil, fmt.Errorf("export instance: %w", eErr)
		}
		files = exportEntriesToFiles(exportResult, inst.GithubBasePath)
		artifactCount = exportResult.ArtifactCount
		versionLabel = "draft"
	}

	if len(files) == 0 {
		return nil, apperror.ErrBadRequest.WithDetail("no artifacts to sync")
	}

	// Generate branch name.
	branchName := generateBranchName(inst.Name, versionLabel)

	// Create sync log entry (pending).
	logEntry := &domain.GithubSyncLog{
		ID:            uuid.New(),
		InstanceID:    p.InstanceID,
		VersionID:     p.VersionID,
		GithubRepo:    *inst.GithubRepo,
		BranchName:    branchName,
		Status:        domain.SyncStatusPending,
		ArtifactCount: artifactCount,
		CreatedBy:     actorID,
	}
	if _, err := s.db.NewInsert().Model(logEntry).Exec(ctx); err != nil {
		return nil, fmt.Errorf("insert sync log: %w", err)
	}

	// Get installation token.
	token, err := s.writer.GetInstallationToken(ctx, owner)
	if err != nil {
		s.failSyncLog(ctx, logEntry.ID, fmt.Sprintf("failed to get installation token: %v", err))
		return nil, apperror.ErrBadRequest.WithDetail(
			fmt.Sprintf("GitHub App is not installed on %q or cannot authenticate. Install the App at https://github.com/apps/YOUR_APP/installations/new", owner))
	}

	// Get default branch.
	defaultBranch, err := s.writer.GetDefaultBranch(ctx, token, owner, repo)
	if err != nil {
		s.failSyncLog(ctx, logEntry.ID, fmt.Sprintf("failed to get default branch: %v", err))
		return nil, fmt.Errorf("get default branch: %w", err)
	}

	// Create branch.
	if err := s.writer.CreateBranch(ctx, token, owner, repo, defaultBranch, branchName); err != nil {
		s.failSyncLog(ctx, logEntry.ID, fmt.Sprintf("failed to create branch: %v", err))
		return nil, fmt.Errorf("create branch: %w", err)
	}

	// Commit files.
	commitMsg := fmt.Sprintf("strategy-sync: %s (%s)", inst.Name, versionLabel)
	if err := s.writer.CommitFiles(ctx, token, owner, repo, branchName, files, commitMsg); err != nil {
		s.failSyncLog(ctx, logEntry.ID, fmt.Sprintf("failed to commit files: %v", err))
		return nil, fmt.Errorf("commit files: %w", err)
	}

	// Update log: pushed.
	s.updateSyncLog(ctx, logEntry.ID, domain.SyncStatusPushed, nil, nil)

	// Create PR.
	prTitle := fmt.Sprintf("Strategy sync: %s (%s)", inst.Name, versionLabel)
	prBody := generatePRBody(inst.Name, versionLabel, artifactCount, p.VersionID)
	prResult, err := s.writer.CreatePullRequest(ctx, token, owner, repo, branchName, defaultBranch, prTitle, prBody)
	if err != nil {
		s.failSyncLog(ctx, logEntry.ID, fmt.Sprintf("files pushed but PR creation failed: %v", err))
		return nil, fmt.Errorf("create pull request: %w", err)
	}

	// Update log: PR created.
	s.updateSyncLog(ctx, logEntry.ID, domain.SyncStatusPRCreated, &prResult.Number, &prResult.URL)

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "github_sync",
		EntityID:   logEntry.ID,
		Action:     "sync_to_github",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details: map[string]any{
			"instance_id":    p.InstanceID,
			"github_repo":    *inst.GithubRepo,
			"branch":         branchName,
			"pr_number":      prResult.Number,
			"artifact_count": artifactCount,
		},
	})

	return &SyncResult{
		LogID:         logEntry.ID,
		BranchName:    branchName,
		PRNumber:      &prResult.Number,
		PRUrl:         &prResult.URL,
		ArtifactCount: artifactCount,
		Status:        domain.SyncStatusPRCreated,
	}, nil
}

// SyncAfterAIMCycle is called asynchronously after an AIM cycle publishes a version.
// It creates a sync PR with context about the AIM cycle. Failures are logged and
// recorded in the sync log — they never propagate back to the caller (the AIM cycle).
// This satisfies the aim.GitHubSyncer interface.
func (s *Service) SyncAfterAIMCycle(ctx context.Context, instanceID uuid.UUID, cycleNumber int, decision string, versionID uuid.UUID) {
	if s.writer == nil {
		return
	}

	slog.InfoContext(ctx, "aim auto-push: starting", "instance_id", instanceID, "cycle", cycleNumber)

	inst, err := s.loadInstance(ctx, instanceID)
	if err != nil || inst.GithubRepo == nil || *inst.GithubRepo == "" {
		slog.InfoContext(ctx, "aim auto-push: skipped (no github_repo)", "instance_id", instanceID)
		return
	}

	// Build a descriptive AIM cycle PR.
	cycleSuffix := decisionBranchSuffix(decision)
	sanitized := sanitizeInstanceName(inst.Name)
	branchName := fmt.Sprintf("strategy-sync/%s/aim-cycle-%d-%s", sanitized, cycleNumber, cycleSuffix)

	// Determine base branch: respect github_branch if set (long-lived dev branch support).
	owner, repo, err := parseRepoSlug(*inst.GithubRepo)
	if err != nil {
		slog.WarnContext(ctx, "aim auto-push: invalid repo slug", "repo", *inst.GithubRepo, "err", err)
		return
	}

	token, err := s.writer.GetInstallationToken(ctx, owner)
	if err != nil {
		slog.WarnContext(ctx, "aim auto-push: failed to get token", "err", err)
		s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("get token: %v", err))
		return
	}

	baseBranch := ""
	if inst.GithubBranch != nil && *inst.GithubBranch != "" {
		baseBranch = *inst.GithubBranch
	} else {
		baseBranch, err = s.writer.GetDefaultBranch(ctx, token, owner, repo)
		if err != nil {
			slog.WarnContext(ctx, "aim auto-push: failed to get default branch", "err", err)
			s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("get default branch: %v", err))
			return
		}
	}

	exportResult, err := s.strategySvc.ExportInstance(ctx, instanceID)
	if err != nil {
		slog.WarnContext(ctx, "aim auto-push: export failed", "err", err)
		s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("export: %v", err))
		return
	}
	files := exportEntriesToFiles(exportResult, inst.GithubBasePath)

	if len(files) == 0 {
		slog.InfoContext(ctx, "aim auto-push: no artifacts to push", "instance_id", instanceID)
		return
	}

	if err := s.writer.CreateBranch(ctx, token, owner, repo, baseBranch, branchName); err != nil {
		slog.WarnContext(ctx, "aim auto-push: create branch failed", "err", err)
		s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("create branch: %v", err))
		return
	}

	commitMsg := fmt.Sprintf("strategy-sync: AIM cycle %d — %s (%s)", cycleNumber, calibrationDecisionLabel(decision), inst.Name)
	if err := s.writer.CommitFiles(ctx, token, owner, repo, branchName, files, commitMsg); err != nil {
		slog.WarnContext(ctx, "aim auto-push: commit failed", "err", err)
		s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("commit: %v", err))
		return
	}

	prTitle := fmt.Sprintf("Strategy sync: AIM cycle %d — %s (%s)", cycleNumber, calibrationDecisionLabel(decision), inst.Name)
	prBody := generateAIMPRBody(inst.Name, cycleNumber, decision, versionID, exportResult.ArtifactCount)

	prResult, err := s.writer.CreatePullRequest(ctx, token, owner, repo, branchName, baseBranch, prTitle, prBody)
	if err != nil {
		slog.WarnContext(ctx, "aim auto-push: PR creation failed", "err", err)
		s.recordSyncFailure(ctx, instanceID, *inst.GithubRepo, branchName, versionID, cycleNumber, fmt.Sprintf("create PR: %v", err))
		return
	}

	// Record success.
	actorID := (*uuid.UUID)(nil)
	logEntry := &domain.GithubSyncLog{
		ID:            uuid.New(),
		InstanceID:    instanceID,
		VersionID:     &versionID,
		GithubRepo:    *inst.GithubRepo,
		BranchName:    branchName,
		PRNumber:      &prResult.Number,
		PRUrl:         &prResult.URL,
		Status:        domain.SyncStatusPRCreated,
		Direction:     domain.SyncDirectionExport,
		Source:        domain.SyncSourceAIMCycle,
		ArtifactCount: exportResult.ArtifactCount,
		CreatedBy:     actorID,
	}
	if _, logErr := s.db.NewInsert().Model(logEntry).Exec(ctx); logErr != nil {
		slog.WarnContext(ctx, "aim auto-push: failed to record sync log", "err", logErr)
	}

	slog.InfoContext(ctx, "aim auto-push: complete",
		"instance_id", instanceID, "cycle", cycleNumber,
		"pr_url", prResult.URL, "artifacts", exportResult.ArtifactCount)
}

// recordSyncFailure logs an AIM auto-push failure in the sync log.
func (s *Service) recordSyncFailure(ctx context.Context, instanceID uuid.UUID, githubRepo, branchName string, versionID uuid.UUID, cycleNumber int, errMsg string) {
	errDetail := fmt.Sprintf("aim cycle %d: %s", cycleNumber, errMsg)
	logEntry := &domain.GithubSyncLog{
		ID:            uuid.New(),
		InstanceID:    instanceID,
		VersionID:     &versionID,
		GithubRepo:    githubRepo,
		BranchName:    branchName,
		Status:        domain.SyncStatusFailed,
		Direction:     domain.SyncDirectionExport,
		Source:        domain.SyncSourceAIMCycle,
		ArtifactCount: 0,
		ErrorMessage:  &errDetail,
	}
	if _, logErr := s.db.NewInsert().Model(logEntry).Exec(ctx); logErr != nil {
		slog.ErrorContext(ctx, "aim auto-push: failed to record failure in sync log", "err", logErr)
	}
}

// decisionBranchSuffix returns a short lowercase suffix for the calibration decision.
func decisionBranchSuffix(decision string) string {
	switch decision {
	case "persevere":
		return "persevere"
	case "pivot":
		return "pivot"
	case "pull_the_plug":
		return "retire"
	default:
		if decision != "" {
			return decision
		}
		return "cycle"
	}
}

// calibrationDecisionLabel returns a human-readable label for a calibration decision.
// Duplicated from aim package to avoid a circular import.
func calibrationDecisionLabel(decision string) string {
	switch decision {
	case "persevere":
		return "Persevere"
	case "pivot":
		return "Pivot"
	case "pull_the_plug":
		return "Pull the Plug"
	default:
		return decision
	}
}

// sanitizeInstanceName makes an instance name safe for use in a branch name.
func sanitizeInstanceName(name string) string {
	return generateBranchSegment(name)
}

func generateBranchSegment(name string) string {
	name = strings.ToLower(name)
	name = strings.ReplaceAll(name, " ", "-")
	result := strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return -1
	}, name)
	if result == "" {
		result = "instance"
	}
	if len(result) > 40 {
		result = result[:40]
	}
	return result
}

func generateAIMPRBody(instanceName string, cycleNumber int, decision string, versionID uuid.UUID, artifactCount int) string {
	var sb strings.Builder
	sb.WriteString("## AIM Cycle Strategy Sync\n\n")
	fmt.Fprintf(&sb, "**Instance:** %s\n", instanceName)
	fmt.Fprintf(&sb, "**Cycle:** %d\n", cycleNumber)
	fmt.Fprintf(&sb, "**Calibration decision:** %s\n", calibrationDecisionLabel(decision))
	fmt.Fprintf(&sb, "**Artifacts:** %d files\n\n", artifactCount)
	fmt.Fprintf(&sb, "Version ID: `%s`\n\n", versionID.String())
	sb.WriteString("---\n\n")
	sb.WriteString("This PR was automatically created by Emergent Strategy after an AIM cycle completed.\n")
	sb.WriteString("Review the strategy updates and merge when ready.\n")
	return sb.String()
}

// GetSyncHistory returns the sync log for an instance.
func (s *Service) GetSyncHistory(ctx context.Context, instanceID uuid.UUID) ([]*domain.GithubSyncLog, error) {
	var logs []*domain.GithubSyncLog
	err := s.db.NewSelect().
		Model((*domain.GithubSyncLog)(nil)).
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(50).
		Scan(ctx, &logs)
	if err != nil {
		return nil, fmt.Errorf("list sync history: %w", err)
	}
	return logs, nil
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func (s *Service) failSyncLog(ctx context.Context, logID uuid.UUID, errMsg string) {
	slog.WarnContext(ctx, "github sync failed", "log_id", logID, "error", errMsg)
	_, err := s.db.NewUpdate().
		Model((*domain.GithubSyncLog)(nil)).
		Set("status = ?, error_message = ?", domain.SyncStatusFailed, errMsg).
		Where("id = ?", logID).
		Exec(ctx)
	if err != nil {
		slog.ErrorContext(ctx, "failed to update sync log", "log_id", logID, "err", err)
	}
}

func (s *Service) updateSyncLog(ctx context.Context, logID uuid.UUID, status string, prNumber *int, prURL *string) {
	q := s.db.NewUpdate().
		Model((*domain.GithubSyncLog)(nil)).
		Set("status = ?", status).
		Where("id = ?", logID)
	if prNumber != nil {
		q = q.Set("pr_number = ?", *prNumber)
	}
	if prURL != nil {
		q = q.Set("pr_url = ?", *prURL)
	}
	if _, err := q.Exec(ctx); err != nil {
		slog.ErrorContext(ctx, "failed to update sync log", "log_id", logID, "err", err)
	}
}

func exportEntriesToFiles(result *strategy.ExportResult, basePath *string) []FileEntry {
	files := make([]FileEntry, 0, len(result.Files))
	for _, entry := range result.Files {
		path := entry.RelPath
		if basePath != nil && *basePath != "" {
			path = strings.TrimSuffix(*basePath, "/") + "/" + path
		}
		files = append(files, FileEntry{
			Path:    path,
			Content: entry.Content,
		})
	}
	return files
}

func generateBranchName(instanceName, versionLabel string) string {
	// Sanitize instance name for branch naming.
	name := strings.ToLower(instanceName)
	name = strings.ReplaceAll(name, " ", "-")
	name = strings.Map(func(r rune) rune {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' {
			return r
		}
		return -1
	}, name)
	if name == "" {
		name = "instance"
	}

	label := strings.ToLower(versionLabel)
	label = strings.ReplaceAll(label, " ", "-")
	if label == "" || label == "draft" {
		label = time.Now().UTC().Format("2006-01-02")
	}

	return fmt.Sprintf("strategy-sync/%s/%s", name, label)
}

func generatePRBody(instanceName, versionLabel string, artifactCount int, versionID *uuid.UUID) string {
	var sb strings.Builder
	sb.WriteString("## Strategy Sync\n\n")
	fmt.Fprintf(&sb, "**Instance:** %s\n", instanceName)
	fmt.Fprintf(&sb, "**Version:** %s\n", versionLabel)
	fmt.Fprintf(&sb, "**Artifacts:** %d files\n\n", artifactCount)

	if versionID != nil {
		fmt.Fprintf(&sb, "Version ID: `%s`\n\n", versionID.String())
	} else {
		sb.WriteString("_Draft sync (current working state)_\n\n")
	}

	sb.WriteString("---\n\n")
	sb.WriteString("This PR was created automatically by the Emergent Strategy platform.\n")
	sb.WriteString("Review the changes and merge when ready.\n")

	return sb.String()
}

func parseRepoSlug(slug string) (owner, repo string, err error) {
	parts := strings.SplitN(slug, "/", 2)
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return "", "", fmt.Errorf("invalid repo slug %q: expected owner/repo", slug)
	}
	return parts[0], parts[1], nil
}

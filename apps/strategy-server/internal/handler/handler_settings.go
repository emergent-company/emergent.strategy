package handler

import (
	"context"
	"fmt"
	"net/http"
	"strings"
	gosync "sync"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"github.com/uptrace/bun"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// handleSettings renders the settings/status page.
func (s *Server) handleSettings(c echo.Context) error {
	ctx := c.Request().Context()

	// Run all four independent data-loading operations concurrently.
	var (
		memoryStatus ui.MemoryHealthStatus
		instances    []ui.InstanceMemoryStatus
		githubSync   []ui.GithubSyncStatus
		repoLinks    []ui.InstanceRepoLink
		wg           gosync.WaitGroup
	)
	wg.Add(4)
	go func() { defer wg.Done(); memoryStatus = s.probeMemoryHealth(ctx) }()
	go func() { defer wg.Done(); instances = s.loadInstanceMemoryStatuses(ctx) }()
	go func() { defer wg.Done(); githubSync = s.loadGithubSyncStatuses(ctx) }()
	go func() { defer wg.Done(); repoLinks = s.loadInstanceRepoLinks(ctx) }()
	wg.Wait()

	data := ui.SettingsData{
		Memory:     memoryStatus,
		Instances:  instances,
		GithubSync: githubSync,
		RepoLinks:  repoLinks,
		Github: ui.GithubConfigStatus{
			// syncSvc is only constructed when the GitHub App is configured;
			// githubOAuth is only set when OAuth App credentials are present.
			AppConfigured:   s.syncSvc != nil,
			OAuthConfigured: s.githubOAuth != nil,
		},
		ActiveLang: string(langs.LocaleFromContext(ctx)),
	}

	sidebarGroups := s.sidebarGroups(c)
	currentPath := c.Request().URL.Path

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.SettingsPage(currentPath, sidebarGroups, data),
		ui.SettingsMainContent(data),
		ui.SettingsContent(data),
	)
	return nil
}

// handleSettingsImport handles POST /settings/import — triggers a GitHub import
// for a specific instance. Redirects back to settings with a flash message.
func (s *Server) handleSettingsImport(c echo.Context) error {
	ctx := c.Request().Context()
	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_sync_not_configured"))
	}

	instanceIDStr := c.FormValue("instance_id")
	if instanceIDStr == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.instance_id_required"))
	}
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id2"))
	}

	branch := c.FormValue("branch") // optional

	// Prefer user OAuth token (works without App installation).
	// Fall back to App-based import only if no user token is present.
	user := web.UserFromContext(ctx)
	githubToken := s.loadUserGithubToken(ctx, user.ID)
	var result *sync.ImportResult
	if githubToken != "" {
		result, err = s.syncSvc.ImportFromGithubWithUserToken(ctx, instanceID, branch, githubToken)
	} else {
		result, err = s.syncSvc.ImportFromGithub(ctx, sync.ImportParams{
			InstanceID: instanceID,
			Branch:     branch,
		})
	}
	if err != nil {
		s.log.Error("manual github import failed", "instance_id", instanceIDStr, "err", err)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.internal"))
	}
	if result != nil {
		switch result.Status {
		case "already_in_sync":
			return c.String(http.StatusOK, "Already up to date — remote has not changed since last import.")
		case "server_ahead":
			msg := result.Recommendation
			if msg == "" {
				msg = "Your instance has staged changes not yet pushed to GitHub. Push first."
			}
			return c.String(http.StatusConflict, "Import blocked: "+msg)
		case "imported":
			if result.SnapshotVersionID != "" {
				s.log.Info("pre-import snapshot published before overwrite",
					"instance_id", instanceIDStr, "snapshot_version_id", result.SnapshotVersionID)
			}
		}
	}

	return c.Redirect(http.StatusSeeOther, "/settings")
}

// handleSettingsSync handles POST /settings/sync — triggers a manual GitHub sync
// for a specific instance. Redirects back to settings.
func (s *Server) handleSettingsSync(c echo.Context) error {
	ctx := c.Request().Context()
	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.github_sync_not_configured"))
	}

	instanceIDStr := c.FormValue("instance_id")
	if instanceIDStr == "" {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.instance_id_required"))
	}
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id2"))
	}

	_, err = s.syncSvc.SyncToGithub(c.Request().Context(), sync.SyncParams{
		InstanceID: instanceID,
	})
	if err != nil {
		s.log.Error("manual github sync failed", "instance_id", instanceIDStr, "err", err)
		// Redirect back with error indicator — simple approach, no flash messages.
	}
	return c.Redirect(http.StatusSeeOther, "/settings")
}

// handleSetLang handles POST /settings/lang.
// Persists the user's language preference in a cookie and redirects to /settings.
func (s *Server) handleSetLang(c echo.Context) error {
	requested := langs.Locale(strings.TrimSpace(c.FormValue("lang")))
	// Validate — only accept known locales.
	switch requested {
	case langs.LocaleEN, langs.LocaleNB:
	default:
		requested = langs.LocaleEN
	}
	c.SetCookie(&http.Cookie{
		Name:     langs.LangCookie,
		Value:    string(requested),
		Path:     "/",
		MaxAge:   365 * 24 * 60 * 60, // 1 year
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
	})
	return c.Redirect(http.StatusSeeOther, "/settings")
}

// handleDeleteInstance handles POST /strategies/:id/delete.
// Soft-deletes the instance and redirects to /settings.
func (s *Server) handleDeleteInstance(c echo.Context) error {
	ctx := c.Request().Context()
	instanceID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}
	instSvc := instancedom.NewService(s.db)
	if delErr := instSvc.DeleteInstance(ctx, instanceID); delErr != nil {
		s.log.Error("delete instance", "instance_id", instanceID, "err", delErr)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.internal"))
	}
	return c.Redirect(http.StatusSeeOther, "/settings")
}

// probeMemoryHealth checks the current Memory server connectivity.
func (s *Server) probeMemoryHealth(ctx context.Context) ui.MemoryHealthStatus {
	if s.semanticSvc == nil || !s.semanticSvc.IsAvailable() {
		return ui.MemoryHealthStatus{Configured: false}
	}

	cfg := s.semanticSvc.Config()
	status := ui.MemoryHealthStatus{
		Configured: true,
		URL:        cfg.URL,
		ProjectID:  cfg.Project,
	}

	// Fetch detailed health from Memory server via the shared client.
	// Uses the same auth mode, connection pool, and retry logic as all other calls.
	healthCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	detail, err := s.semanticSvc.HealthDetailed(healthCtx)
	if err != nil {
		status.Error = langs.T(ctx, "error.memory_health_check_failed")
		return status
	}
	status.Version = detail.Version
	status.Healthy = detail.Healthy
	if !detail.Healthy {
		status.Error = langs.T(ctx, "error.memory_db_not_healthy")
	}

	return status
}

// loadGithubSyncStatuses loads per-instance GitHub sync history and state from the sync log.
// Returns nil when the sync service is not configured.
func (s *Server) loadGithubSyncStatuses(ctx context.Context) []ui.GithubSyncStatus {
	if s.syncSvc == nil {
		return nil
	}

	// Load all workspaces once for the move dropdown.
	allWorkspaces := s.loadWorkspacesForAssignment(ctx)

	instances, err := s.loadSyncInstanceRows(ctx)
	if err != nil {
		s.log.Error("failed to load instances for github sync status", "err", err)
		return nil
	}

	// Process each instance concurrently — GitHub API calls (CheckAndUpdate,
	// DetermineSyncState) are the bottleneck; running them in parallel cuts
	// page load time from O(n * API_latency) to O(max single API_latency).
	result := make([]ui.GithubSyncStatus, len(instances))
	var wg gosync.WaitGroup
	for i, inst := range instances {
		i, inst := i, inst
		wg.Add(1)
		go func() {
			defer wg.Done()

			status := ui.GithubSyncStatus{
				InstanceID:         inst.ID,
				InstanceName:       inst.Name,
				Configured:         s.syncSvc.IsConfigured(),
				Workspaces:         allWorkspaces,
				CurrentWorkspaceID: inst.WorkspaceID,
			}
			if inst.GithubRepo != nil && *inst.GithubRepo != "" {
				status.RepoLinked = true
				status.Repo = *inst.GithubRepo
			}
			if inst.GithubBranch != nil && *inst.GithubBranch != "" {
				status.ActiveBranch = *inst.GithubBranch
			}
			if inst.GithubCommitSHA != nil && len(*inst.GithubCommitSHA) >= 7 {
				status.LocalSHA = (*inst.GithubCommitSHA)[:7]
			}

			instID, parseErr := uuid.Parse(inst.ID)
			if parseErr == nil {
				// Fire-and-forget: update PR status in the background — don't
				// block page render waiting for the GitHub API response.
				go s.syncSvc.CheckAndUpdateSyncStatus(context.Background(), instID)

				// Load last sync log entry (DB-only, fast).
				logs, histErr := s.syncSvc.GetSyncHistory(ctx, instID)
				if histErr == nil && len(logs) > 0 {
					last := logs[0]
					status.LastStatus = last.Status
					status.LastSyncAt = &last.CreatedAt
					status.LastDirection = last.Direction
					if last.PRUrl != nil {
						status.LastSyncPR = *last.PRUrl
					}
				}

				// Live sync state — only when App is configured and repo linked.
				// Tightened to 3s timeout; App not installed returns quickly with error.
				if s.syncSvc.IsConfigured() && status.RepoLinked {
					stateCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
					stateResult, stateErr := s.syncSvc.DetermineSyncStateCached(stateCtx, instID, "")
					cancel()
					if stateErr == nil {
						status.SyncState = string(stateResult.State)
						if len(stateResult.RemoteSHA) >= 7 {
							status.RemoteSHA = stateResult.RemoteSHA[:7]
						}
					} else {
						// Previously discarded, which is why a repo the App
						// cannot reach rendered as a blank state badge beside
						// an enabled Push button that was guaranteed to fail.
						// Every write goes through the App, so if state cannot
						// be determined, push cannot work either — say so here
						// rather than after the user clicks.
						status.PushBlocked = true
						status.PushBlockedReason = pushBlockedReason(status.Repo, stateErr)
						s.log.Warn("github sync state unavailable; push disabled for this instance",
							"instance_id", inst.ID, "repo", status.Repo, "err", stateErr)
					}
				}
			}

			result[i] = status
		}()
	}
	wg.Wait()
	return result
}

// loadInstanceMemoryStatuses loads per-instance memory sync status.
// githubSyncInstanceRow is an instance as the settings page lists it for GitHub sync.
type githubSyncInstanceRow struct {
	ID              string  `bun:"id"`
	Name            string  `bun:"name"`
	OrgName         string  `bun:"org_name"`
	WorkspaceID     string  `bun:"workspace_id"`
	GithubRepo      *string `bun:"github_repo"`
	GithubBranch    *string `bun:"github_branch"`
	GithubCommitSHA *string `bun:"github_commit_sha"`
}

// loadSyncInstanceRows lists the instances of the caller's organisations for the
// settings page's GitHub sync section.
func (s *Server) loadSyncInstanceRows(ctx context.Context) ([]githubSyncInstanceRow, error) {
	var instances []githubSyncInstanceRow
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.workspace_id, si.github_repo, si.github_branch, si.github_commit_sha").
		ColumnExpr("o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		Apply(func(q *bun.SelectQuery) *bun.SelectQuery { return s.restrictToCallersOrgs(ctx, q, "w.org_id") }).
		OrderExpr("o.name ASC, si.name ASC").
		Scan(ctx, &instances)
	return instances, err
}

func (s *Server) loadInstanceMemoryStatuses(ctx context.Context) []ui.InstanceMemoryStatus {
	var rows []struct {
		ID                          string     `bun:"id"`
		Name                        string     `bun:"name"`
		OrgName                     string     `bun:"org_name"`
		MemorySyncStatus            *string    `bun:"memory_sync_status"`
		MemoryLastSyncedAt          *time.Time `bun:"memory_last_synced_at"`
		MemoryObjectCount           *int       `bun:"memory_object_count"`
		MemoryEdgeCount             *int       `bun:"memory_edge_count"`
		MemoryDecomposedObjectCount *int       `bun:"memory_decomposed_object_count"`
		MemoryDecomposedEdgeCount   *int       `bun:"memory_decomposed_edge_count"`
	}

	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.memory_sync_status, si.memory_last_synced_at, si.memory_object_count, si.memory_edge_count, si.memory_decomposed_object_count, si.memory_decomposed_edge_count").
		ColumnExpr("o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
		Where("si.deleted_at IS NULL").
		Where("si.status != ?", "archived").
		Where("w.deleted_at IS NULL").
		Where("w.github_owner NOT LIKE ?", "e2e-%").
		Where("w.github_owner NOT LIKE ?", "ripple-%").
		Where("w.github_owner NOT LIKE ?", "aim-ripple-%").
		Apply(func(q *bun.SelectQuery) *bun.SelectQuery { return s.restrictToCallersOrgs(ctx, q, "w.org_id") }).
		OrderExpr("o.name ASC, si.name ASC").
		Scan(ctx, &rows)
	if err != nil {
		s.log.Error("failed to load instance memory statuses", "err", err)
		return nil
	}

	statuses := make([]ui.InstanceMemoryStatus, len(rows))
	for i, r := range rows {
		// Count artifacts in DB for this instance.
		artifactCount, _ := s.db.NewSelect().
			TableExpr("strategy_artifacts").
			Where("instance_id = ?", r.ID).
			Count(ctx)

		syncStatus := ""
		if r.MemorySyncStatus != nil {
			syncStatus = *r.MemorySyncStatus
		}
		objCount := 0
		if r.MemoryObjectCount != nil {
			objCount = *r.MemoryObjectCount
		}
		edgeCount := 0
		if r.MemoryEdgeCount != nil {
			edgeCount = *r.MemoryEdgeCount
		}
		decompObjCount := 0
		if r.MemoryDecomposedObjectCount != nil {
			decompObjCount = *r.MemoryDecomposedObjectCount
		}
		decompEdgeCount := 0
		if r.MemoryDecomposedEdgeCount != nil {
			decompEdgeCount = *r.MemoryDecomposedEdgeCount
		}

		statuses[i] = ui.InstanceMemoryStatus{
			ID:                    r.ID,
			Name:                  r.Name,
			OrgName:               r.OrgName,
			MemorySyncStatus:      syncStatus,
			ArtifactCount:         int(artifactCount),
			GraphObjectCount:      objCount,
			GraphEdgeCount:        edgeCount,
			DecomposedObjectCount: decompObjCount,
			DecomposedEdgeCount:   decompEdgeCount,
			LastSyncedAt:          r.MemoryLastSyncedAt,
		}
	}
	return statuses
}

// handleMoveInstance handles POST /strategies/:id/move.
// Moves an instance to an existing workspace or creates a new one on the fly.
// Redirects to /settings on success.
func (s *Server) handleMoveInstance(c echo.Context) error {
	ctx := c.Request().Context()

	instanceID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	// The access guard has already refused a caller who does not administer this
	// instance; the target is resolved (and authorised) here.
	targetWorkspaceID, err := s.resolveMoveTarget(ctx, instanceID, moveRequest{
		WorkspaceID: c.FormValue("workspace_id"),
		NewName:     c.FormValue("new_workspace_name"),
	})
	if err != nil {
		if ae := apperror.AsAppError(err); ae != nil && ae.HTTPStatus == http.StatusBadRequest &&
			(strings.TrimSpace(c.FormValue("workspace_id")) == "" || strings.TrimSpace(c.FormValue("workspace_id")) == importWorkspaceNew) {
			return c.String(http.StatusBadRequest, langs.T(ctx, "error.workspace_name_required"))
		}
		return s.importRefusal(c, err)
	}

	instSvc := instancedom.NewService(s.db)
	if moveErr := instSvc.MoveInstance(ctx, instanceID, targetWorkspaceID); moveErr != nil {
		s.log.Error("move instance", "instance_id", instanceID, "workspace_id", targetWorkspaceID, "err", moveErr)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/settings")
}

// pushBlockedReason turns a sync-state failure into something the person
// looking at the settings page can act on.
//
// The two ways push breaks are indistinguishable in the raw error but need
// different fixes, and both previously surfaced as nothing at all:
//
//   - App not installed on the owning org  -> install it there
//   - App installed but lacking permissions -> grant them, then re-approve
//
// Anything else is reported verbatim rather than guessed at.
func pushBlockedReason(repo string, err error) string {
	owner := repo
	if i := strings.Index(repo, "/"); i > 0 {
		owner = repo[:i]
	}

	msg := err.Error()
	switch {
	case strings.Contains(msg, "find github app installation"):
		return fmt.Sprintf(
			"The GitHub App is not installed on %q, so pushing to %s is not possible. "+
				"Install it on that organisation and grant access to this repository.", owner, repo)
	case strings.Contains(msg, "404"):
		return fmt.Sprintf(
			"The GitHub App cannot see %s. Either it is not granted access to this repository, "+
				"or it lacks the contents/pull_requests permissions needed to write.", repo)
	default:
		return fmt.Sprintf("GitHub sync state could not be determined for %s: %v", repo, err)
	}
}

// loadInstanceRepoLinks loads read-only GitHub repo metadata for all instances
// that have a github_repo set. This is independent of GitHub App configuration.
func (s *Server) loadInstanceRepoLinks(ctx context.Context) []ui.InstanceRepoLink {
	type repoRow struct {
		ID        string `bun:"id"`
		Name      string `bun:"name"`
		Repo      string `bun:"github_repo"`
		Branch    string `bun:"github_branch"`
		BasePath  string `bun:"github_base_path"`
		CommitSHA string `bun:"github_commit_sha"`
	}

	var rows []repoRow
	err := s.db.NewSelect().
		TableExpr("strategy_instances").
		ColumnExpr("id, name, github_repo, github_branch, github_base_path, github_commit_sha").
		Where("github_repo != '' AND github_repo IS NOT NULL").
		OrderExpr("name ASC").
		Scan(ctx, &rows)
	if err != nil {
		return nil
	}

	links := make([]ui.InstanceRepoLink, 0, len(rows))
	for _, r := range rows {
		link := ui.InstanceRepoLink{
			InstanceID:   r.ID,
			InstanceName: r.Name,
			Repo:         r.Repo,
			Branch:       r.Branch,
			BasePath:     r.BasePath,
		}
		if len(r.CommitSHA) >= 7 {
			link.CommitSHA = r.CommitSHA[:7]
		}
		links = append(links, link)
	}
	return links
}

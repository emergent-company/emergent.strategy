package handler

import (
	"context"
	"net/http"
	"strings"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	instancedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	orgdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/org"
	workspacedom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/web"
)

// handleSettings renders the settings/status page.
func (s *Server) handleSettings(c echo.Context) error {
	ctx := c.Request().Context()

	data := ui.SettingsData{
		Memory:     s.probeMemoryHealth(ctx),
		Instances:  s.loadInstanceMemoryStatuses(ctx),
		GithubSync: s.loadGithubSyncStatuses(ctx),
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

	_, err = s.syncSvc.ImportFromGithub(c.Request().Context(), sync.ImportParams{
		InstanceID: instanceID,
		Branch:     branch,
	})
	if err != nil {
		s.log.Error("manual github import failed", "instance_id", instanceIDStr, "err", err)
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

	client := s.semanticSvc.Client()
	if client == nil {
		status.Error = langs.T(ctx, "error.memory_client_not_initialized")
		return status
	}

	// Fetch total artifact object count from Memory graph (best-effort).
	if count, err := client.CountArtifactObjects(ctx); err == nil {
		status.TotalGraphObjects = count
	}

	// Fetch detailed health from Memory server via the shared client.
	// Uses the same auth mode, connection pool, and retry logic as all other calls.
	healthCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	detail, err := client.HealthDetailed(healthCtx)
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

	type instanceRow struct {
		ID              string  `bun:"id"`
		Name            string  `bun:"name"`
		OrgName         string  `bun:"org_name"`
		WorkspaceID     string  `bun:"workspace_id"`
		GithubRepo      *string `bun:"github_repo"`
		GithubBranch    *string `bun:"github_branch"`
		GithubCommitSHA *string `bun:"github_commit_sha"`
	}

	// Load all workspaces once for the move dropdown.
	allWorkspaces := s.loadWorkspacesForAssignment(ctx)

	var instances []instanceRow
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
		OrderExpr("o.name ASC, si.name ASC").
		Scan(ctx, &instances)
	if err != nil {
		s.log.Error("failed to load instances for github sync status", "err", err)
		return nil
	}

	result := make([]ui.GithubSyncStatus, 0, len(instances))
	for _, inst := range instances {
		// Build workspace list excluding the one the instance already belongs to.
		otherWorkspaces := make([]ui.WorkspaceScanItem, 0, len(allWorkspaces))
		for _, ws := range allWorkspaces {
			if ws.ID != inst.WorkspaceID {
				otherWorkspaces = append(otherWorkspaces, ws)
			}
		}
		status := ui.GithubSyncStatus{
			InstanceID:   inst.ID,
			InstanceName: inst.Name,
			Configured:   s.syncSvc.IsConfigured(),
			Workspaces:   otherWorkspaces,
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
			// Check and update PR statuses lazily.
			s.syncSvc.CheckAndUpdateSyncStatus(ctx, instID)

			// Load last sync log entry.
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

			// Determine live sync state if GitHub App is configured and repo is linked.
			// Use a short timeout so a slow GitHub API call doesn't hang the settings page.
			if s.syncSvc.IsConfigured() && status.RepoLinked {
				stateCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
				stateResult, stateErr := s.syncSvc.DetermineSyncState(stateCtx, instID, "")
				cancel()
				if stateErr == nil {
					status.SyncState = string(stateResult.State)
					if len(stateResult.RemoteSHA) >= 7 {
						status.RemoteSHA = stateResult.RemoteSHA[:7]
					}
				}
			}
		}

		result = append(result, status)
	}
	return result
}

// loadInstanceMemoryStatuses loads per-instance memory sync status.
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

	workspaceIDStr := strings.TrimSpace(c.FormValue("workspace_id"))
	newWorkspaceName := strings.TrimSpace(c.FormValue("new_workspace_name"))

	// Sentinel from the "New workspace..." dropdown option.
	if workspaceIDStr == "__new__" {
		workspaceIDStr = ""
	}

	var targetWorkspaceID uuid.UUID

	if workspaceIDStr != "" {
		targetWorkspaceID, err = uuid.Parse(workspaceIDStr)
		if err != nil {
			return c.String(http.StatusBadRequest, langs.T(ctx, "error.invalid_workspace_id"))
		}
	} else {
		// Create a new org + workspace on the fly.
		if newWorkspaceName == "" {
			return c.String(http.StatusBadRequest, langs.T(ctx, "error.workspace_name_required"))
		}
		user := web.UserFromContext(ctx)
		actorID := audit.ActorFromContext(ctx)
		callerID := uuid.Nil
		if actorID != nil {
			callerID = *actorID
		}

		orgSvc := orgdom.NewService(s.db)
		newOrg, orgErr := orgSvc.GetOrCreate(ctx, newWorkspaceName, callerID)
		if orgErr != nil {
			s.log.Error("create org for instance move", "name", newWorkspaceName, "err", orgErr)
			return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
		}
		_, _ = orgSvc.AddMember(ctx, newOrg.ID, user.ID, "owner")

		wsSvc := workspacedom.NewService(s.db)
		ws, wsErr := wsSvc.CreateWorkspace(ctx, newWorkspaceName, &newWorkspaceName, newOrg.ID)
		if wsErr != nil {
			s.log.Error("create workspace for instance move", "name", newWorkspaceName, "err", wsErr)
			return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
		}
		targetWorkspaceID = ws.ID
	}

	instSvc := instancedom.NewService(s.db)
	if moveErr := instSvc.MoveInstance(ctx, instanceID, targetWorkspaceID); moveErr != nil {
		s.log.Error("move instance", "instance_id", instanceID, "workspace_id", targetWorkspaceID, "err", moveErr)
		return c.String(http.StatusInternalServerError, langs.T(ctx, "error.instance_create_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/settings")
}

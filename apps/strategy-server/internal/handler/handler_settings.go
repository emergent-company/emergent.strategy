package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/emergent-company/go-daisy/render"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/sync"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleSettings renders the settings/status page.
func (s *Server) handleSettings(c echo.Context) error {
	ctx := c.Request().Context()

	data := ui.SettingsData{
		Memory:     s.probeMemoryHealth(ctx),
		Instances:  s.loadInstanceMemoryStatuses(ctx),
		GithubSync: s.loadGithubSyncStatuses(ctx),
	}

	sidebarGroups := s.sidebarGroups(c)
	currentPath := c.Request().URL.Path

	render.RenderAuto(c.Response().Writer, c.Request(),
		ui.SettingsPage(currentPath, sidebarGroups, data),
		ui.SettingsContent(data),
	)
	return nil
}

// handleSettingsSync handles POST /settings/sync — triggers a manual GitHub sync
// for a specific instance. Redirects back to settings.
func (s *Server) handleSettingsSync(c echo.Context) error {
	if s.syncSvc == nil {
		return c.String(http.StatusServiceUnavailable, "GitHub sync is not configured")
	}

	instanceIDStr := c.FormValue("instance_id")
	if instanceIDStr == "" {
		return c.String(http.StatusBadRequest, "instance_id required")
	}
	instanceID, err := uuid.Parse(instanceIDStr)
	if err != nil {
		return c.String(http.StatusBadRequest, "invalid instance_id")
	}

	_, err = s.syncSvc.SyncToGithub(c.Request().Context(), sync.SyncParams{
		InstanceID: instanceID,
	})
	if err != nil {
		s.log.Error("manual github sync failed", "instance_id", instanceIDStr, "err", err)
		// Redirect back with error indicator — simple approach, no flash messages.
		return c.Redirect(http.StatusSeeOther, "/settings")
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

	// Fetch total artifact object count from Memory graph (best-effort).
	if client := s.semanticSvc.Client(); client != nil {
		if count, err := client.CountArtifactObjects(ctx); err == nil {
			status.TotalGraphObjects = count
		}
	}

	// Ping the Memory server health endpoint.
	reqCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, cfg.URL+"/api/health", nil)
	if err != nil {
		status.Error = fmt.Sprintf("build request: %v", err)
		return status
	}
	req.Header.Set("X-API-Key", cfg.Token)
	req.Header.Set("X-Project-ID", cfg.Project)

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		status.Error = fmt.Sprintf("ping failed: %v", err)
		return status
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		status.Error = fmt.Sprintf("server returned %d", resp.StatusCode)
		return status
	}

	var body struct {
		Version string `json:"version"`
		Checks  map[string]struct {
			Status string `json:"status"`
		} `json:"checks"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err == nil {
		status.Version = body.Version
		// Healthy only when database subsystem is healthy.
		if db, ok := body.Checks["database"]; ok && db.Status == "healthy" {
			status.Healthy = true
		} else {
			status.Error = "database subsystem not healthy"
		}
	} else {
		// If we can decode the response but the JSON is unexpected, still mark healthy
		// (server responded 200).
		status.Healthy = true
	}

	return status
}

// loadGithubSyncStatuses loads per-instance GitHub sync history from the sync log.
// Returns nil when the sync service is not configured.
func (s *Server) loadGithubSyncStatuses(ctx context.Context) []ui.GithubSyncStatus {
	if s.syncSvc == nil {
		return nil
	}

	type instanceRow struct {
		ID         string  `bun:"id"`
		Name       string  `bun:"name"`
		OrgName    string  `bun:"org_name"`
		GithubRepo *string `bun:"github_repo"`
	}

	var instances []instanceRow
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.github_repo").
		ColumnExpr("o.name AS org_name").
		Join("JOIN workspaces AS w ON w.id = si.workspace_id").
		Join("JOIN orgs AS o ON o.id = w.org_id").
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
		status := ui.GithubSyncStatus{
			InstanceID:   inst.ID,
			InstanceName: inst.Name,
			Configured:   s.syncSvc.IsConfigured(),
		}
		if inst.GithubRepo != nil && *inst.GithubRepo != "" {
			status.RepoLinked = true
			status.Repo = *inst.GithubRepo
		}

		// Load last sync log entry for this instance.
		instID, parseErr := uuid.Parse(inst.ID)
		if parseErr == nil {
			logs, histErr := s.syncSvc.GetSyncHistory(ctx, instID)
			if histErr == nil && len(logs) > 0 {
				last := logs[0]
				status.LastStatus = last.Status
				status.LastSyncAt = &last.CreatedAt
				if last.PRUrl != nil {
					status.LastSyncPR = *last.PRUrl
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



package handler

import (
	"context"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// loadInstanceSummaries loads non-test instances for sidebar navigation,
// joined with org names for grouping.
func (s *Server) loadInstanceSummaries(ctx context.Context) ([]ui.InstanceSummary, error) {
	var rows []struct {
		ID      string `bun:"id"`
		Name    string `bun:"name"`
		OrgID   string `bun:"org_id"`
		OrgName string `bun:"org_name"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name").
		ColumnExpr("o.id AS org_id, o.name AS org_name").
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
		return nil, fmt.Errorf("load instances: %w", err)
	}

	summaries := make([]ui.InstanceSummary, len(rows))
	for i, r := range rows {
		summaries[i] = ui.InstanceSummary{
			ID:      r.ID,
			Name:    r.Name,
			OrgID:   r.OrgID,
			OrgName: r.OrgName,
		}
	}
	return summaries, nil
}

// loadInstance loads a single strategy instance by ID.
func (s *Server) loadInstance(ctx context.Context, id string) (*domain.StrategyInstance, error) {
	var inst domain.StrategyInstance
	err := s.db.NewSelect().
		Model(&inst).
		Where("id = ?", id).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load instance %s: %w", id, err)
	}
	return &inst, nil
}

// hasArtifactType returns true if an artifact of the given type exists.
func (s *Server) hasArtifactType(ctx context.Context, instanceID, artifactType string) bool {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Count(ctx)
	return count > 0
}

// loadAllInstances loads non-test, non-archived instances with counts for the global dashboard.
func (s *Server) loadAllInstances(ctx context.Context) ([]ui.InstanceInfo, error) {
	var rows []struct {
		ID          string `bun:"id"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		WorkspaceID string `bun:"workspace_id"`
		OrgName     string `bun:"org_name"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_instances AS si").
		ColumnExpr("si.id, si.name, si.status, si.workspace_id").
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
		return nil, fmt.Errorf("load instances: %w", err)
	}

	infos := make([]ui.InstanceInfo, len(rows))
	for i, r := range rows {
		featureCount, _ := s.db.NewSelect().
			TableExpr("strategy_artifacts").
			Where("instance_id = ?", r.ID).
			Where("artifact_type = ?", domain.ArtifactTypeFeature).
			Count(ctx)

		artifactCount, _ := s.db.NewSelect().
			TableExpr("strategy_artifacts").
			Where("instance_id = ?", r.ID).
			Count(ctx)

		infos[i] = ui.InstanceInfo{
			ID:            r.ID,
			Name:          r.Name,
			Status:        r.Status,
			WorkspaceID:   r.WorkspaceID,
			OrgName:       r.OrgName,
			FeatureCount:  int(featureCount),
			ArtifactCount: int(artifactCount),
		}
	}
	return infos, nil
}

// loadWorkspaces loads non-test workspaces for the global dashboard.
func (s *Server) loadWorkspaces(ctx context.Context) ([]ui.WorkspaceInfo, error) {
	var workspaces []domain.Workspace
	err := s.db.NewSelect().
		Model(&workspaces).
		Where("deleted_at IS NULL").
		Where("github_owner NOT LIKE ?", "e2e-%").
		Where("github_owner NOT LIKE ?", "ripple-%").
		Where("github_owner NOT LIKE ?", "aim-ripple-%").
		OrderExpr("display_name ASC").
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load workspaces: %w", err)
	}

	infos := make([]ui.WorkspaceInfo, len(workspaces))
	for i, ws := range workspaces {
		name := ws.GithubOwner
		if ws.DisplayName != nil {
			name = *ws.DisplayName
		}
		infos[i] = ui.WorkspaceInfo{
			ID:          ws.ID.String(),
			DisplayName: name,
			GithubOwner: ws.GithubOwner,
		}
	}
	return infos, nil
}

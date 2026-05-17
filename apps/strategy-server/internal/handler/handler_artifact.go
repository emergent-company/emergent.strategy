package handler

import (
	"encoding/json"

	"github.com/emergent-company/go-daisy/render"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleArtifactView renders a read-only view of any artifact by its key.
func (s *Server) handleArtifactView(c echo.Context) error {
	instanceID := c.Param("id")
	artifactKey := c.Param("key")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	instance, err := s.loadInstance(ctx, instanceID)
	if err != nil {
		return echo.NewHTTPError(404, "Instance not found")
	}

	// Load the artifact
	var row struct {
		ArtifactKey  string          `bun:"artifact_key"`
		ArtifactType string          `bun:"artifact_type"`
		Name         string          `bun:"name"`
		Status       string          `bun:"status"`
		Track        string          `bun:"track"`
		Payload      json.RawMessage `bun:"payload"`
	}
	err = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, artifact_type, name, status, track, payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_key = ?", artifactKey).
		Scan(ctx, &row)
	if err != nil {
		s.log.Error("artifact not found", "err", err, "key", artifactKey)
		return echo.NewHTTPError(404, "Artifact not found")
	}

	var payload map[string]any
	if err := json.Unmarshal(row.Payload, &payload); err != nil {
		s.log.Error("failed to parse artifact payload", "err", err, "key", artifactKey)
		payload = map[string]any{"error": "Failed to parse payload"}
	}

	name := row.Name
	if name == "" {
		name = row.ArtifactKey
	}

	data := ui.ArtifactViewData{
		InstanceID:   instanceID,
		ArtifactKey:  row.ArtifactKey,
		ArtifactType: row.ArtifactType,
		Name:         name,
		Status:       row.Status,
		Track:        row.Track,
		Payload:      payload,
	}

	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)

	content := ui.ArtifactViewContent(data)

	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(name+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		content,
	)
	return nil
}

// handleArtifactViewByType renders the single artifact of a given type (for READY phase singletons).
func (s *Server) handleArtifactViewByType(artifactType string) echo.HandlerFunc {
	return func(c echo.Context) error {
		instanceID := c.Param("id")
		ctx := c.Request().Context()
		currentPath := c.Request().URL.Path

		instance, err := s.loadInstance(ctx, instanceID)
		if err != nil {
			return echo.NewHTTPError(404, "Instance not found")
		}

		// Load the artifact by type (singletons)
		var row struct {
			ArtifactKey  string          `bun:"artifact_key"`
			ArtifactType string          `bun:"artifact_type"`
			Name         string          `bun:"name"`
			Status       string          `bun:"status"`
			Track        string          `bun:"track"`
			Payload      json.RawMessage `bun:"payload"`
		}
		err = s.db.NewSelect().
			TableExpr("strategy_artifacts").
			ColumnExpr("artifact_key, artifact_type, name, status, track, payload").
			Where("instance_id = ?", instanceID).
			Where("artifact_type = ?", artifactType).
			Limit(1).
			Scan(ctx, &row)
		if err != nil {
			// No artifact of this type — show placeholder (not an error, just empty state).
			return s.renderArtifactPlaceholder(c, instance, instanceID, artifactType, currentPath)
		}

		var payload map[string]any
		if err := json.Unmarshal(row.Payload, &payload); err != nil {
			payload = map[string]any{"error": "Failed to parse payload"}
		}

		name := row.Name
		if name == "" {
			name = ui.FormatKey(artifactType)
		}

		data := ui.ArtifactViewData{
			InstanceID:   instanceID,
			ArtifactKey:  row.ArtifactKey,
			ArtifactType: row.ArtifactType,
			Name:         name,
			Status:       row.Status,
			Track:        row.Track,
			Payload:      payload,
		}

		tabs := s.strategyTabs(instanceID, currentPath)
		sidebarGroups := s.sidebarGroups(c)

		content := ui.ArtifactViewContent(data)

		render.RenderTriple(c.Response().Writer, c.Request(),
			ui.InstancePhaseFullPage(name+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
			ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
			content,
		)
		return nil
	}
}

// renderArtifactPlaceholder renders an empty-state placeholder when an artifact doesn't exist.
func (s *Server) renderArtifactPlaceholder(c echo.Context, instance *domain.StrategyInstance, instanceID, artifactType, currentPath string) error {
	tabs := s.strategyTabs(instanceID, currentPath)
	sidebarGroups := s.sidebarGroups(c)
	content := ui.PlaceholderContent(
		ui.FormatKey(artifactType),
		"This artifact has not been created yet. Use the MCP tools to author it.",
		"lucide--file-text",
	)
	render.RenderTriple(c.Response().Writer, c.Request(),
		ui.InstancePhaseFullPage(ui.FormatKey(artifactType)+" — "+instance.Name, currentPath, sidebarGroups, instance.Name, tabs, content),
		ui.InstanceChromeWithContent(instance.Name, tabs, currentPath, content),
		content,
	)
	return nil
}

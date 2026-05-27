package handler

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/audit"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
)

// handleInstallDefinitions handles POST /strategies/:id/fire/install-definitions.
// It loads all canonical track definitions from embedded templates and commits
// them into the instance in a single batch.
func (s *Server) handleInstallDefinitions(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	// List all canonical definition templates.
	allTemplates, err := embedded.ListTemplates()
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to list templates")
	}

	// Filter to FIRE/definitions/ and parse each YAML template.
	type defPayload struct {
		key          string
		artifactType string
		payload      json.RawMessage
	}

	var defs []defPayload
	for _, templatePath := range allTemplates {
		if !strings.HasPrefix(templatePath, "FIRE/definitions/") {
			continue
		}

		// Determine artifact type from path.
		artType := inferDefinitionType(templatePath)
		if artType == "" {
			continue
		}

		// Derive artifact key from path (strip .yaml extension).
		key := strings.TrimSuffix(templatePath, ".yaml")
		key = strings.TrimSuffix(key, ".yml")

		// Check if this definition already exists in the instance.
		exists, _ := s.db.NewSelect().
			TableExpr("strategy_artifacts").
			Where("instance_id = ?", instID).
			Where("artifact_key = ?", key).
			Exists(ctx)
		if exists {
			continue // skip — already imported
		}

		// Read and parse the YAML template.
		data, err := embedded.GetTemplate(templatePath)
		if err != nil {
			slog.WarnContext(ctx, "install-definitions: skip unreadable template",
				"path", templatePath, "err", err)
			continue
		}

		var yamlContent any
		if err := yaml.Unmarshal(data, &yamlContent); err != nil {
			slog.WarnContext(ctx, "install-definitions: skip invalid YAML",
				"path", templatePath, "err", err)
			continue
		}

		raw, err := json.Marshal(convertYAMLToJSON(yamlContent))
		if err != nil {
			continue
		}

		defs = append(defs, defPayload{key: key, artifactType: artType, payload: raw})
	}

	if len(defs) == 0 {
		// All definitions already exist — redirect back.
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/fire")
	}

	// Create all mutations in a single committed batch.
	batchID := uuid.New()
	now := time.Now().UTC()
	actorID := audit.ActorFromContext(ctx)
	source := string(audit.SourceFromContext(ctx))

	for _, def := range defs {
		m := &domain.StrategyMutation{
			ID:           uuid.New(),
			InstanceID:   instID,
			BatchID:      &batchID,
			ArtifactType: def.artifactType,
			ArtifactKey:  def.key,
			Action:       domain.MutationActionCreate,
			Payload:      def.payload,
			Status:       domain.MutationStatusCommitted,
			Source:       source,
			CreatedBy:    actorID,
			CreatedAt:    now,
		}
		if _, err := s.db.NewInsert().Model(m).Exec(ctx); err != nil {
			slog.ErrorContext(ctx, "install-definitions: insert failed",
				"key", def.key, "err", err)
			continue
		}
	}

	// Backfill the strategic index for the committed mutations.
	if s.strategySvc != nil {
		if _, err := s.strategySvc.BackfillIndex(ctx, instID); err != nil {
			slog.WarnContext(ctx, "install-definitions: backfill index failed",
				"instance_id", instanceID, "err", err)
		}
	}

	slog.InfoContext(ctx, "install-definitions: complete",
		"instance_id", instanceID, "definitions_installed", len(defs))

	audit.FromContext(ctx).Write(ctx, audit.Entry{
		EntityType: "strategy_instance",
		EntityID:   instID,
		Action:     "install_definitions",
		Source:     audit.SourceFromContext(ctx),
		ActorID:    actorID,
		Details: map[string]any{
			"count":    len(defs),
			"batch_id": batchID,
		},
	})

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/fire")
}

// inferDefinitionType maps a template path to an artifact type.
func inferDefinitionType(path string) string {
	switch {
	case strings.HasPrefix(path, "FIRE/definitions/commercial/"):
		return "commercial_def"
	case strings.HasPrefix(path, "FIRE/definitions/org_ops/"):
		return "org_ops_def"
	case strings.HasPrefix(path, "FIRE/definitions/strategy/"):
		return "strategy_def"
	default:
		return ""
	}
}

// convertYAMLToJSON recursively converts YAML-decoded values to JSON-compatible
// types (map[string]any instead of map[any]any).
func convertYAMLToJSON(v any) any {
	switch val := v.(type) {
	case map[string]any:
		m := make(map[string]any, len(val))
		for k, v := range val {
			m[k] = convertYAMLToJSON(v)
		}
		return m
	case map[any]any:
		m := make(map[string]any, len(val))
		for k, v := range val {
			m[fmt.Sprintf("%v", k)] = convertYAMLToJSON(v)
		}
		return m
	case []any:
		for i, item := range val {
			val[i] = convertYAMLToJSON(item)
		}
		return val
	default:
		return v
	}
}

package handler

import (
	"fmt"
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// ---------------------------------------------------------------------------
// READY phase bootstrap draft handlers
// ---------------------------------------------------------------------------

// readyDraftConfig defines the configuration for a single READY bootstrap draft action.
type readyDraftConfig struct {
	skillName    string
	artifactType string   // the artifact this skill produces
	prereqs      []string // artifact types that must exist before this can run
}

// readyDraftSkills maps URL path segment → draft config.
// URL pattern: POST /strategies/:id/ready/draft-<key>
var readyDraftSkills = map[string]readyDraftConfig{
	"north-star":  {skillName: "draft-north-star", artifactType: domain.ArtifactTypeNorthStar, prereqs: nil},
	"insights":    {skillName: "draft-insights", artifactType: domain.ArtifactTypeInsightAnalyses, prereqs: nil},
	"foundations": {skillName: "draft-foundations", artifactType: domain.ArtifactTypeStrategyFoundations, prereqs: []string{domain.ArtifactTypeNorthStar}},
	"opportunity": {skillName: "draft-opportunity", artifactType: "insight_opportunity", prereqs: []string{domain.ArtifactTypeInsightAnalyses}},
	"formula":     {skillName: "draft-formula", artifactType: domain.ArtifactTypeStrategyFormula, prereqs: []string{domain.ArtifactTypeNorthStar, domain.ArtifactTypeStrategyFoundations}},
	"roadmap":     {skillName: "draft-roadmap", artifactType: domain.ArtifactTypeRoadmap, prereqs: []string{domain.ArtifactTypeStrategyFormula, domain.ArtifactTypeStrategyFoundations}},
}

// handleReadyDraft handles POST /strategies/:id/ready/draft-:key.
// It looks up the draft config by key, enforces prerequisites, runs the bootstrap
// skill, and redirects to the draft review page.
func (s *Server) handleReadyDraft(c echo.Context) error {
	instanceID := c.Param("id")
	key := c.Param("key") // e.g. "north-star", "insights", "formula"
	ctx := c.Request().Context()

	cfg, ok := readyDraftSkills[key]
	if !ok {
		return echo.NewHTTPError(http.StatusNotFound, langs.T(ctx, "error.unknown_draft_key"))
	}

	if s.skillExecutor == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.skill_executor_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	// Enforce prerequisite artifacts.
	for _, prereq := range cfg.prereqs {
		if !s.hasArtifactType(ctx, instanceID, prereq) {
			return echo.NewHTTPError(http.StatusBadRequest,
				fmt.Sprintf("%s: %q → %q", langs.T(ctx, "error.ready_draft_prereq_missing"), prereq, cfg.artifactType))
		}
	}

	params := map[string]any{
		"_trigger":         "manual",
		"_trigger_context": map[string]any{"source": "ready_draft_button", "key": key},
	}

	result, err := s.skillExecutor.RunChunked(ctx, instID, cfg.skillName, params)
	if err != nil {
		s.log.Error("ready draft skill failed", "instance_id", instanceID, "skill", cfg.skillName, "err", err)
		// Redirect back to READY page — user sees their page intact and can retry.
		// Error is logged server-side; a flash message system can surface it later.
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/ready")
	}

	s.log.Info("ready draft complete", "instance_id", instanceID, "skill", cfg.skillName, "batch_id", result.BatchID)
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+result.BatchID.String())
}

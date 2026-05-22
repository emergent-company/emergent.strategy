package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// handleAlignPortfolio handles POST /strategies/:id/fire/align-portfolio.
// It runs the align-portfolio skill to sync value models and definitions with
// the current roadmap and strategy formula, then redirects to the draft review page.
func (s *Server) handleAlignPortfolio(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.skillExecutor == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "Skill executor not available — LLM provider required for portfolio alignment")
	}

	if !s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeRoadmap) {
		return echo.NewHTTPError(http.StatusBadRequest, "roadmap_recipe must exist before aligning portfolio")
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	params := map[string]any{
		"_trigger":         "manual",
		"_trigger_context": map[string]any{"source": "fire_align_button"},
	}

	result, err := s.skillExecutor.RunChunked(ctx, instID, "align-portfolio", params)
	if err != nil {
		s.log.Error("align-portfolio skill failed", "instance_id", instanceID, "err", err)
		// Redirect back to FIRE page — user sees their page intact and can retry.
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/fire")
	}

	s.log.Info("align-portfolio complete", "instance_id", instanceID, "batch_id", result.BatchID)
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+result.BatchID.String())
}

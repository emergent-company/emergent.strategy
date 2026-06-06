package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
)

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/draft-lra
// ---------------------------------------------------------------------------

// handleDraftLRA runs the draft-lra skill and redirects to the draft review page.
// Requires north_star to be present (the skill needs strategy context to generate
// a meaningful LRA). When no LLM is configured, the executor falls back to Run()
// which returns a skeleton LRA from the skill prompt in non-LLM mode.
func (s *Server) handleDraftLRA(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.skillExecutor == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.skill_executor_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	params := map[string]any{
		"_trigger":         "manual",
		"_trigger_context": map[string]any{"source": "draft_lra_button"},
	}

	result, err := s.skillExecutor.RunChunked(ctx, instID, "draft-lra", params)
	if err != nil {
		s.log.Error("draft-lra skill failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.draft_assessment_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+result.BatchID.String())
}

package handler

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"
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
		return echo.NewHTTPError(http.StatusServiceUnavailable, "Skill executor not available — LLM provider required for LRA drafting")
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}

	params := map[string]any{
		"_trigger":         "manual",
		"_trigger_context": map[string]any{"source": "draft_lra_button"},
	}

	result, err := s.skillExecutor.RunChunked(ctx, instID, "draft-lra", params)
	if err != nil {
		s.log.Error("draft-lra skill failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "draft LRA failed: "+err.Error())
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+result.BatchID.String())
}

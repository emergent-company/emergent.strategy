package handler

import (
	"bytes"
	"errors"
	"fmt"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/runs — Start AIM cycle
// ---------------------------------------------------------------------------

// handleStartAIMRun starts an orchestrated AIM cycle run and redirects to the run panel.
func (s *Server) handleStartAIMRun(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.orchestrationEngine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "orchestration not available")
	}

	run, err := s.orchestrationEngine.StartRun(ctx, aimdom.WorkflowName, instanceID, map[string]any{
		"instance_id": instanceID,
	})
	if err != nil {
		if errors.Is(err, orchestration.ErrAlreadyActive) {
			// Browser request — redirect to AIM page with a message.
			// HTMX request — return 409 so the UI can show a toast.
			if c.Request().Header.Get("HX-Request") == "true" {
				return c.String(http.StatusConflict, "An AIM cycle is already running for this instance")
			}
			return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
		}
		s.log.Error("failed to start AIM cycle run", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to start AIM cycle")
	}

	// Redirect browser to the run panel.
	return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s/aim/runs/%s", instanceID, run.ID))
}

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/runs/:runID — Run panel
// ---------------------------------------------------------------------------

// handleGetAIMRun loads the run and renders the run panel.
func (s *Server) handleGetAIMRun(c echo.Context) error {
	instanceID := c.Param("id")
	runIDStr := c.Param("runID")
	ctx := c.Request().Context()

	if s.orchestrationEngine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "orchestration not available")
	}

	runID, err := uuid.Parse(runIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid run ID")
	}

	run, err := s.orchestrationEngine.GetRun(ctx, runID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "run not found")
	}

	data := s.buildRunPanelData(instanceID, run)
	content := ui.AimRunPanelContent(data)
	return s.renderInstancePage(c, "AIM Cycle Run", ui.PhaseRenderData{
		Title:   "AIM Cycle Run",
		Content: content,
	})
}

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/runs/:runID/stream — SSE event stream
// ---------------------------------------------------------------------------

// handleAIMRunStream opens an SSE connection and streams orchestration events.
func (s *Server) handleAIMRunStream(c echo.Context) error {
	runIDStr := c.Param("runID")
	ctx := c.Request().Context()

	if s.orchestrationEngine == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "orchestration not available")
	}

	runID, err := uuid.Parse(runIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid run ID")
	}

	// Set SSE headers.
	w := c.Response().Writer
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	c.Response().WriteHeader(http.StatusOK)

	// Flush helper.
	flush := func() {
		if f, ok := w.(http.Flusher); ok {
			f.Flush()
		}
	}

	// renderTimeline fetches the latest run state and renders the timeline HTML fragment.
	// HTMX SSE extension swaps the returned HTML directly into #aim-run-timeline.
	instanceID := c.Param("id")
	renderTimeline := func() (string, orchestration.RunStatus) {
		run, err := s.orchestrationEngine.GetRun(ctx, runID)
		if err != nil {
			return "", ""
		}
		data := s.buildRunPanelData(instanceID, run)
		var buf bytes.Buffer
		_ = ui.AimRunTimeline(data).Render(ctx, &buf)
		return buf.String(), run.Status
	}

	// Poll the run state every 2 seconds and push HTML to the browser.
	// This is simpler and more reliable than relying on fanout event delivery,
	// which has a race between the worker goroutine and the SSE subscriber registration.
	// Only send when the state actually changes to avoid redundant swaps.
	var lastHTML string
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			html, status := renderTimeline()
			if html != "" && html != lastHTML {
				_, _ = fmt.Fprintf(w, "data: %s\n\n", html)
				flush()
				lastHTML = html
			}
			// Stop polling once the run reaches a terminal state.
			if status == orchestration.StatusCompleted ||
				status == orchestration.StatusAborted ||
				status == orchestration.StatusFailed {
				return nil
			}

		case <-ctx.Done():
			return nil
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// buildRunPanelData converts a Run into the view model for the run panel template.
func (s *Server) buildRunPanelData(instanceID string, run *orchestration.Run) ui.AimRunPanelData {
	stepRows := make([]ui.AimRunStepRow, len(run.Steps))
	anyStepUsedLLM := false
	for i, sl := range run.Steps {
		llmUsed, _ := sl.Meta["llm_used"].(bool)
		if llmUsed {
			anyStepUsedLLM = true
		}
		stepRows[i] = ui.AimRunStepRow{
			Name:    sl.Name,
			Status:  sl.Status,
			BatchID: sl.BatchID,
			Error:   sl.Error,
			LLMUsed: llmUsed,
		}
	}
	// Show AI-assisted mode whenever the LLM is wired (even while the run is in
	// progress and no step has set llm_used yet), or once any step has used it.
	llmMode := s.llmEnabled || anyStepUsedLLM
	return ui.AimRunPanelData{
		InstanceID:   instanceID,
		RunID:        run.ID.String(),
		WorkflowName: run.WorkflowName,
		Status:       string(run.Status),
		CurrentStep:  run.CurrentStep,
		Steps:        stepRows,
		CreatedAt:    run.CreatedAt.Format(time.RFC3339),
		StreamURL:    fmt.Sprintf("/strategies/%s/aim/runs/%s/stream", instanceID, run.ID),
		LLMMode:      llmMode,
		LLMEnabled:   s.llmEnabled,
	}
}

package handler

import (
	"encoding/json"
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

	data := buildRunPanelData(instanceID, run)
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

	// Subscribe to events.
	ch := s.orchestrationEngine.Subscribe(runID)
	defer s.orchestrationEngine.Unsubscribe(runID, ch)

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

	// Send a ping immediately to establish the connection.
	_, _ = fmt.Fprintf(w, ": ping\n\n")
	flush()

	heartbeat := time.NewTicker(15 * time.Second)
	defer heartbeat.Stop()

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return nil
			}
			raw, err := json.Marshal(ev)
			if err != nil {
				continue
			}
			_, _ = fmt.Fprintf(w, "data: %s\n\n", raw)
			flush()

			// Close the stream when the run reaches a terminal state.
			if ev.Status == orchestration.StatusCompleted ||
				ev.Status == orchestration.StatusAborted ||
				ev.Status == orchestration.StatusFailed {
				return nil
			}

		case <-heartbeat.C:
			_, _ = fmt.Fprintf(w, ": heartbeat\n\n")
			flush()

		case <-ctx.Done():
			return nil
		}
	}
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// buildRunPanelData converts a Run into the view model for the run panel template.
func buildRunPanelData(instanceID string, run *orchestration.Run) ui.AimRunPanelData {
	stepRows := make([]ui.AimRunStepRow, len(run.Steps))
	llmMode := false
	for i, sl := range run.Steps {
		llmUsed, _ := sl.Meta["llm_used"].(bool)
		if llmUsed {
			llmMode = true
		}
		stepRows[i] = ui.AimRunStepRow{
			Name:    sl.Name,
			Status:  sl.Status,
			BatchID: sl.BatchID,
			Error:   sl.Error,
			LLMUsed: llmUsed,
		}
	}
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
	}
}

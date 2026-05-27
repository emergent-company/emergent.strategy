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
// POST /strategies/:id/aim/runs/:runID/abort — Abort a running cycle
// ---------------------------------------------------------------------------

// handleAbortAIMRun gracefully aborts an active AIM cycle run.
func (s *Server) handleAbortAIMRun(c echo.Context) error {
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

	if err := s.orchestrationEngine.Abort(ctx, runID); err != nil {
		s.log.Error("failed to abort AIM cycle run", "run_id", runID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to abort run")
	}

	// Redirect back to the run panel to show updated status.
	return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s/aim/runs/%s", instanceID, runID))
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/runs/:runID/retry — Retry a failed cycle step
// ---------------------------------------------------------------------------

// handleRetryAIMRun retries a failed AIM cycle run from the failed step.
func (s *Server) handleRetryAIMRun(c echo.Context) error {
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

	if err := s.orchestrationEngine.Retry(ctx, runID); err != nil {
		s.log.Error("failed to retry AIM cycle run", "run_id", runID, "err", err)
		if c.Request().Header.Get("HX-Request") == "true" {
			return c.String(http.StatusConflict, err.Error())
		}
		return echo.NewHTTPError(http.StatusConflict, err.Error())
	}

	// Redirect back to the run panel — it will reconnect SSE and show progress.
	return c.Redirect(http.StatusSeeOther, fmt.Sprintf("/strategies/%s/aim/runs/%s", instanceID, runID))
}

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/runs — Cycle runs listing
// ---------------------------------------------------------------------------

// handleListAIMRuns renders the cycle runs history page with the active run (if any) at the top.
func (s *Server) handleListAIMRuns(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	data := ui.AimCycleRunsData{
		InstanceID: instanceID,
	}

	if s.orchestrationEngine != nil {
		runs, err := s.orchestrationEngine.ListRuns(ctx, aimdom.WorkflowName, instanceID)
		if err != nil {
			s.log.Error("failed to list AIM runs", "instance_id", instanceID, "err", err)
		} else {
			for _, run := range runs {
				row := s.buildRunListRow(instanceID, run)
				data.Runs = append(data.Runs, row)
			}
		}
	}

	content := ui.AimCycleRunsContent(data)
	return s.renderInstancePage(c, "Cycle Runs", ui.PhaseRenderData{
		Title:   "Cycle Runs",
		Content: content,
	})
}

// buildRunListRow converts a Run into a summary row for the run listing.
func (s *Server) buildRunListRow(instanceID string, run *orchestration.Run) ui.AimCycleRunRow {
	// Count completed steps and total tokens; extract key outcome metadata.
	var completedSteps int
	var totalTokens int
	var totalDuration float64
	var artifactTypes []string
	var calibrationDecision string
	var okrHitRatePct float64
	var tracksChanged int
	anyLLM := false
	seenTypes := make(map[string]bool)
	for _, sl := range run.Steps {
		if sl.Status == "done" {
			completedSteps++
		}
		llmUsed, _ := sl.Meta["llm_used"].(bool)
		if llmUsed {
			anyLLM = true
		}
		// Token extraction (handles both int and float64 from JSON round-trip).
		inputTokens := metaInt(sl.Meta, "input_tokens")
		outputTokens := metaInt(sl.Meta, "output_tokens")
		totalTokens += inputTokens + outputTokens
		if sl.StartedAt != nil && sl.FinishedAt != nil {
			totalDuration += sl.FinishedAt.Sub(*sl.StartedAt).Seconds()
		}
		if atRaw, ok := sl.Meta["artifact_types"].([]any); ok {
			for _, v := range atRaw {
				if s, ok := v.(string); ok && !seenTypes[s] {
					seenTypes[s] = true
					artifactTypes = append(artifactTypes, s)
				}
			}
		}
		// Step-specific outcome data.
		if sl.Name == "draft_calibration" {
			if d, ok := sl.Meta["suggested_decision"].(string); ok {
				calibrationDecision = d
			}
			okrHitRatePct = metaFloat(sl.Meta, "okr_hit_rate_pct")
		}
		if sl.Name == "align_portfolio" {
			tracksChanged = metaInt(sl.Meta, "tracks_changed")
		}
	}

	return ui.AimCycleRunRow{
		RunID:               run.ID.String(),
		InstanceID:          instanceID,
		Status:              string(run.Status),
		CurrentStep:         run.CurrentStep,
		TotalSteps:          len(run.Steps),
		CompletedSteps:      completedSteps,
		TotalTokens:         totalTokens,
		DurationSec:         totalDuration,
		ArtifactTypes:       artifactTypes,
		LLMUsed:             anyLLM || s.llmEnabled,
		CreatedAt:           run.CreatedAt.Format("2 Jan 15:04"),
		Error:               run.Error,
		CalibrationDecision: calibrationDecision,
		OKRHitRatePct:       okrHitRatePct,
		TracksChanged:       tracksChanged,
	}
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

		// Extract enrichment data from step metadata (set by executor).
		var artifactTypes []string
		if atRaw, ok := sl.Meta["artifact_types"].([]any); ok {
			for _, v := range atRaw {
				if s, ok := v.(string); ok {
					artifactTypes = append(artifactTypes, s)
				}
			}
		}
		inputTokens, _ := sl.Meta["input_tokens"].(int)
		outputTokens, _ := sl.Meta["output_tokens"].(int)
		// Token values stored as float64 after JSON round-trip.
		if inputTokens == 0 {
			if f, ok := sl.Meta["input_tokens"].(float64); ok {
				inputTokens = int(f)
			}
		}
		if outputTokens == 0 {
			if f, ok := sl.Meta["output_tokens"].(float64); ok {
				outputTokens = int(f)
			}
		}

		// Compute duration from step timestamps.
		var durationSec float64
		if sl.StartedAt != nil && sl.FinishedAt != nil {
			durationSec = sl.FinishedAt.Sub(*sl.StartedAt).Seconds()
		}

		// Extract step-specific metadata.
		autoAdvanced, _ := sl.Meta["auto_advanced"].(bool)
		autoAdvancedReason, _ := sl.Meta["auto_advanced_reason"].(string)
		suggestedDecision, _ := sl.Meta["suggested_decision"].(string)
		skipped, _ := sl.Meta["skipped"].(bool)
		skippedReason, _ := sl.Meta["reason"].(string)

		// Build artifact links for completed steps.
		var artifactLinks []ui.ArtifactLink
		if sl.Status == "done" {
			linkTypes := artifactTypes
			if len(linkTypes) == 0 {
				linkTypes = inferArtifactTypes(sl.Name)
			}
			for _, at := range linkTypes {
				if link, ok := artifactLink(at, instanceID); ok {
					artifactLinks = append(artifactLinks, link)
				}
			}
			// Special case: snapshot_cycle stores version_id in meta.
			if versionID, ok := sl.Meta["version_id"].(string); ok && versionID != "" {
				artifactLinks = append(artifactLinks, ui.ArtifactLink{
					Label: "Published Version",
					Href:  "/strategies/" + instanceID + "/aim/versions/" + versionID,
					Icon:  "lucide--history",
				})
			}
		}

		stepRows[i] = ui.AimRunStepRow{
			Name:            sl.Name,
			Status:          sl.Status,
			BatchID:         sl.BatchID,
			Error:           sl.Error,
			LLMUsed:         llmUsed,
			TotalTokens:     inputTokens + outputTokens,
			DurationSec:     durationSec,
			ArtifactTypes:   artifactTypes,
			ArtifactLinks:   artifactLinks,

			AutoAdvanced:       autoAdvanced,
			AutoAdvancedReason: autoAdvancedReason,

			OKRCount:        metaInt(sl.Meta, "okr_count"),
			AssumptionCount: metaInt(sl.Meta, "assumption_count"),

			SuggestedDecision: suggestedDecision,
			OKRHitRatePct:     metaFloat(sl.Meta, "okr_hit_rate_pct"),
			InvalidatedCount:  metaInt(sl.Meta, "invalidated_count"),

			TracksProcessed:  metaInt(sl.Meta, "tracks_processed"),
			TracksChanged:    metaInt(sl.Meta, "tracks_changed"),
			TotalActivated:   metaInt(sl.Meta, "total_activated"),
			TotalDeactivated: metaInt(sl.Meta, "total_deactivated"),
			Skipped:          skipped,
			SkippedReason:    skippedReason,
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

// metaInt extracts an int from step metadata, handling JSON round-trip float64.
func metaInt(m map[string]any, key string) int {
	if v, ok := m[key].(int); ok {
		return v
	}
	if f, ok := m[key].(float64); ok {
		return int(f)
	}
	return 0
}

// metaFloat extracts a float64 from step metadata.
func metaFloat(m map[string]any, key string) float64 {
	if f, ok := m[key].(float64); ok {
		return f
	}
	if v, ok := m[key].(int); ok {
		return float64(v)
	}
	return 0
}

// inferArtifactTypes returns the expected artifact types for a step when
// artifact_types is not present in the step metadata.
func inferArtifactTypes(stepName string) []string {
	switch stepName {
	case "draft_assessment":
		return []string{"assessment_report"}
	case "draft_calibration":
		return []string{"calibration_memo"}
	case "adapt_strategy":
		return []string{"strategy_formula", "roadmap_recipe"}
	case "adapt_foundations":
		return []string{"north_star", "strategy_foundations"}
	case "snapshot_cycle":
		return nil // handled separately via version_id in step meta
	default:
		return nil
	}
}

// artifactLink builds a UI link for a singleton artifact type.
// Returns false for keyed artifact types (features, value models) that
// require a specific key to build a URL.
func artifactLink(artifactType, instanceID string) (ui.ArtifactLink, bool) {
	type linkDef struct {
		label string
		path  string
		icon  string
	}
	defs := map[string]linkDef{
		"north_star":                  {"North Star", "/ready/north-star", "lucide--star"},
		"insight_analyses":            {"Insight Analyses", "/ready/insights", "lucide--search"},
		"strategy_foundations":        {"Strategy Foundations", "/ready/foundations", "lucide--building"},
		"insight_opportunity":         {"Validated Opportunity", "/ready/opportunity", "lucide--lightbulb"},
		"strategy_formula":            {"Strategy Formula", "/ready/formula", "lucide--beaker"},
		"roadmap_recipe":              {"Roadmap Recipe", "/ready/roadmap", "lucide--map"},
		"product_portfolio":           {"Product Portfolio", "/ready/portfolio", "lucide--package"},
		"living_reality_assessment":   {"Living Reality Assessment", "/aim/lra", "lucide--eye"},
		"assessment_report":           {"Assessment Report", "/aim/assessment", "lucide--clipboard-check"},
		"calibration_memo":            {"Calibration Memo", "/aim/calibration", "lucide--sliders-horizontal"},
	}
	def, ok := defs[artifactType]
	if !ok {
		return ui.ArtifactLink{}, false
	}
	return ui.ArtifactLink{
		Label: def.label,
		Href:  "/strategies/" + instanceID + def.path,
		Icon:  def.icon,
	}, true
}

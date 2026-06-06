package handler

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/a-h/templ"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

// isSkillRunning returns true when there is already an active (running) skill run
// for the given instance. Used as a server-side concurrency guard to prevent
// double-submit from starting multiple LLM calls in parallel.
func (s *Server) isSkillRunning(ctx context.Context, instanceID uuid.UUID) bool {
	if s.skillRunSvc == nil {
		return false
	}
	active, _ := s.skillRunSvc.ActiveForInstance(ctx, instanceID)
	return active != nil
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/draft-assessment
// ---------------------------------------------------------------------------

// handleDraftAssessment calls DraftAssessment and redirects to the draft review screen.
func (s *Server) handleDraftAssessment(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.aimSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.aim_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.isSkillRunning(ctx, instID) {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
	}

	batchID, _, err := s.aimSvc.DraftAssessment(ctx, instID)
	if err != nil {
		s.log.Error("draft assessment failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.draft_assessment_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+batchID.String())
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/draft-calibration
// ---------------------------------------------------------------------------

// handleDraftCalibration calls DraftCalibration and redirects to the draft review screen.
func (s *Server) handleDraftCalibration(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.aimSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.aim_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.isSkillRunning(ctx, instID) {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
	}

	batchID, _, err := s.aimSvc.DraftCalibration(ctx, instID)
	if err != nil {
		s.log.Error("draft calibration failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.draft_calibration_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+batchID.String())
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/apply-calibration
// ---------------------------------------------------------------------------

// handleApplyCalibration runs the adapt-strategy skill (when executor is available)
// or falls back to the legacy ApplyCalibration stub. Redirects to the draft review page.
func (s *Server) handleApplyCalibration(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.isSkillRunning(ctx, instID) {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
	}

	// Primary path: skill executor runs adapt-strategy chunked.
	if s.skillExecutor != nil {
		params := map[string]any{
			"_trigger":         "aim_cycle",
			"_trigger_context": map[string]any{"source": "apply_calibration_button"},
		}
		result, runErr := s.skillExecutor.RunChunked(ctx, instID, "adapt-strategy", params)
		if runErr != nil {
			s.log.Error("apply calibration (adapt-strategy) failed", "instance_id", instanceID, "err", runErr)
			return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.apply_calibration_failed"))
		}
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+result.BatchID.String())
	}

	// Fallback: legacy stub when executor is nil (e.g. no LLM configured).
	if s.aimSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.aim_not_available"))
	}

	batchID, _, err := s.aimSvc.ApplyCalibration(ctx, instID)
	if err != nil {
		s.log.Error("apply calibration (legacy) failed", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.apply_calibration_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+batchID.String())
}

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/draft-review/:batchID
// ---------------------------------------------------------------------------

// handleDraftReview renders the draft review screen for a staged batch.
func (s *Server) handleDraftReview(c echo.Context) error {
	instanceID := c.Param("id")
	batchIDStr := c.Param("batchID")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_batch_id"))
	}

	// Load all staged mutations for this batch (including payload for preview).
	type mutRow struct {
		ArtifactType     string          `bun:"artifact_type"`
		ArtifactKey      string          `bun:"artifact_key"`
		Action           string          `bun:"action"`
		BatchDescription *string         `bun:"batch_description"`
		Payload          json.RawMessage `bun:"payload"`
		BatchMetadata    json.RawMessage `bun:"batch_metadata"`
	}
	var rows []mutRow
	err = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("artifact_type, artifact_key, action, batch_description, payload, batch_metadata").
		Where("batch_id = ?", batchID).
		Where("status = ?", domain.MutationStatusStaged).
		OrderExpr("created_at ASC").
		Scan(ctx, &rows)
	if err != nil {
		s.log.Error("failed to load draft review batch", "batch_id", batchIDStr, "err", err)
		return echo.NewHTTPError(http.StatusNotFound, langs.T(ctx, "error.batch_not_found"))
	}
	if len(rows) == 0 {
		// Batch may have been committed or discarded already.
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
	}

	description := ""
	if rows[0].BatchDescription != nil {
		description = *rows[0].BatchDescription
	}

	// Extract per-artifact change summaries from batch_metadata (if present).
	// The skill executor stores these as {"change_summaries": {"strategy_formula": "...", ...}}.
	changeSummaries := make(map[string]string)
	for _, r := range rows {
		if len(r.BatchMetadata) > 0 {
			var meta struct {
				ChangeSummaries map[string]string `json:"change_summaries"`
			}
			if err := json.Unmarshal(r.BatchMetadata, &meta); err == nil && len(meta.ChangeSummaries) > 0 {
				changeSummaries = meta.ChangeSummaries
				break // same metadata on all mutations in the batch
			}
		}
	}

	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: currentPath,
		ScreenID:    "aim-draft-review",
		TabGroup:    "aim",
	}

	// Build items with inline previews — a single unified list.
	items := make([]ui.AimDraftReviewItem, 0, len(rows))
	for _, r := range rows {
		// Look up change summary by artifact_type first (the executor stores
		// summaries keyed by artifact type), then fall back to the artifact key
		// with dashes converted to underscores (for legacy batches).
		summary := changeSummaries[r.ArtifactType]
		if summary == "" {
			summary = changeSummaries[strings.ReplaceAll(r.ArtifactKey, "-", "_")]
		}

		// Build bespoke preview for this item (if payload is available).
		var preview templ.Component
		if len(r.Payload) > 0 {
			var payload map[string]any
			if err := json.Unmarshal(r.Payload, &payload); err == nil {
				preview = s.bespokeContent(ctx, instanceID, "", navCtx, r.ArtifactType, r.ArtifactKey, r.ArtifactKey, "staged", payload)
			}
		}

		items = append(items, ui.AimDraftReviewItem{
			ArtifactType:  r.ArtifactType,
			ArtifactKey:   r.ArtifactKey,
			Action:        r.Action,
			ChangeSummary: summary,
			Preview:       preview,
		})
	}

	data := ui.AimDraftReviewData{
		NavContext:  navCtx,
		InstanceID:  instanceID,
		BatchID:     batchIDStr,
		Description: description,
		Items:       items,
	}

	content := ui.AimDraftReviewContent(data)
	title := langs.T(ctx, "page.draft_review")
	return s.renderInstancePage(c, title, ui.PhaseRenderData{
		Title:   title,
		Content: content,
	})
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/draft-review/:batchID/commit
// ---------------------------------------------------------------------------

// handleDraftCommit commits a staged AI-draft batch and redirects to the appropriate AIM sub-page.
func (s *Server) handleDraftCommit(c echo.Context) error {
	instanceID := c.Param("id")
	batchIDStr := c.Param("batchID")
	ctx := c.Request().Context()

	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_batch_id"))
	}

	// Determine the primary artifact type before committing (for redirect routing).
	var primaryArtifactType string
	_ = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("artifact_type").
		Where("batch_id = ?", batchID).
		Where("status = ?", domain.MutationStatusStaged).
		Limit(1).
		Scan(ctx, &primaryArtifactType)

	// Commit the batch via the strategy service so that strategy_artifacts is
	// updated atomically alongside strategy_mutations. The old approach (raw SQL
	// + no-op deriveIndexForBatch) left strategy_artifacts stale, which caused
	// ApplyCalibration to fail because it queries strategy_artifacts for the memo.
	instID, parseErr := uuid.Parse(instanceID)
	if parseErr != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	if s.strategySvc != nil {
		if _, err = s.strategySvc.CommitBatch(ctx, batchID); err != nil {
			// Treat "batch not found" as an idempotent success — the batch was
			// already committed by a prior request (double-submit).
			if errors.Is(err, apperror.ErrBatchNotFound) {
				s.log.Info("draft batch already committed (double-submit)", "batch_id", batchIDStr)
				// Still resume any orchestration run waiting on this batch —
				// the original commit may have lost the resume signal.
				s.resumeOrchestrationForBatch(context.Background(), batchIDStr, true)
				return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
			}
			s.log.Error("failed to commit draft batch", "batch_id", batchIDStr, "err", err)
			return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.commit_failed"))
		}
	} else {
		// Fallback: raw SQL only (no index derivation) — strategySvc should always be wired.
		s.log.Warn("strategySvc not wired — strategic index will not be updated", "batch_id", batchIDStr)
		_, err = s.db.NewUpdate().
			Model((*domain.StrategyMutation)(nil)).
			Set("status = ?", domain.MutationStatusCommitted).
			Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
			Exec(ctx)
		if err != nil {
			s.log.Error("failed to commit draft batch (fallback)", "batch_id", batchIDStr, "err", err)
			return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.commit_failed"))
		}
	}

	// Look up any orchestration run waiting on this batch and resume it
	// immediately — the resume is just a channel signal, no I/O involved.
	// Use a detached context so it works even if the HTTP client disconnected.
	var orchestrationRunID string
	if s.orchestrationEngine != nil {
		run, findErr := s.orchestrationEngine.FindRunByBatch(context.Background(), batchIDStr)
		if findErr == nil && run != nil {
			orchestrationRunID = run.ID.String()
		}
	}
	s.resumeOrchestrationForBatch(context.Background(), batchIDStr, true)

	// Run the post-commit pipeline asynchronously. The commit is already
	// persisted — no reason to block the HTTP response while ripple analysis,
	// semantic classification, and convergence run (can take 5-30s).
	if s.postCommitPipeline != nil {
		pipeline := s.postCommitPipeline
		log := s.log
		go func() {
			defer func() {
				if r := recover(); r != nil {
					log.Error("postcommit: recovered panic in async pipeline",
						"instance_id", instanceID,
						"batch_id", batchIDStr,
						"panic", fmt.Sprintf("%v", r),
					)
				}
			}()

			result := pipeline.Run(context.Background(), instID, batchID)
			log.Info("postcommit: pipeline complete",
				"instance_id", instanceID,
				"batch_id", batchIDStr,
				"new_signals", result.NewSignals,
				"resolved_signals", result.ResolvedSignals,
				"active_total", result.ActiveTotal,
				"convergence_iters", result.ConvergenceIters,
			)
		}()
	}

	// If this commit was part of an orchestration run, return to the run panel.
	if orchestrationRunID != "" {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/runs/"+orchestrationRunID)
	}

	// For apply-calibration batches (strategy_formula / north_star / roadmap_recipe),
	// auto-publish a version snapshot so the AIM cycle is complete, then land on
	// the versions page rather than bouncing the user to /ready.
	if isApplyCalibrationArtifactType(primaryArtifactType) && s.versionSvc != nil {
		if _, pubErr := s.versionSvc.Publish(ctx, instID, "", "Published after applying AIM calibration"); pubErr != nil {
			s.log.Warn("auto-publish after apply-calibration failed (non-fatal)", "instance_id", instanceID, "err", pubErr)
		}
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/versions")
	}

	// After committing, check whether another staged batch is waiting for review
	// on this instance. If so, redirect directly to it so the user can continue
	// reviewing without returning to the dashboard first (task 7.3).
	if nextBatchID := s.nextPendingBatchID(ctx, instanceID, batchIDStr); nextBatchID != "" {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/draft-review/"+nextBatchID)
	}

	// Otherwise redirect to the relevant AIM sub-page based on artifact type.
	return c.Redirect(http.StatusSeeOther, redirectAfterCommit(instanceID, primaryArtifactType))
}

// nextPendingBatchID returns the batch_id of the next staged batch for an
// instance, excluding the just-committed batch. Returns "" if none.
func (s *Server) nextPendingBatchID(ctx context.Context, instanceID, excludeBatchID string) string {
	var batchID string
	_ = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("batch_id::text AS batch_id").
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.MutationStatusStaged).
		Where("batch_id::text != ?", excludeBatchID).
		GroupExpr("batch_id").
		OrderExpr("MIN(created_at) ASC").
		Limit(1).
		Scan(ctx, &batchID)
	return batchID
}

// resumeOrchestrationForBatch looks up any awaiting_human orchestration run
// whose current step holds the given batchID and resumes it.
// committed=true → run continues; committed=false → run is aborted.
// Best-effort — errors are only logged.
func (s *Server) resumeOrchestrationForBatch(ctx context.Context, batchIDStr string, committed bool) {
	if s.orchestrationEngine == nil {
		return
	}
	run, err := s.orchestrationEngine.FindRunByBatch(ctx, batchIDStr)
	if err != nil {
		s.log.Warn("orchestration: find run by batch failed (non-fatal)", "batch_id", batchIDStr, "err", err)
		return
	}
	if run == nil {
		return // no orchestration run tied to this batch
	}
	if err := s.orchestrationEngine.Resume(ctx, run.ID, committed); err != nil {
		s.log.Warn("orchestration: resume failed (non-fatal)", "run_id", run.ID, "err", err)
	}
}

// isApplyCalibrationArtifactType returns true for artifact types that
// ApplyCalibration can patch (strategy_formula, north_star, roadmap_recipe).
// These commits auto-publish a version and redirect to /aim/versions.
func isApplyCalibrationArtifactType(t string) bool {
	switch t {
	case "strategy_formula", "north_star", "roadmap_recipe":
		return true
	}
	return false
}

// redirectAfterCommit returns the URL to redirect to after committing a draft batch.
// apply-calibration artifact types are handled separately (auto-publish + /aim/versions).
func redirectAfterCommit(instanceID, artifactType string) string {
	base := "/strategies/" + instanceID + "/aim"
	switch artifactType {
	case "assessment_report":
		return base + "/assessment"
	case "calibration_memo":
		return base + "/calibration"
	default:
		return base
	}
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/draft-review/:batchID/discard
// ---------------------------------------------------------------------------

// handleDraftDiscard discards a staged batch and redirects to the AIM landing page.
func (s *Server) handleDraftDiscard(c echo.Context) error {
	instanceID := c.Param("id")
	batchIDStr := c.Param("batchID")
	ctx := c.Request().Context()

	batchID, err := uuid.Parse(batchIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_batch_id"))
	}

	_, err = s.db.NewUpdate().
		Model((*domain.StrategyMutation)(nil)).
		Set("status = ?", domain.MutationStatusDiscarded).
		Where("batch_id = ? AND status = ?", batchID, domain.MutationStatusStaged).
		Exec(ctx)
	if err != nil {
		s.log.Error("failed to discard draft batch", "batch_id", batchIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.discard_failed"))
	}

	// Look up the run before resuming so we can redirect to it after abort.
	// Use a detached context so the resume succeeds even if the HTTP client disconnected.
	resumeCtx := context.Background()
	var orchestrationRunID string
	if s.orchestrationEngine != nil {
		run, err := s.orchestrationEngine.FindRunByBatch(resumeCtx, batchIDStr)
		if err == nil && run != nil {
			orchestrationRunID = run.ID.String()
		}
	}

	// Resume any orchestration run waiting on this batch (committed=false → abort).
	s.resumeOrchestrationForBatch(resumeCtx, batchIDStr, false)

	if orchestrationRunID != "" {
		return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/runs/"+orchestrationRunID)
	}
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim")
}

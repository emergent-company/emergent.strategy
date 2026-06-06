package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/a-h/templ"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	domain "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleVersions serves GET /strategies/:id/aim/versions — version history list.
func (s *Server) handleVersions(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		content := s.loadVersionsView(instanceID, c)
		return ui.PhaseRenderData{Title: langs.T(c.Request().Context(), "page.version_history"), Content: content}
	})
}

func (s *Server) loadVersionsView(instanceID string, c echo.Context) templ.Component {
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: currentPath,
		ScreenID:    "aim-versions",
		TabGroup:    "aim",
	}

	if s.versionSvc == nil {
		return ui.VersionsContent(ui.VersionsViewData{
			NavContext: navCtx,
			InstanceID: instanceID,
			Versions:   nil,
		})
	}

	id, err := uuid.Parse(instanceID)
	if err != nil {
		return ui.VersionsContent(ui.VersionsViewData{
			NavContext: navCtx,
			InstanceID: instanceID,
			Versions:   nil,
		})
	}

	summaries, err := s.versionSvc.List(ctx, id)
	if err != nil {
		s.log.Error("failed to list versions", "instance_id", instanceID, "err", err)
		summaries = nil
	}

	rows := make([]ui.VersionRow, 0, len(summaries))
	for _, v := range summaries {
		rows = append(rows, versionSummaryToRow(v))
	}

	// Determine whether a real calibration decision exists (for the empty-state CTA).
	calDecision := s.extractPayloadField(ctx, instanceID, "calibration_memo", "decision")
	hasRealCal := calDecision == "persevere" || calDecision == "pivot" || calDecision == "pull_the_plug"

	return ui.VersionsContent(ui.VersionsViewData{
		NavContext:         navCtx,
		InstanceID:         instanceID,
		Versions:           rows,
		HasRealCalibration: hasRealCal,
	})
}

// handleVersionDetail serves GET /strategies/:id/aim/versions/:versionID.
func (s *Server) handleVersionDetail(c echo.Context) error {
	instanceID := c.Param("id")
	versionIDStr := c.Param("versionID")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: currentPath,
		ScreenID:    "aim-versions",
		TabGroup:    "aim",
	}

	if s.versionSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.version_service_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}
	verID, err := uuid.Parse(versionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_version_id"))
	}

	ver, err := s.versionSvc.Get(ctx, instID, verID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, langs.T(ctx, "error.version_not_found"))
	}

	// Extract artifact count from snapshot metadata without a separate List() call.
	artifactCount := extractSnapshotArtifactCount(ver.Snapshot)

	row := ui.VersionRow{
		ID:            ver.ID.String(),
		VersionNumber: ver.Version,
		Status:        ver.Status,
		Source:        ver.Source,
		InstanceID:    instanceID,
		PublishedAt:   ver.PublishedAt.UTC().Format("2 Jan 2006 15:04"),
		ArtifactCount: artifactCount,
	}
	if ver.Label != nil {
		row.Label = *ver.Label
	}
	if ver.Description != nil {
		row.Description = *ver.Description
	}
	if ver.EquilibriumScore != nil {
		row.EquilibScore = fmt.Sprintf("%.0f%%", *ver.EquilibriumScore*100)
	}

	detailData := ui.VersionDetailData{
		NavContext: navCtx,
		InstanceID: instanceID,
		Ver:        row,
	}

	// Diff against parent if available — uses DiffAgainstParent to avoid
	// re-fetching the current version's snapshot (already loaded above).
	if ver.ParentVersionID != nil {
		diff, diffErr := s.versionSvc.DiffAgainstParent(ctx, ver)
		if diffErr == nil {
			detailData.HasParent = true
			detailData.DiffSummary = diff.Summary

			// Load LLM-generated change summaries from batches committed
			// between the parent version and this version.
			changeSummaries := s.loadChangeSummariesBetweenVersions(ctx, instID, ver)

			for _, a := range diff.Added {
				detailData.Added = append(detailData.Added, enrichDiffEntry(ctx, a.ArtifactKey, instanceID))
			}
			for _, r := range diff.Removed {
				detailData.Removed = append(detailData.Removed, enrichDiffEntry(ctx, r.ArtifactKey, instanceID))
			}
			for _, ch := range diff.Changed {
				entry := enrichDiffEntry(ctx, ch.ArtifactKey, instanceID)
				// Use LLM-generated change summary if available; fall back to
				// field-level diff details.
				if summary := lookupChangeSummary(changeSummaries, ch.ArtifactKey); summary != "" {
					entry.ChangeDetails = splitChangeSummary(summary)
				} else if len(ch.ChangeDetails) > 0 {
					entry.ChangeDetails = ch.ChangeDetails
				}
				detailData.Changed = append(detailData.Changed, entry)
			}
		} else {
			s.log.Warn("failed to diff versions", "err", diffErr)
			detailData.HasParent = true // still show parent exists, just no diff data
		}
	}

	// ── Extract calibration context + insights from snapshot ──
	if ver.Source == "aim_cycle" {
		s.enrichVersionDetailFromSnapshot(ctx, ver, &detailData)
	}

	content := ui.VersionDetailContent(detailData)
	return s.renderInstancePage(c, "v"+fmt.Sprintf("%d", ver.Version), ui.PhaseRenderData{
		Title:   fmt.Sprintf("Version v%d", ver.Version),
		Content: content,
	})
}

// handleVersionRestore serves POST /strategies/:id/aim/versions/:versionID/restore.
// After a successful restore it redirects to the version list.
func (s *Server) handleVersionRestore(c echo.Context) error {
	instanceID := c.Param("id")
	versionIDStr := c.Param("versionID")
	ctx := c.Request().Context()

	if s.versionSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.version_service_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}
	verID, err := uuid.Parse(versionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_version_id"))
	}

	if _, err := s.versionSvc.Restore(ctx, instID, verID); err != nil {
		s.log.Error("failed to restore version", "instance_id", instanceID, "version_id", versionIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.version_restore_failed"))
	}

	// Redirect to the version list after a successful restore.
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/versions")
}

// handlePublishVersion serves POST /strategies/:id/aim/publish — publishes a
// manual version snapshot and redirects to the version list.
func (s *Server) handlePublishVersion(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()

	if s.versionSvc == nil {
		return c.String(http.StatusServiceUnavailable, langs.T(ctx, "error.version_service_not_available"))
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_instance_id"))
	}

	label := c.FormValue("label")
	description := c.FormValue("description")

	if _, err := s.versionSvc.Publish(ctx, instID, label, description); err != nil {
		s.log.Error("failed to publish version", "instance_id", instanceID, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.version_publish_failed"))
	}

	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/versions")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// extractSnapshotArtifactCount extracts the artifact_count from a version
// snapshot's metadata without deserializing the full snapshot.
func extractSnapshotArtifactCount(snapshot json.RawMessage) int {
	var meta struct {
		Metadata struct {
			ArtifactCount int `json:"artifact_count"`
		} `json:"metadata"`
	}
	if err := json.Unmarshal(snapshot, &meta); err != nil {
		return 0
	}
	return meta.Metadata.ArtifactCount
}

func versionSummaryToRow(v versiondom.VersionSummary) ui.VersionRow {
	row := ui.VersionRow{
		ID:            v.ID.String(),
		VersionNumber: v.Version,
		Status:        v.Status,
		Source:        v.Source,
		ArtifactCount: v.ArtifactCount,
		InstanceID:    v.InstanceID.String(),
		PublishedAt:   v.PublishedAt,
	}
	if v.Label != nil {
		row.Label = *v.Label
	}
	if v.Description != nil {
		row.Description = *v.Description
	}
	if v.EquilibriumScore != nil {
		row.EquilibScore = fmt.Sprintf("%.0f%%", *v.EquilibriumScore*100)
	}
	// For AIM cycle versions, extract the calibration decision from the label.
	// Label format: "Cycle N — Persevere" | "Cycle N — Pivot" | "Cycle N — Pull the Plug"
	if v.Source == "aim_cycle" && v.Label != nil {
		row.CalibrationDecision = aimCycleDecisionFromLabel(*v.Label)
	}
	return row
}

// enrichVersionDetailFromSnapshot extracts calibration context, strategic
// insights, and cycle run link from the version snapshot for AIM cycle versions.
func (s *Server) enrichVersionDetailFromSnapshot(ctx context.Context, ver *domain.StrategyVersion, data *ui.VersionDetailData) {
	// Parse snapshot to access artifact payloads.
	var snap struct {
		Artifacts map[string]json.RawMessage `json:"artifacts"`
	}
	if err := json.Unmarshal(ver.Snapshot, &snap); err != nil {
		return
	}

	// ── Calibration memo ──
	calibPayload := snap.Artifacts["calibration-memo"]
	if calibPayload == nil {
		calibPayload = snap.Artifacts["calibration_memo"]
	}
	if calibPayload != nil {
		var calib struct {
			Decision                  string  `json:"decision"`
			Reasoning                 string  `json:"reasoning"`
			OKRHitRatePct             float64 `json:"okr_hit_rate_pct"`
			InvalidatedAssumptionCount int    `json:"invalidated_assumption_count"`
		}
		if err := json.Unmarshal(calibPayload, &calib); err == nil && calib.Decision != "" {
			data.CalibrationDecision = calib.Decision
			data.CalibrationReasoning = calib.Reasoning
			data.OKRHitRatePct = fmt.Sprintf("%.0f%%", calib.OKRHitRatePct)
		}
	}

	// ── Assessment report — strategic insights ──
	assessPayload := snap.Artifacts["assessment-report"]
	if assessPayload == nil {
		assessPayload = snap.Artifacts["assessment_report"]
	}
	if assessPayload != nil {
		var assess struct {
			StrategicInsights []string `json:"strategic_insights"`
		}
		if err := json.Unmarshal(assessPayload, &assess); err == nil {
			data.StrategicInsights = assess.StrategicInsights
		}
	}

	// ── Cycle run link — find the orchestration run that produced this version ──
	// Query directly by timestamp proximity instead of loading all runs.
	if s.orchestrationEngine != nil {
		var runID string
		_ = s.db.NewSelect().
			TableExpr("orchestration_runs").
			ColumnExpr("id::text").
			Where("workflow_name = ?", "aim_cycle").
			Where("concurrency_key = ?", ver.InstanceID.String()).
			Where("status = ?", "completed").
			Where("updated_at BETWEEN ? AND ?",
				ver.PublishedAt.Add(-60*1e9), ver.PublishedAt.Add(60*1e9)).
			OrderExpr("updated_at DESC").
			Limit(1).
			Scan(ctx, &runID)
		if runID != "" {
			data.CycleRunID = runID
		}
	}
}

// loadChangeSummariesBetweenVersions queries committed batch metadata for
// change_summaries between the parent version's publish time and this version's
// publish time. Returns a merged map of output_key → summary text.
func (s *Server) loadChangeSummariesBetweenVersions(ctx context.Context, instID uuid.UUID, ver *domain.StrategyVersion) map[string]string {
	if ver.ParentVersionID == nil {
		return nil
	}
	// Load parent version to get its publish time.
	parentVer, err := s.versionSvc.Get(ctx, instID, *ver.ParentVersionID)
	if err != nil {
		return nil
	}

	type batchRow struct {
		BatchMetadata json.RawMessage `bun:"batch_metadata"`
	}
	var rows []batchRow
	err = s.db.NewSelect().
		TableExpr("strategy_mutations").
		ColumnExpr("DISTINCT ON (batch_id) batch_metadata").
		Where("instance_id = ?", instID).
		Where("status = ?", "committed").
		Where("created_at > ?", parentVer.PublishedAt).
		Where("created_at <= ?", ver.PublishedAt).
		Where("batch_metadata->>'change_summaries' IS NOT NULL").
		OrderExpr("batch_id, created_at").
		Scan(ctx, &rows)
	if err != nil {
		s.log.Warn("failed to load change summaries for version", "err", err)
		return nil
	}

	merged := make(map[string]string)
	for _, row := range rows {
		var meta struct {
			ChangeSummaries map[string]string `json:"change_summaries"`
		}
		if err := json.Unmarshal(row.BatchMetadata, &meta); err != nil {
			continue
		}
		for key, summary := range meta.ChangeSummaries {
			if summary != "" {
				merged[key] = summary
			}
		}
	}
	return merged
}

// lookupChangeSummary finds a change summary for an artifact key, handling
// both underscore and hyphen variants (snapshot keys may use either).
func lookupChangeSummary(summaries map[string]string, artifactKey string) string {
	if s, ok := summaries[artifactKey]; ok {
		return s
	}
	// Try converting hyphens to underscores (snapshot key → output key).
	underscore := strings.ReplaceAll(artifactKey, "-", "_")
	if s, ok := summaries[underscore]; ok {
		return s
	}
	// Try converting underscores to hyphens.
	hyphen := strings.ReplaceAll(artifactKey, "_", "-")
	if s, ok := summaries[hyphen]; ok {
		return s
	}
	return ""
}

// splitChangeSummary splits a multi-line change summary into individual
// detail lines, stripping leading "- " bullet markers.
func splitChangeSummary(summary string) []string {
	lines := strings.Split(summary, "\n")
	var details []string
	for _, line := range lines {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "- ")
		line = strings.TrimPrefix(line, "• ")
		if line != "" {
			details = append(details, line)
		}
	}
	return details
}

// enrichDiffEntry resolves an artifact key into a rich VersionDiffEntry with
// human-readable label, category, artifact type, and a link to the view page.
func enrichDiffEntry(ctx context.Context, artifactKey, instanceID string) ui.VersionDiffEntry {
	entry := ui.VersionDiffEntry{ArtifactKey: artifactKey}

	// Map well-known singleton artifact keys to their type and category.
	type artInfo struct {
		artType  string
		labelKey string
		category string
		path     string // URL suffix after /strategies/:id
	}

	singletons := map[string]artInfo{
		"north_star":                {"north_star", "artifact.label.north_star", "READY", "/ready/north-star"},
		"north-star":                {"north_star", "artifact.label.north_star", "READY", "/ready/north-star"},
		"insight_analyses":          {"insight_analyses", "artifact.label.insight_analyses", "READY", "/ready/insights"},
		"insight-analyses":          {"insight_analyses", "artifact.label.insight_analyses", "READY", "/ready/insights"},
		"strategy_foundations":      {"strategy_foundations", "artifact.label.strategy_foundations", "READY", "/ready/foundations"},
		"strategy-foundations":      {"strategy_foundations", "artifact.label.strategy_foundations", "READY", "/ready/foundations"},
		"insight_opportunity":       {"insight_opportunity", "artifact.label.insight_opportunity", "READY", "/ready/opportunity"},
		"insight-opportunity":       {"insight_opportunity", "artifact.label.insight_opportunity", "READY", "/ready/opportunity"},
		"strategy_formula":          {"strategy_formula", "artifact.label.strategy_formula", "READY", "/ready/formula"},
		"strategy-formula":          {"strategy_formula", "artifact.label.strategy_formula", "READY", "/ready/formula"},
		"roadmap_recipe":            {"roadmap_recipe", "artifact.label.roadmap_recipe", "READY", "/ready/roadmap"},
		"roadmap-recipe":            {"roadmap_recipe", "artifact.label.roadmap_recipe", "READY", "/ready/roadmap"},
		"product_portfolio":         {"product_portfolio", "artifact.label.product_portfolio", "READY", "/ready/portfolio"},
		"assessment_report":         {"assessment_report", "artifact.label.assessment_report", "AIM", "/aim/assessment"},
		"assessment-report":         {"assessment_report", "artifact.label.assessment_report", "AIM", "/aim/assessment"},
		"calibration-memo":          {"calibration_memo", "artifact.label.calibration_memo", "AIM", "/aim/calibration"},
		"calibration_memo":          {"calibration_memo", "artifact.label.calibration_memo", "AIM", "/aim/calibration"},
		"living-reality-assessment": {"living_reality_assessment", "artifact.label.living_reality_assessment", "AIM", "/aim/lra"},
		"living_reality_assessment": {"living_reality_assessment", "artifact.label.living_reality_assessment", "AIM", "/aim/lra"},
	}

	if info, ok := singletons[artifactKey]; ok {
		entry.ArtifactType = info.artType
		entry.Label = langs.T(ctx, info.labelKey)
		entry.Category = info.category
		entry.Href = "/strategies/" + instanceID + info.path
		return entry
	}

	// Feature definitions: fd-NNN-slug
	if strings.HasPrefix(artifactKey, "fd-") {
		entry.ArtifactType = "feature_definition"
		entry.Label = artifactKey
		entry.Category = "FIRE"
		entry.Href = "/strategies/" + instanceID + "/fire/features/" + artifactKey
		return entry
	}

	// Value models: value_model_<track>.value_model
	if strings.HasPrefix(artifactKey, "value_model_") {
		entry.ArtifactType = "value_model"
		// Extract track name: "value_model_product.hardware.value_model" → "Product Hardware"
		track := strings.TrimPrefix(artifactKey, "value_model_")
		track = strings.TrimSuffix(track, ".value_model")
		track = strings.ReplaceAll(track, ".", " ")
		track = strings.ReplaceAll(track, "_", " ")
		entry.Label = "Value Model: " + strings.Title(track) //nolint:staticcheck // strings.Title is fine here
		entry.Category = "FIRE"
		entry.Href = "/strategies/" + instanceID + "/fire/value-models/" + artifactKey
		return entry
	}

	// FIRE definitions (long path keys)
	if strings.HasPrefix(artifactKey, "FIRE/definitions/") {
		parts := strings.Split(artifactKey, "/")
		defKey := parts[len(parts)-1]
		entry.ArtifactType = "definition"
		entry.Label = defKey
		entry.Category = "FIRE"
		entry.Href = "/strategies/" + instanceID + "/fire/definitions/" + defKey
		return entry
	}

	// AIM cycle artifacts (e.g. AIM/cycles/...)
	if strings.HasPrefix(artifactKey, "AIM/") {
		entry.Category = "AIM"
		entry.Label = artifactKey
		return entry
	}

	// READY path artifacts
	if strings.HasPrefix(artifactKey, "READY/") {
		entry.Category = "READY"
		entry.Label = artifactKey
		return entry
	}

	// Fallback
	entry.Label = artifactKey
	return entry
}

// aimCycleDecisionFromLabel extracts the calibration decision token from an AIM
// cycle snapshot label ("Cycle N — Persevere" → "persevere").
func aimCycleDecisionFromLabel(label string) string {
	for _, suffix := range []string{"Persevere", "Pivot", "Pull the Plug"} {
		if len(label) >= len(suffix) && label[len(label)-len(suffix):] == suffix {
			switch suffix {
			case "Persevere":
				return "persevere"
			case "Pivot":
				return "pivot"
			case "Pull the Plug":
				return "pull_the_plug"
			}
		}
	}
	return ""
}

package handler

import (
	"fmt"
	"net/http"

	"github.com/a-h/templ"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	versiondom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleVersions serves GET /strategies/:id/aim/versions — version history list.
func (s *Server) handleVersions(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		content := s.loadVersionsView(instanceID, c)
		return ui.PhaseRenderData{Title: "Version History", Content: content}
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
			NavContext:  navCtx,
			InstanceID:  instanceID,
			Versions:    nil,
		})
	}

	id, err := uuid.Parse(instanceID)
	if err != nil {
		return ui.VersionsContent(ui.VersionsViewData{
			NavContext:  navCtx,
			InstanceID:  instanceID,
			Versions:    nil,
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

	return ui.VersionsContent(ui.VersionsViewData{
		NavContext:  navCtx,
		InstanceID:  instanceID,
		Versions:    rows,
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
		return c.String(http.StatusServiceUnavailable, "version service not available")
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}
	verID, err := uuid.Parse(versionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid version ID")
	}

	ver, err := s.versionSvc.Get(ctx, instID, verID)
	if err != nil {
		return echo.NewHTTPError(http.StatusNotFound, "version not found")
	}

	// Build list summary from the current version.
	summaries, err := s.versionSvc.List(ctx, instID)
	if err != nil {
		s.log.Error("failed to list versions for detail", "instance_id", instanceID, "err", err)
	}
	// Find this version in the list to get its summary (artifact count etc).
	var verSummary *versiondom.VersionSummary
	for i := range summaries {
		if summaries[i].ID == verID {
			verSummary = &summaries[i]
			break
		}
	}

	row := ui.VersionRow{
		ID:            ver.ID.String(),
		VersionNumber: ver.Version,
		Status:        ver.Status,
		Source:        ver.Source,
		InstanceID:    instanceID,
		PublishedAt:   ver.PublishedAt.UTC().Format("2 Jan 2006 15:04"),
	}
	if ver.Label != nil {
		row.Label = *ver.Label
	}
	if ver.Description != nil {
		row.Description = *ver.Description
	}
	if verSummary != nil {
		row.ArtifactCount = verSummary.ArtifactCount
		if verSummary.EquilibriumScore != nil {
			row.EquilibScore = fmt.Sprintf("%.0f%%", *verSummary.EquilibriumScore*100)
		}
	}

	detailData := ui.VersionDetailData{
		NavContext:  navCtx,
		InstanceID:  instanceID,
		Ver:         row,
	}

	// Diff against parent if available.
	if ver.ParentVersionID != nil {
		diff, diffErr := s.versionSvc.Diff(ctx, instID, *ver.ParentVersionID, verID)
		if diffErr == nil {
			detailData.HasParent = true
			detailData.DiffSummary = diff.Summary
			for _, a := range diff.Added {
				detailData.Added = append(detailData.Added, ui.VersionDiffEntry{ArtifactKey: a.ArtifactKey})
			}
			for _, r := range diff.Removed {
				detailData.Removed = append(detailData.Removed, ui.VersionDiffEntry{ArtifactKey: r.ArtifactKey})
			}
			for _, ch := range diff.Changed {
				detailData.Changed = append(detailData.Changed, ui.VersionDiffEntry{ArtifactKey: ch.ArtifactKey})
			}
		} else {
			s.log.Warn("failed to diff versions", "err", diffErr)
			detailData.HasParent = true // still show parent exists, just no diff data
		}
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
		return c.String(http.StatusServiceUnavailable, "version service not available")
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid instance ID")
	}
	verID, err := uuid.Parse(versionIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid version ID")
	}

	if _, err := s.versionSvc.Restore(ctx, instID, verID); err != nil {
		s.log.Error("failed to restore version", "instance_id", instanceID, "version_id", versionIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, "restore failed: "+err.Error())
	}

	// Redirect to the version list after a successful restore.
	return c.Redirect(http.StatusSeeOther, "/strategies/"+instanceID+"/aim/versions")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

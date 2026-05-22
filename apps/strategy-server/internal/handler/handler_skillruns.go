package handler

import (
	"encoding/json"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillrun"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleActivityOverview serves GET /strategies/:id/activity — live cascade tracker page.
func (s *Server) handleActivityOverview(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	cascadeData := s.loadCascadeData(ctx, instanceID)

	data := ui.ActivityPageData{
		Nav: ui.NavContext{
			InstanceID:  instanceID,
			CurrentPath: currentPath,
			ScreenID:    ui.ScreenActivityOverview,
			TabGroup:    "execution",
		},
		Cascade: cascadeData,
	}

	content := ui.ActivityPageContent(data)
	return s.renderInstancePage(c, "Activity", ui.PhaseRenderData{
		Title:   "Activity",
		Content: content,
	})
}

// handleSkillRuns serves GET /strategies/:id/skill-runs — run history + LLM usage.
func (s *Server) handleSkillRuns(c echo.Context) error {
	instanceID := c.Param("id")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	data := ui.SkillRunsPageData{
		Nav: ui.NavContext{
			InstanceID:  instanceID,
			CurrentPath: currentPath,
			ScreenID:    ui.ScreenSkillRuns,
			TabGroup:    "execution",
		},
	}

	instUUID, err := uuid.Parse(instanceID)
	if err != nil {
		return s.renderInstancePage(c, "Skill Runs", ui.PhaseRenderData{
			Title:   "Skill Runs",
			Content: ui.SkillRunsPageContent(data),
		})
	}

	if s.skillRunSvc != nil {
		// Recent runs
		runs, err := s.skillRunSvc.ListByInstance(ctx, instUUID, skillrun.ListParams{Limit: 50})
		if err == nil {
			for _, r := range runs {
				row := ui.SkillRunRow{
					RunID:             r.ID.String(),
					SkillName:         r.SkillName,
					Status:            r.Status,
					Trigger:           r.Trigger,
					ChunksCompleted:   r.ChunksCompleted,
					ChunkCount:        r.ChunkCount,
					TotalInputTokens:  r.TotalInputTokens,
					TotalOutputTokens: r.TotalOutputTokens,
					DurationSec:       r.DurationSeconds(),
					StartedAt:         r.StartedAt.Format("2 Jan 15:04"),
				}
				if r.Error != nil {
					row.Error = *r.Error
				}
				if r.BatchID != nil {
					row.BatchID = r.BatchID.String()
				}
				data.Runs = append(data.Runs, row)
			}
		}

		// Usage summary
		usage, err := s.skillRunSvc.GetUsage(ctx, instUUID, nil, nil)
		if err == nil {
			totalTokens := 0
			totalRuns := 0
			for _, u := range usage {
				data.UsageSummary = append(data.UsageSummary, ui.SkillUsageRow{
					SkillName:    u.SkillName,
					RunCount:     u.RunCount,
					InputTokens:  u.InputTokens,
					OutputTokens: u.OutputTokens,
				})
				totalTokens += u.InputTokens + u.OutputTokens
				totalRuns += u.RunCount
			}
			data.TotalTokens = totalTokens
			data.TotalRuns = totalRuns
		}
	}

	content := ui.SkillRunsPageContent(data)
	return s.renderInstancePage(c, "Skill Runs", ui.PhaseRenderData{
		Title:   "Skill Runs",
		Content: content,
	})
}

// handleSkillRunDetail serves GET /strategies/:id/skill-runs/:runID — single run detail.
func (s *Server) handleSkillRunDetail(c echo.Context) error {
	instanceID := c.Param("id")
	runIDStr := c.Param("runID")
	ctx := c.Request().Context()
	currentPath := c.Request().URL.Path

	data := ui.SkillRunDetailData{
		Nav: ui.NavContext{
			InstanceID:  instanceID,
			CurrentPath: currentPath,
			ScreenID:    ui.ScreenSkillRunDetail,
			TabGroup:    "execution",
		},
	}

	if s.skillRunSvc == nil {
		return echo.NewHTTPError(404, "skill run service not available")
	}

	runID, err := uuid.Parse(runIDStr)
	if err != nil {
		return echo.NewHTTPError(400, "invalid run ID")
	}

	run, err := s.skillRunSvc.GetByID(ctx, runID)
	if err != nil {
		return echo.NewHTTPError(404, "skill run not found")
	}

	data.RunID = run.ID.String()
	data.SkillName = run.SkillName
	data.Status = run.Status
	data.Trigger = run.Trigger
	data.Model = run.Model
	data.ChunksCompleted = run.ChunksCompleted
	data.ChunkCount = run.ChunkCount
	data.TotalInputTokens = run.TotalInputTokens
	data.TotalOutputTokens = run.TotalOutputTokens
	data.DurationSec = run.DurationSeconds()
	data.StartedAt = run.StartedAt.Format("2 Jan 2006 15:04:05")
	if run.CompletedAt != nil {
		data.CompletedAt = run.CompletedAt.Format("2 Jan 2006 15:04:05")
	}
	if run.Error != nil {
		data.Error = *run.Error
	}
	if run.BatchID != nil {
		data.BatchID = run.BatchID.String()
	}

	// Parse chunk log
	if len(run.ChunkLog) > 0 {
		var entries []skillrun.ChunkEntry
		if json.Unmarshal(run.ChunkLog, &entries) == nil {
			for _, e := range entries {
				dur := ""
				if e.StartedAt != "" && e.CompletedAt != "" {
					if start, err1 := time.Parse(time.RFC3339, e.StartedAt); err1 == nil {
						if end, err2 := time.Parse(time.RFC3339, e.CompletedAt); err2 == nil {
							dur = formatChunkDuration(end.Sub(start).Seconds())
						}
					}
				}
				data.Chunks = append(data.Chunks, ui.SkillRunChunkRow{
					Chunk:            e.Chunk,
					OutputKey:        e.OutputKey,
					ArtifactType:     e.ArtifactType,
					Status:           e.Status,
					Attempts:         e.Attempts,
					InputTokens:      e.InputTokens,
					OutputTokens:     e.OutputTokens,
					ContextTruncated: e.ContextTruncated,
					DroppedFeatures:  e.DroppedFeatures,
					Errors:           e.Errors,
					Duration:         dur,
				})
			}
		}
	}

	content := ui.SkillRunDetailContent(data)
	return s.renderInstancePage(c, "Skill Run Detail", ui.PhaseRenderData{
		Title:   "Skill Run Detail",
		Content: content,
	})
}

// formatChunkDuration formats a duration in seconds for display.
func formatChunkDuration(sec float64) string {
	if sec < 60 {
		return fmt.Sprintf("%.0fs", sec)
	}
	m := int(sec) / 60
	s := int(sec) % 60
	if s == 0 {
		return fmt.Sprintf("%dm", m)
	}
	return fmt.Sprintf("%dm %ds", m, s)
}

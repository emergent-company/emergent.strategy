package handler

import (
	"context"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/a-h/templ"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	aimdom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/langs"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// ---------------------------------------------------------------------------
// GET /strategies/:id/aim/proposals — Proposals inbox
// ---------------------------------------------------------------------------

func (s *Server) handleAimProposals(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		ctx := c.Request().Context()
		content := s.loadProposalsView(ctx, instanceID)
		return ui.PhaseRenderData{Title: langs.T(ctx, "nav.screen.proposals"), Content: content}
	})
}

func (s *Server) loadProposalsView(ctx context.Context, instanceID string) templ.Component {
	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: "/strategies/" + instanceID + "/aim/proposals",
		ScreenID:    "aim-proposals",
		TabGroup:    "aim",
	}

	if s.heartbeatSvc == nil {
		return ui.ArtifactPlaceholder(navCtx, langs.T(ctx, "nav.screen.proposals"), langs.T(ctx, "error.heartbeat_not_configured"), "lucide--inbox")
	}

	instID, err := uuid.Parse(instanceID)
	if err != nil {
		return ui.ArtifactPlaceholder(navCtx, langs.T(ctx, "nav.screen.proposals"), langs.T(ctx, "error.invalid_instance_id"), "lucide--inbox")
	}

	proposals := loadAllProposals(ctx, s.heartbeatSvc, instID)
	pendingCount := 0
	for _, p := range proposals {
		if p.Status == "pending" {
			pendingCount++
		}
	}

	data := ui.AimProposalsData{
		NavContext:   navCtx,
		InstanceID:   instanceID,
		PendingCount: pendingCount,
		Proposals:    proposals,
	}

	// Check for active orchestrated AIM cycle run.
	cycleActive := false
	if s.orchestrationEngine != nil {
		activeRun, runErr := s.orchestrationEngine.ActiveRun(ctx, aimdom.WorkflowName, instanceID)
		if runErr == nil && activeRun != nil {
			data.ActiveRunID = activeRun.ID.String()
			data.ActiveRunStatus = string(activeRun.Status)
			data.ActiveRunStep = activeRun.CurrentStep
			cycleActive = true
		}
	}

	// Propagate active-cycle flag to each proposal row so the template
	// can disable the approve button when a cycle is already running.
	if cycleActive {
		for i := range data.Proposals {
			data.Proposals[i].CycleActive = true
		}
	}

	return ui.AimProposalsContent(data)
}

// loadAllProposals fetches proposals across visible statuses (excludes dismissed).
func loadAllProposals(ctx context.Context, svc *heartbeat.Service, instID uuid.UUID) []ui.AimProposalRow {
	var rows []ui.AimProposalRow
	for _, status := range []string{"pending", "deferred", "approved", "expired"} {
		proposals, err := svc.ListProposals(ctx, instID, status)
		if err != nil {
			continue
		}
		for i := range proposals {
			rows = append(rows, proposalToRow(&proposals[i]))
		}
	}
	sortProposals(rows)
	return rows
}

func sortProposals(rows []ui.AimProposalRow) {
	order := map[string]int{"pending": 0, "deferred": 1, "approved": 2, "expired": 3}
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0; j-- {
			oi, oj := order[rows[j].Status], order[rows[j-1].Status]
			if oi < oj || (oi == oj && rows[j].CreatedAt.After(rows[j-1].CreatedAt)) {
				rows[j], rows[j-1] = rows[j-1], rows[j]
			}
		}
	}
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/proposals/:proposalID/approve
// HTMX: returns the updated card fragment (outerHTML swap of #proposal-<id>)
// ---------------------------------------------------------------------------

func (s *Server) handleProposalApprove(c echo.Context) error {
	instanceID := c.Param("id")
	proposalIDStr := c.Param("proposalID")
	ctx := c.Request().Context()

	if s.heartbeatSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.heartbeat_not_available"))
	}

	proposalID, err := uuid.Parse(proposalIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_proposal_id"))
	}

	var starter heartbeat.CycleStarter
	if s.orchestrationEngine != nil {
		starter = &webCycleStarter{engine: s.orchestrationEngine}
	}

	approved, err := s.heartbeatSvc.ApproveProposal(ctx, proposalID, starter, aimdom.WorkflowName)
	if err != nil {
		if errors.Is(err, orchestration.ErrAlreadyActive) {
			return echo.NewHTTPError(http.StatusConflict, langs.T(ctx, "error.aim_cycle_already_running"))
		}
		s.log.Error("approve proposal failed", "proposal_id", proposalIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.proposal_approve_failed"))
	}

	row := proposalToRow(approved)
	return ui.AimProposalCard(row, instanceID).Render(ctx, c.Response().Writer)
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/proposals/:proposalID/defer?hours=N
// HTMX: returns the updated card fragment (outerHTML swap of #proposal-<id>)
// ---------------------------------------------------------------------------

func (s *Server) handleProposalDefer(c echo.Context) error {
	instanceID := c.Param("id")
	proposalIDStr := c.Param("proposalID")
	ctx := c.Request().Context()

	if s.heartbeatSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.heartbeat_not_available"))
	}

	proposalID, err := uuid.Parse(proposalIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_proposal_id"))
	}

	hours, _ := strconv.Atoi(c.QueryParam("hours"))
	if hours <= 0 {
		hours = 24
	}

	deferred, err := s.heartbeatSvc.DeferProposal(ctx, proposalID, time.Duration(hours)*time.Hour)
	if err != nil {
		s.log.Error("defer proposal failed", "proposal_id", proposalIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.proposal_defer_failed"))
	}

	row := proposalToRow(deferred)
	return ui.AimProposalCard(row, instanceID).Render(ctx, c.Response().Writer)
}

// ---------------------------------------------------------------------------
// POST /strategies/:id/aim/proposals/:proposalID/dismiss
// HTMX: removes the card from the list (outerHTML swap with empty content)
// ---------------------------------------------------------------------------

func (s *Server) handleProposalDismiss(c echo.Context) error {
	proposalIDStr := c.Param("proposalID")
	ctx := c.Request().Context()

	if s.heartbeatSvc == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, langs.T(ctx, "error.heartbeat_not_available"))
	}

	proposalID, err := uuid.Parse(proposalIDStr)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, langs.T(ctx, "error.invalid_proposal_id"))
	}

	if _, err := s.heartbeatSvc.DismissProposal(ctx, proposalID); err != nil {
		s.log.Error("dismiss proposal failed", "proposal_id", proposalIDStr, "err", err)
		return echo.NewHTTPError(http.StatusInternalServerError, langs.T(ctx, "error.proposal_dismiss_failed"))
	}

	// Return empty content — HTMX outerHTML swap removes the card.
	return c.HTML(http.StatusOK, "")
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func proposalToRow(p *heartbeat.Proposal) ui.AimProposalRow {
	row := ui.AimProposalRow{
		ID:             p.ID.String(),
		Status:         p.Status,
		TriggerReason:  p.TriggerReason,
		TriggerMessage: p.TriggerMessage,
		EvidenceCount:  p.EvidenceCount,
		SignalCount:    p.SignalCount,
		SnoozedUntil:   p.SnoozedUntil,
		CreatedAt:      p.CreatedAt,
	}
	if p.ApprovedRunID != nil {
		row.ApprovedRunID = p.ApprovedRunID.String()
	}
	return row
}

// webCycleStarter adapts orchestration.Engine to heartbeat.CycleStarter
// for use from web handlers. The equivalent exists in mcpserver but can't
// be imported from here (would create a handler→mcpserver import cycle).
type webCycleStarter struct {
	engine *orchestration.Engine
}

func (w *webCycleStarter) StartRun(ctx context.Context, workflowName, concurrencyKey string, input map[string]any) (heartbeat.CycleRun, error) {
	run, err := w.engine.StartRun(ctx, workflowName, concurrencyKey, input)
	if err != nil {
		return heartbeat.CycleRun{}, err
	}
	return heartbeat.CycleRun{ID: run.ID}, nil
}

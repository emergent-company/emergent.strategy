package handler

import (
	"context"
	"net/http"
	"time"

	"github.com/a-h/templ"
	"github.com/google/uuid"
	"github.com/labstack/echo/v4"

	domainPkg "github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// handleCoherence serves /aim/coherence — lists active ripple signals.
func (s *Server) handleCoherence(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		content := s.loadCoherenceView(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{Title: "Coherence", Content: content}
	})
}

func (s *Server) loadCoherenceView(ctx context.Context, instanceID string) templ.Component {
	type signalRow struct {
		ID            string    `bun:"id"`
		SignalType    string    `bun:"signal_type"`
		Severity      string    `bun:"severity"`
		AuthorityTier string    `bun:"authority_tier"`
		SourceKey     string    `bun:"source_key"`
		TargetKey     string    `bun:"target_key"`
		Description   string    `bun:"description"`
		Suggestion    string    `bun:"suggestion"`
		Status        string    `bun:"status"`
		CreatedAt     time.Time `bun:"created_at"`
	}

	var rawSignals []signalRow
	_ = s.db.NewSelect().
		TableExpr("ripple_signals").
		ColumnExpr("id, signal_type, severity, COALESCE(authority_tier,'') as authority_tier, source_key, target_key, description, COALESCE(suggestion,'') as suggestion, status, created_at").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		OrderExpr("CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC").
		Scan(ctx, &rawSignals)

	var (
		critical int
		warning  int
		info     int
	)
	signals := make([]ui.CoherenceSignal, 0, len(rawSignals))
	for _, r := range rawSignals {
		switch r.Severity {
		case "critical":
			critical++
		case "warning":
			warning++
		default:
			info++
		}
		signals = append(signals, ui.CoherenceSignal{
			ID:            r.ID,
			SignalType:    r.SignalType,
			Severity:      r.Severity,
			AuthorityTier: r.AuthorityTier,
			SourceKey:     r.SourceKey,
			TargetKey:     r.TargetKey,
			Description:   r.Description,
			Suggestion:    r.Suggestion,
			Status:        r.Status,
			CreatedAt:     r.CreatedAt.Format("2 Jan 15:04"),
			InstanceID:    instanceID,
		})
	}

	// Equilibrium score from ripple_config if available
	equilibriumScore := -1.0
	type eqRow struct {
		Score float64 `bun:"equilibrium_score"`
	}
	var eq eqRow
	if err := s.db.NewSelect().
		TableExpr("ripple_convergence_runs").
		ColumnExpr("equilibrium_score").
		Where("instance_id = ?", instanceID).
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &eq); err == nil {
		equilibriumScore = eq.Score
	}

	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: "/strategies/" + instanceID + "/aim/coherence",
		ScreenID:    "aim-coherence",
		TabGroup:    "aim",
	}

	return ui.CoherenceContent(ui.CoherenceViewData{
		NavContext:        navCtx,
		InstanceID:        instanceID,
		Signals:           signals,
		CriticalCount:     critical,
		WarningCount:      warning,
		InfoCount:         info,
		EquilibriumScore:  equilibriumScore,
	})
}

// ---------------------------------------------------------------------------
// Signal action handlers (HTMX POST → return updated card fragment)
// ---------------------------------------------------------------------------

func (s *Server) handleSignalAcknowledge(c echo.Context) error {
	return s.applySignalAction(c, func(ctx context.Context, signalID uuid.UUID) (*ui.CoherenceSignal, error) {
		sig, err := s.rippleSvc.AcknowledgeSignal(ctx, signalID)
		if err != nil {
			return nil, err
		}
		return domainSignalToUI(sig, c.Param("id")), nil
	})
}

func (s *Server) handleSignalResolve(c echo.Context) error {
	return s.applySignalAction(c, func(ctx context.Context, signalID uuid.UUID) (*ui.CoherenceSignal, error) {
		sig, err := s.rippleSvc.ResolveSignal(ctx, signalID, nil)
		if err != nil {
			return nil, err
		}
		return domainSignalToUI(sig, c.Param("id")), nil
	})
}

func (s *Server) handleSignalDismiss(c echo.Context) error {
	reason := c.FormValue("reason")
	if reason == "" {
		reason = "dismissed via UI"
	}
	return s.applySignalAction(c, func(ctx context.Context, signalID uuid.UUID) (*ui.CoherenceSignal, error) {
		sig, err := s.rippleSvc.DismissSignal(ctx, signalID, reason)
		if err != nil {
			return nil, err
		}
		return domainSignalToUI(sig, c.Param("id")), nil
	})
}

// applySignalAction is the shared HTMX action handler: parse signal ID, apply
// the action fn, render the updated card fragment.
func (s *Server) applySignalAction(c echo.Context, fn func(context.Context, uuid.UUID) (*ui.CoherenceSignal, error)) error {
	if s.rippleSvc == nil {
		return c.String(http.StatusServiceUnavailable, "ripple service not available")
	}
	signalID, err := uuid.Parse(c.Param("signalID"))
	if err != nil {
		return c.String(http.StatusBadRequest, "invalid signal ID")
	}
	sig, err := fn(c.Request().Context(), signalID)
	if err != nil {
		return c.String(http.StatusInternalServerError, err.Error())
	}
	return ui.CoherenceSignalCard(*sig).Render(c.Request().Context(), c.Response().Writer)
}

// domainSignalToUI converts a domain RippleSignal to the UI CoherenceSignal.
func domainSignalToUI(sig *domainPkg.RippleSignal, instanceID string) *ui.CoherenceSignal {
	authorityTier := ""
	if sig.AuthorityTier != nil {
		authorityTier = *sig.AuthorityTier
	}
	suggestion := ""
	if sig.Suggestion != nil {
		suggestion = *sig.Suggestion
	}
	return &ui.CoherenceSignal{
		ID:            sig.ID.String(),
		SignalType:    sig.SignalType,
		Severity:      sig.Severity,
		AuthorityTier: authorityTier,
		SourceKey:     sig.SourceKey,
		TargetKey:     sig.TargetKey,
		Description:   sig.Description,
		Suggestion:    suggestion,
		Status:        sig.Status,
		CreatedAt:     sig.CreatedAt.Format("2 Jan 15:04"),
		InstanceID:    instanceID,
	}
}


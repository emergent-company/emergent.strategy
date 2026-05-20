package handler

import (
	"context"
	"time"

	"github.com/a-h/templ"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/labstack/echo/v4"
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

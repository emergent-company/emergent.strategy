package ripple

import (
	"context"
	"fmt"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// EquilibriumReport describes the current coherence state of an instance.
type EquilibriumReport struct {
	Score              float64               `json:"score"`
	Threshold          float64               `json:"threshold"`
	InEquilibrium      bool                  `json:"in_equilibrium"`
	Deficit            float64               `json:"deficit,omitempty"`
	CriticalCount      int                   `json:"critical_count"`
	WarningCount       int                   `json:"warning_count"`
	InfoCount          int                   `json:"info_count"`
	TensionWithin      int                   `json:"tension_within_baseline"`
	DismissedCount     int                   `json:"dismissed_count"`
	SignalsByAuthority map[string]int        `json:"signals_by_authority,omitempty"`
	NaturalTensions    []NaturalTensionEntry `json:"natural_tensions,omitempty"`
}

// NaturalTensionEntry describes a tension signal relative to its baseline.
type NaturalTensionEntry struct {
	TrackA   string  `json:"track_a"`
	TrackB   string  `json:"track_b"`
	Measured float64 `json:"measured"`
	Baseline float64 `json:"baseline"`
	Within   bool    `json:"within_baseline"`
}

// signalPenalty returns the equilibrium penalty for a signal based on its
// severity and type. Structural signals (orphan, staleness) are weighted
// lower than semantic signals (drift, tension, propagation) because
// structural gaps are normal work-in-progress states, while semantic drift
// indicates active misalignment.
func signalPenalty(severity, signalType string) float64 {
	// Structural signal types — these represent gaps in coverage, not active
	// misalignment. A new instance will always have orphaned paths and untested
	// assumptions until the strategy is fully built out.
	isStructural := signalType == domain.SignalTypeOrphan ||
		signalType == domain.SignalTypeStaleness

	switch severity {
	case domain.SignalSeverityCritical:
		if isStructural {
			return 0.05 // structural critical is notable but not alarm-level
		}
		return 0.15 // semantic critical (drift, tension) is a real problem
	case domain.SignalSeverityWarning:
		if isStructural {
			return 0.02 // orphaned paths and staleness are normal WIP
		}
		return 0.04 // semantic warnings deserve attention
	default:
		return 0.00
	}
}

// ComputeEquilibrium computes the coherence score for an instance.
func ComputeEquilibrium(ctx context.Context, db *bun.DB, instanceID uuid.UUID, cfg RippleConfig) (*EquilibriumReport, error) {
	// Load all active signals.
	var signals []*domain.RippleSignal
	err := db.NewSelect().Model(&signals).
		Where("rs.instance_id = ?", instanceID).
		Where("rs.status = ?", domain.SignalStatusActive).
		Scan(ctx)
	if err != nil {
		return nil, fmt.Errorf("load active signals: %w", err)
	}

	// Count dismissed signals for the report.
	dismissedCount, err := db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", domain.SignalStatusDismissed).
		Count(ctx)
	if err != nil {
		return nil, fmt.Errorf("count dismissed signals: %w", err)
	}

	report := &EquilibriumReport{
		Threshold:          cfg.EquilibriumThreshold,
		DismissedCount:     dismissedCount,
		SignalsByAuthority: make(map[string]int),
	}

	var totalPenalty float64

	for _, sig := range signals {
		penalty := signalPenalty(sig.Severity, sig.SignalType)

		// Count by severity.
		switch sig.Severity {
		case domain.SignalSeverityCritical:
			report.CriticalCount++
		case domain.SignalSeverityWarning:
			report.WarningCount++
		case domain.SignalSeverityInfo:
			report.InfoCount++
		}
		totalPenalty += penalty

		// Count by authority tier.
		tier := "unknown"
		if sig.AuthorityTier != nil {
			tier = *sig.AuthorityTier
		}
		report.SignalsByAuthority[tier]++

		// Check if tension signal is within natural baseline.
		if sig.SignalType == domain.SignalTypeTension {
			baseline := cfg.TensionBaseline(sig.SourceKey, sig.TargetKey)
			if baseline > 0 {
				report.TensionWithin++
				// Reverse the penalty — this tension is expected.
				totalPenalty -= penalty
			}
		}
	}

	// Clamp penalty to [0, 1].
	if totalPenalty < 0 {
		totalPenalty = 0
	}
	if totalPenalty > 1 {
		totalPenalty = 1
	}

	report.Score = 1.0 - totalPenalty
	report.InEquilibrium = report.Score >= cfg.EquilibriumThreshold
	if !report.InEquilibrium {
		report.Deficit = cfg.EquilibriumThreshold - report.Score
	}

	return report, nil
}

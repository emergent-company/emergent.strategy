package ripple

import (
	"context"
	"encoding/json"
	"log/slog"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// ConvergenceSummary is the result of a convergence loop run.
type ConvergenceSummary struct {
	Iterations         int     `json:"iterations"`
	AutoResolved       int     `json:"auto_resolved"`
	Escalated          int     `json:"escalated"`
	StartingScore      float64 `json:"starting_score"`
	EndingScore        float64 `json:"ending_score"`
	EquilibriumReached bool    `json:"equilibrium_reached"`
	DampingReason      string  `json:"damping_reason,omitempty"`
	VersionPublished   bool    `json:"version_published,omitempty"`
	VersionID          string  `json:"version_id,omitempty"`
}

// IngestEnqueuer is the interface for triggering async Memory ingestion.
type IngestEnqueuer interface {
	EnqueueBatch(instanceID, batchID uuid.UUID)
}

// ConvergenceServices bundles the dependencies the convergence loop needs.
type ConvergenceServices struct {
	DB       *bun.DB
	Ripple   *Service
	Mem      *memory.Client
	Ingest   IngestEnqueuer // optional — nil when Memory is not configured
	Resolver SignalResolver // optional — nil = agent-orchestrated mode (detection only)
	// CommitAutoFn writes a resolved fix as an autonomous mutation and derives the index.
	// When nil, auto-commits are disabled even if Resolver produces fixes.
	CommitAutoFn func(ctx context.Context, instanceID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error
	// VersionPublisher is called when equilibrium is reached with changes.
	// It receives the instance ID, equilibrium score, and convergence summary.
	// Returns the published version ID, or empty string if auto-publish is disabled.
	VersionPublisher func(ctx context.Context, instanceID uuid.UUID, score float64, summary ConvergenceSummary) (string, error)
}

// RunConvergenceLoop executes the convergence loop after a commit.
// It iteratively detects and auto-resolves low-authority misalignments
// until equilibrium is reached or damping limits are hit.
//
// The loop does NOT generate content — it only resolves signals by
// running coherence checks and auto-resolving autonomous-tier signals
// when the affected artifact was already updated in the triggering batch.
func RunConvergenceLoop(ctx context.Context, instanceID uuid.UUID, triggerBatchID *uuid.UUID, cfg RippleConfig, svc ConvergenceServices) *ConvergenceSummary {
	summary := &ConvergenceSummary{}

	// Compute starting equilibrium score.
	startReport, err := ComputeEquilibrium(ctx, svc.DB, instanceID, cfg)
	if err != nil {
		slog.WarnContext(ctx, "convergence: failed to compute starting equilibrium", "error", err)
		return summary
	}
	summary.StartingScore = startReport.Score

	// If already in equilibrium with no active warning/critical signals, nothing to do.
	if startReport.InEquilibrium && startReport.CriticalCount == 0 && startReport.WarningCount == 0 {
		summary.EndingScore = startReport.Score
		summary.EquilibriumReached = true
		// Persist even the no-op run for completeness.
		noopRun := &domain.ConvergenceRun{
			InstanceID:         instanceID,
			TriggeringBatchID:  triggerBatchID,
			Iterations:         0,
			EquilibriumReached: true,
			StartingScore:      &summary.StartingScore,
			EndingScore:        &summary.EndingScore,
		}
		if saveErr := svc.Ripple.SaveConvergenceRun(ctx, noopRun); saveErr != nil {
			slog.WarnContext(ctx, "convergence: failed to save no-op run record", "error", saveErr)
		}
		return summary
	}

	prevSignalCount := startReport.CriticalCount + startReport.WarningCount + startReport.InfoCount
	var cumulativeChange float64
	changedThisCycle := false
	consecutiveIncreases := 0

	// Capture anchor embeddings (North Star + strategy formula) before the cycle
	// for drift comparison. We use Memory search score as the similarity measure.
	var anchorSnapshots map[string]string // key -> searchable text at cycle start
	anchorSnapshots = captureAnchorTexts(ctx, svc.DB, instanceID)

	for iter := 0; iter < cfg.Damping.MaxIterations; iter++ {
		summary.Iterations = iter + 1

		// Sense: run structural coherence check.
		report, cohErr := AnalyzeCoherence(ctx, svc.DB, instanceID)
		if cohErr != nil {
			slog.WarnContext(ctx, "convergence: coherence check failed", "iteration", iter, "error", cohErr)
			summary.DampingReason = "coherence_error"
			break
		}

		// Generate new signals from the coherence report.
		newSignals := GenerateSignalsFromRipple(instanceID, report)

		// Run semantic analysis if Memory is available.
		analyzer := NewSemanticAnalyzer(svc.Mem, svc.DB)
		if analyzer != nil {
			semanticSignals := analyzer.FullSemanticAnalysisWithConfig(ctx, instanceID, cfg)
			newSignals = append(newSignals, semanticSignals...)
		}

		// Tag signals with authority tiers based on signal type and severity.
		// Structural signals (orphan, staleness) are autonomous — they represent
		// WIP gaps that a resolver can address. Semantic signals (drift, tension,
		// propagation) use severity-based escalation.
		for _, sig := range newSignals {
			tier := classifySignalAuthority(sig, analyzer != nil)
			sig.AuthorityTier = &tier
		}

		// Deduplicate and persist new signals.
		if len(newSignals) > 0 {
			deduped := deduplicateSignals(newSignals)
			if createErr := svc.Ripple.CreateSignals(ctx, deduped); createErr != nil {
				slog.WarnContext(ctx, "convergence: failed to create signals", "error", createErr)
			}
		}

		// Resolve autonomous-tier signals if a resolver is available.
		// In agent-orchestrated mode (Resolver == nil), this block is skipped
		// entirely — the agent sees the signals in the convergence_summary
		// and drives resolution via subsequent MCP calls.
		if svc.Resolver != nil && svc.CommitAutoFn != nil {
			autoSignals, _ := svc.Ripple.ListSignals(ctx, ListParams{
				InstanceID: instanceID,
				Status:     domain.SignalStatusActive,
				Limit:      50,
			})
			for _, sig := range autoSignals {
				// Classify authority on-the-fly for signals that may have been
				// seeded without a tier, or re-classify with current policy.
				tier := classifySignalAuthority(sig, analyzer != nil)
				if tier != string(AuthorityAutonomous) {
					continue
				}

				// Load the target artifact's current payload.
				var targetArt domain.StrategyArtifact
				loadErr := svc.DB.NewSelect().Model(&targetArt).
					Where("sa.instance_id = ?", instanceID).
					Where("sa.artifact_key = ?", sig.TargetKey).
					Where("sa.status = ?", domain.ArtifactStatusActive).
					Scan(ctx)
				if loadErr != nil {
					continue
				}

				// Ask the resolver to generate a fix.
				result, resolveErr := svc.Resolver.Resolve(ctx, sig, targetArt.Payload)
				if resolveErr != nil {
					slog.WarnContext(ctx, "convergence: resolver failed",
						"signal", sig.ID, "target", sig.TargetKey, "error", resolveErr)
					continue
				}
				if result == nil || !result.Updated {
					continue
				}

				// Check change budget before committing.
				if cumulativeChange+result.Distance > cfg.Damping.ChangeBudget {
					slog.InfoContext(ctx, "convergence: skipping auto-commit — would exceed change budget",
						"cumulative", cumulativeChange, "this", result.Distance, "budget", cfg.Damping.ChangeBudget)
					continue
				}

				// Commit the fix.
				commitErr := svc.CommitAutoFn(ctx, instanceID, sig.TargetKey, targetArt.ArtifactType, result.NewPayload, sig.ID)
				if commitErr != nil {
					slog.WarnContext(ctx, "convergence: auto-commit failed",
						"target", sig.TargetKey, "error", commitErr)
					continue
				}

				// Track the change.
				cumulativeChange += result.Distance
				changedThisCycle = true
				summary.AutoResolved++

				// Auto-resolve the signal.
				if _, resolveSignalErr := svc.Ripple.ResolveSignal(ctx, sig.ID, nil); resolveSignalErr != nil {
					slog.WarnContext(ctx, "convergence: failed to resolve signal after auto-commit",
						"signal", sig.ID, "error", resolveSignalErr)
				}

				// Trigger Memory ingestion for the auto-committed artifact.
				if svc.Ingest != nil {
					svc.Ingest.EnqueueBatch(instanceID, sig.ID) // signal ID as batch proxy
				}

				slog.InfoContext(ctx, "convergence: auto-resolved signal",
					"signal", sig.ID, "target", sig.TargetKey,
					"distance", result.Distance, "explanation", result.Explanation)
			}
		}

		// Count current signals for damping checks.
		equilibrium, eqErr := ComputeEquilibrium(ctx, svc.DB, instanceID, cfg)
		if eqErr != nil {
			slog.WarnContext(ctx, "convergence: failed to compute equilibrium", "iteration", iter, "error", eqErr)
			break
		}

		currentSignalCount := equilibrium.CriticalCount + equilibrium.WarningCount + equilibrium.InfoCount

		// Classify escalated signals.
		summary.Escalated = equilibrium.CriticalCount
		if gatedCount, ok := equilibrium.SignalsByAuthority[string(AuthorityGated)]; ok {
			summary.Escalated += gatedCount
		}

		// Emergency brake: signal count increasing for 2 consecutive iterations.
		if iter > 0 && currentSignalCount > prevSignalCount {
			consecutiveIncreases++
			if consecutiveIncreases >= 2 {
				summary.DampingReason = "emergency_brake"
				summary.EndingScore = equilibrium.Score
				slog.WarnContext(ctx, "convergence: emergency brake — signal count increasing for 2 consecutive iterations",
					"prev", prevSignalCount, "current", currentSignalCount, "iteration", iter)
				break
			}
		} else {
			consecutiveIncreases = 0
		}
		prevSignalCount = currentSignalCount

		// Anchor drift check: compare current anchor artifact text to pre-cycle state.
		if anchorDrifted(ctx, svc.DB, instanceID, anchorSnapshots, cfg.Damping.AnchorDriftLimit) {
			summary.DampingReason = "anchor_drift"
			summary.EndingScore = equilibrium.Score
			slog.WarnContext(ctx, "convergence: anchor drift — foundational artifact shifted beyond limit",
				"limit", cfg.Damping.AnchorDriftLimit, "iteration", iter)
			break
		}

		// Check equilibrium.
		if equilibrium.InEquilibrium {
			summary.EndingScore = equilibrium.Score
			summary.EquilibriumReached = true
			break
		}

		// Change budget check.
		if cumulativeChange >= cfg.Damping.ChangeBudget {
			summary.DampingReason = "change_budget_exceeded"
			summary.EndingScore = equilibrium.Score
			break
		}

		summary.EndingScore = equilibrium.Score
	}

	// Max iterations reached without equilibrium.
	if !summary.EquilibriumReached && summary.DampingReason == "" {
		summary.DampingReason = "max_iterations"
	}

	// Auto-publish version when equilibrium is reached and something meaningful
	// happened during this cycle. Two cases:
	//   1. Server-orchestrated: resolver auto-committed fixes (changedThisCycle=true)
	//   2. Agent-orchestrated: the triggering commit itself moved the graph into
	//      equilibrium (starting score was below threshold, ending is above)
	shouldPublish := summary.EquilibriumReached && svc.VersionPublisher != nil &&
		(changedThisCycle || summary.StartingScore < cfg.EquilibriumThreshold)
	if shouldPublish {
		versionID, pubErr := svc.VersionPublisher(ctx, instanceID, summary.EndingScore, *summary)
		if pubErr != nil {
			slog.WarnContext(ctx, "convergence: failed to auto-publish version", "error", pubErr)
		} else if versionID != "" {
			summary.VersionPublished = true
			summary.VersionID = versionID
		}
	}

	// Persist convergence run record.
	run := &domain.ConvergenceRun{
		InstanceID:         instanceID,
		TriggeringBatchID:  triggerBatchID,
		Iterations:         summary.Iterations,
		AutoResolved:       summary.AutoResolved,
		Escalated:          summary.Escalated,
		StartingScore:      &summary.StartingScore,
		EndingScore:        &summary.EndingScore,
		EquilibriumReached: summary.EquilibriumReached,
	}
	if summary.DampingReason != "" {
		run.DampingReason = &summary.DampingReason
	}
	if summaryJSON, err := json.Marshal(summary); err == nil {
		run.Summary = summaryJSON
	}
	if summary.VersionPublished {
		vid, _ := uuid.Parse(summary.VersionID)
		if vid != uuid.Nil {
			run.VersionID = &vid
		}
	}
	if saveErr := svc.Ripple.SaveConvergenceRun(ctx, run); saveErr != nil {
		slog.WarnContext(ctx, "convergence: failed to save run record", "error", saveErr)
	}

	return summary
}

// deduplicateSignals removes duplicate signals by (source_key, target_key, signal_type).
func deduplicateSignals(signals []*domain.RippleSignal) []*domain.RippleSignal {
	seen := make(map[string]bool)
	var result []*domain.RippleSignal
	for _, sig := range signals {
		key := sig.SourceKey + "|" + sig.TargetKey + "|" + sig.SignalType
		if seen[key] {
			continue
		}
		seen[key] = true
		result = append(result, sig)
	}
	return result
}

// anchorArtifactKeys are the artifact keys of foundational artifacts that must
// not drift during a convergence cycle.
var anchorArtifactKeys = []string{"north_star", "strategy_formula"}

// captureAnchorTexts reads the searchable text of anchor artifacts at the start
// of a convergence cycle, to compare against later for drift detection.
func captureAnchorTexts(ctx context.Context, db *bun.DB, instanceID uuid.UUID) map[string]string {
	result := make(map[string]string)
	for _, key := range anchorArtifactKeys {
		var a domain.StrategyArtifact
		err := db.NewSelect().Model(&a).
			Where("sa.instance_id = ?", instanceID).
			Where("sa.artifact_key = ?", key).
			Where("sa.status = ?", domain.ArtifactStatusActive).
			Scan(ctx)
		if err != nil {
			continue
		}
		text := extractSearchableText(a.Payload)
		if text != "" {
			result[key] = text
		}
	}
	return result
}

// anchorDrifted checks whether any anchor artifact's content has drifted from
// its pre-cycle snapshot beyond the allowed limit. Uses word-overlap ratio as
// a fast, Memory-independent comparison.
func anchorDrifted(ctx context.Context, db *bun.DB, instanceID uuid.UUID, snapshots map[string]string, limit float64) bool {
	if len(snapshots) == 0 || limit <= 0 {
		return false
	}
	for _, key := range anchorArtifactKeys {
		originalText, ok := snapshots[key]
		if !ok {
			continue
		}
		var a domain.StrategyArtifact
		err := db.NewSelect().Model(&a).
			Where("sa.instance_id = ?", instanceID).
			Where("sa.artifact_key = ?", key).
			Where("sa.status = ?", domain.ArtifactStatusActive).
			Scan(ctx)
		if err != nil {
			continue
		}
		currentText := extractSearchableText(a.Payload)
		if currentText == "" {
			continue
		}
		similarity := textSimilarityRatio(originalText, currentText)
		drift := 1.0 - similarity
		if drift > limit {
			slog.WarnContext(ctx, "convergence: anchor drift detected",
				"key", key, "drift", drift, "limit", limit)
			return true
		}
	}
	return false
}

// classifySignalAuthority determines the authority tier for a signal based on
// its type and severity. Structural signals (orphan, staleness) are autonomous
// because they represent resolvable WIP gaps. Semantic signals use severity.
func classifySignalAuthority(sig *domain.RippleSignal, hasSemanticAnalyzer bool) string {
	// Structural signals — these are actionable by the resolver.
	switch sig.SignalType {
	case domain.SignalTypeOrphan, domain.SignalTypeStaleness:
		// Structural warnings and info are autonomous — the resolver can
		// suggest contributing features, update stale references, etc.
		if sig.Severity == domain.SignalSeverityCritical {
			return string(AuthorityGated)
		}
		return string(AuthorityAutonomous)
	case domain.SignalTypeClustering:
		// Clustering signals suggest missing relationships — autonomous.
		return string(AuthorityAutonomous)
	}

	// Semantic signals — use severity-based escalation.
	if !hasSemanticAnalyzer {
		return string(AuthorityGated) // no semantic → never autonomous
	}

	switch sig.Severity {
	case domain.SignalSeverityInfo:
		return string(AuthorityAutonomous)
	case domain.SignalSeverityWarning:
		return string(AuthorityGated)
	case domain.SignalSeverityCritical:
		return string(AuthorityEscalated)
	}
	return string(AuthorityGated)
}

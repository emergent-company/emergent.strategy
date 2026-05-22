// Package pipeline — postcommit.go
//
// PostCommitPipeline is the shared post-commit hook that runs after every batch
// commit, regardless of whether the commit originated from the MCP commit_batch
// tool or the web UI handleDraftCommit handler.
//
// Pipeline steps (in order):
//  1. Auto-resolve signals whose targets were updated by the committed batch.
//  2. Structural ripple analysis for each changed artifact → new signals.
//  3. Semantic change classification (no-op when Memory is not configured).
//  4. Persist new signals (deduplicated).
//  5. Enqueue adapt-foundations when gated/escalated signals target READY artifacts.
//  6. Convergence loop (ripple damping + equilibrium scoring).
package pipeline

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	schemadom "github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/schema"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/semantic"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/skillexec"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/version"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

// IngestEnqueuer is implemented by the Memory ingest enqueuer — kept as an
// interface so the handler package has no direct dependency on that package.
type IngestEnqueuer interface {
	EnqueueBatch(instanceID, batchID uuid.UUID)
}

// PostCommitPipeline holds the explicit dependencies required to run the
// post-commit hook. All fields except RippleSvc are optional (nil-safe).
type PostCommitPipeline struct {
	RippleSvc   *ripple.Service
	SemanticSvc *semantic.Service
	StrategySvc *strategy.Service
	VersionSvc  *version.Service
	SkillExec   *skillexec.Executor
	SchemaSvc   *schemadom.Service
	Ingest      IngestEnqueuer
	Resolver    ripple.SignalResolver
}

// PostCommitResult summarises what the pipeline did. Zero values are safe.
type PostCommitResult struct {
	NewSignals         int
	ResolvedSignals    int
	ActiveTotal        int
	ConvergenceIters   int
	ConvergenceSummary *ripple.ConvergenceSummary
}

// Run executes the full post-commit pipeline for a committed batch.
// It is safe to call when RippleSvc is nil — it becomes a no-op in that case.
func (p *PostCommitPipeline) Run(ctx context.Context, instanceID, batchID uuid.UUID) PostCommitResult {
	if p.RippleSvc == nil || p.StrategySvc == nil {
		return PostCommitResult{}
	}

	// ------------------------------------------------------------------
	// 1. Find which artifact keys changed in this batch.
	// ------------------------------------------------------------------
	mutations, _, _ := p.StrategySvc.ListMutations(ctx, instanceID, "", false, 200, "", "")

	var changedKeys []string
	for _, m := range mutations {
		if m.BatchID != nil && *m.BatchID == batchID && m.Status == domain.MutationStatusCommitted {
			changedKeys = append(changedKeys, m.ArtifactKey)
		}
	}
	if len(changedKeys) == 0 {
		return PostCommitResult{}
	}

	// ------------------------------------------------------------------
	// 2. Auto-resolve signals whose targets were updated.
	// ------------------------------------------------------------------
	totalResolved := 0
	for _, key := range changedKeys {
		n, err := p.RippleSvc.ResolveByTarget(ctx, instanceID, key, &batchID)
		if err != nil {
			slog.WarnContext(ctx, "postcommit: failed to auto-resolve signals", "target", key, "error", err)
			continue
		}
		totalResolved += n
	}

	// ------------------------------------------------------------------
	// 3. Structural ripple analysis → new signals.
	// ------------------------------------------------------------------
	var memClient *memory.Client
	if p.SemanticSvc != nil {
		memClient = p.SemanticSvc.Client()
	}
	var allNewSignals []*domain.RippleSignal
	for _, key := range changedKeys {
		report, err := ripple.AnalyzeStructuralRipple(ctx, p.StrategySvc.DB(), memClient, instanceID, key, "")
		if err != nil {
			slog.WarnContext(ctx, "postcommit: structural analysis failed", "key", key, "error", err)
			continue
		}
		allNewSignals = append(allNewSignals, ripple.GenerateSignalsFromRipple(instanceID, report)...)
	}

	// ------------------------------------------------------------------
	// 4. Semantic change classification (non-blocking, Memory optional).
	// ------------------------------------------------------------------
	analyzer := ripple.NewSemanticAnalyzer(memClient, p.StrategySvc.DB())
	cfg := ripple.DefaultRippleConfig()
	if loadedCfg, cfgErr := p.RippleSvc.GetConfig(ctx, instanceID); cfgErr == nil {
		cfg = loadedCfg
	}
	if analyzer != nil {
		for _, m := range mutations {
			if m.BatchID == nil || *m.BatchID != batchID || m.Status != domain.MutationStatusCommitted {
				continue
			}
			oldArt, oldErr := p.StrategySvc.GetCurrentArtifactFull(ctx, instanceID, m.ArtifactKey)
			if oldErr != nil || oldArt == nil {
				continue
			}
			result, classErr := analyzer.ClassifyChange(ctx, m.ArtifactKey, oldArt.Payload, m.Payload, cfg)
			if classErr != nil {
				continue
			}
			if result.Class == ripple.ChangeClassSignificant || result.Class == ripple.ChangeClassMajor {
				slog.InfoContext(ctx, "postcommit: semantic change detected",
					"key", m.ArtifactKey,
					"class", result.Class,
					"score", result.Score,
					"authority", result.AuthorityTier,
					"description", result.Description,
				)
			}
		}
	}

	// ------------------------------------------------------------------
	// 5. Deduplicate and persist new signals.
	// ------------------------------------------------------------------
	seen := make(map[string]bool)
	var deduped []*domain.RippleSignal
	for _, sig := range allNewSignals {
		k := sig.SourceKey + "|" + sig.TargetKey + "|" + sig.SignalType
		if seen[k] {
			continue
		}
		seen[k] = true
		deduped = append(deduped, sig)
	}
	if len(deduped) > 0 {
		if err := p.RippleSvc.CreateSignals(ctx, deduped); err != nil {
			slog.WarnContext(ctx, "postcommit: failed to create signals", "count", len(deduped), "error", err)
		}
	}

	// ------------------------------------------------------------------
	// 6. Enqueue adapt-foundations if warranted.
	// ------------------------------------------------------------------
	p.enqueueFoundationDraft(ctx, instanceID, deduped, changedKeys)

	// ------------------------------------------------------------------
	// 7. Convergence loop.
	// ------------------------------------------------------------------
	convSvc := ripple.ConvergenceServices{
		DB:     p.StrategySvc.DB(),
		Ripple: p.RippleSvc,
		Mem:    memClient,
		Ingest: p.Ingest,
		// Resolver: nil means agent-orchestrated mode (human reviews signals).
		Resolver: p.Resolver,
	}
	convSvc.CommitAutoFn = func(commitCtx context.Context, instID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error {
		_, err := p.StrategySvc.CommitAuto(commitCtx, strategy.CommitAutoParams{
			InstanceID:   instID,
			ArtifactType: artifactType,
			ArtifactKey:  artifactKey,
			Action:       "update",
			Payload:      payload,
			SignalID:     &signalID,
		})
		return err
	}
	if p.VersionSvc != nil {
		convSvc.VersionPublisher = func(pubCtx context.Context, instID uuid.UUID, score float64, summary ripple.ConvergenceSummary) (string, error) {
			shortBatchID := batchID.String()[:8]
			label := fmt.Sprintf("Equilibrium after batch %s", shortBatchID)
			desc := fmt.Sprintf("Auto-published by convergence loop. Score: %.2f, iterations: %d, auto-resolved: %d",
				score, summary.Iterations, summary.AutoResolved)
			ver, pubErr := p.VersionSvc.Publish(pubCtx, instID, label, desc)
			if pubErr != nil {
				return "", pubErr
			}
			eqScore := score
			ver.Source = "convergence"
			ver.EquilibriumScore = &eqScore
			if summaryJSON, jsonErr := json.Marshal(summary); jsonErr == nil {
				ver.ConvergenceMeta = summaryJSON
			}
			_, updateErr := p.StrategySvc.DB().NewUpdate().Model(ver).
				Column("source", "equilibrium_score", "convergence_meta").
				WherePK().
				Exec(pubCtx)
			if updateErr != nil {
				slog.WarnContext(pubCtx, "postcommit: failed to update version metadata", "error", updateErr)
			}
			return ver.ID.String(), nil
		}
	}
	summary := ripple.RunConvergenceLoop(ctx, instanceID, &batchID, cfg, convSvc)

	// ------------------------------------------------------------------
	// 8. Schema validation warnings (best-effort, non-blocking).
	// ------------------------------------------------------------------
	for _, m := range mutations {
		if m.BatchID == nil || *m.BatchID != batchID {
			continue
		}
		var source embedded.SchemaSource
		if p.SchemaSvc != nil {
			source = schemadom.NewRegistrySchemaSource(ctx, p.SchemaSvc, "", "standard")
		}
		vr := embedded.ValidateArtifactWithSource(m.ArtifactType, m.Payload, source)
		if !vr.Valid {
			for _, e := range vr.Errors {
				slog.WarnContext(ctx, "postcommit: schema validation warning",
					"artifact_key", m.ArtifactKey,
					"artifact_type", m.ArtifactType,
					"error", e,
				)
			}
		}
	}

	// Active signal counts.
	counts, _ := p.RippleSvc.CountByStatus(ctx, instanceID)
	activeTotal := counts[domain.SignalSeverityCritical] + counts[domain.SignalSeverityWarning] + counts[domain.SignalSeverityInfo]

	return PostCommitResult{
		NewSignals:         len(deduped),
		ResolvedSignals:    totalResolved,
		ActiveTotal:        activeTotal,
		ConvergenceIters:   summary.Iterations,
		ConvergenceSummary: summary,
	}
}

// foundationArtifactKeys is the set of READY-layer artifact keys that
// adapt-foundations can update. Must match the set in register_ripple_tools.go
// until that function is removed.
var foundationArtifactKeys = map[string]bool{
	"north-star":           true,
	"north_star":           true,
	"strategy-foundations": true,
	"strategy_foundations": true,
	"insight-analyses":     true,
	"insight_analyses":     true,
	"insight-opportunity":  true,
	"insight_opportunity":  true,
}

// enqueueFoundationDraft checks whether any newly created signals target
// foundation artifacts with gated or escalated authority. If so, it runs
// adapt-foundations asynchronously, producing a staged batch for human review.
// This is a non-blocking goroutine launch.
func (p *PostCommitPipeline) enqueueFoundationDraft(ctx context.Context, instanceID uuid.UUID, newSignals []*domain.RippleSignal, changedKeys []string) {
	if p.SkillExec == nil {
		return
	}

	// Only trigger when execution-layer artifacts actually changed.
	executionChanged := false
	for _, k := range changedKeys {
		if k == "strategy-formula" || k == "strategy_formula" ||
			k == "roadmap-recipe" || k == "roadmap_recipe" {
			executionChanged = true
			break
		}
	}
	if !executionChanged {
		return
	}

	// Collect foundation-targeting gated/escalated signals.
	var triggerSignals []*domain.RippleSignal
	highestTier := ""
	for _, sig := range newSignals {
		if !foundationArtifactKeys[sig.TargetKey] {
			continue
		}
		tier := ""
		if sig.AuthorityTier != nil {
			tier = string(*sig.AuthorityTier)
		}
		if tier != string(ripple.AuthorityGated) && tier != string(ripple.AuthorityEscalated) {
			continue
		}
		triggerSignals = append(triggerSignals, sig)
		if tier == string(ripple.AuthorityEscalated) {
			highestTier = tier
		} else if highestTier == "" {
			highestTier = tier
		}
	}
	if len(triggerSignals) == 0 {
		return
	}

	tierLabel := "Formulation alignment"
	if highestTier == string(ripple.AuthorityEscalated) {
		tierLabel = "Strategic realignment"
	}
	batchDesc := fmt.Sprintf("%s draft — triggered by %d ripple signal(s) after execution layer changes. Authority: %s. Review carefully before committing.",
		tierLabel, len(triggerSignals), highestTier)

	triggeringSignalsMaps := make([]map[string]any, 0, len(triggerSignals))
	for _, sig := range triggerSignals {
		tier := ""
		if sig.AuthorityTier != nil {
			tier = string(*sig.AuthorityTier)
		}
		triggeringSignalsMaps = append(triggeringSignalsMaps, map[string]any{
			"id":             sig.ID.String(),
			"type":           sig.SignalType,
			"severity":       sig.Severity,
			"authority_tier": tier,
			"source_key":     sig.SourceKey,
			"target_key":     sig.TargetKey,
			"description":    sig.Description,
		})
	}

	signalIDs := make([]string, 0, len(triggerSignals))
	for _, sig := range triggerSignals {
		signalIDs = append(signalIDs, sig.ID.String())
	}

	params := map[string]any{
		"triggered_by_signals": signalIDs,
		"batch_desc_override":  batchDesc,
		"_trigger":             "ripple",
		"_trigger_context": map[string]any{
			"signal_ids":     signalIDs,
			"authority_tier": highestTier,
			"changed_keys":   changedKeys,
		},
	}

	executor := p.SkillExec
	slog.InfoContext(ctx, "postcommit: enqueuing adapt-foundations",
		"instance_id", instanceID,
		"signal_count", len(triggerSignals),
		"highest_tier", highestTier)

	go func() {
		bgCtx := context.Background()
		result, err := executor.RunChunkedWithSignals(bgCtx, instanceID, "adapt-foundations", params, triggeringSignalsMaps, batchDesc)
		if err != nil {
			slog.Warn("postcommit: adapt-foundations run failed",
				"instance_id", instanceID,
				"error", err,
				"staged_so_far", result.ArtifactTypes)
			return
		}
		slog.Info("postcommit: adapt-foundations staged",
			"instance_id", instanceID,
			"batch_id", result.BatchID,
			"artifact_types", result.ArtifactTypes)
	}()
}

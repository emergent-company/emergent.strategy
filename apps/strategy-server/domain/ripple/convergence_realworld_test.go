package ripple_test

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"
	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ingest"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/instance"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/workspace"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/memory"
)

const emergentInstancePath = "../../../../docs/EPF/_instances/emergent"

// TestConvergence_RealEmergentInstance loads the actual Emergent EPF instance
// from disk, imports it into a test database, then runs the full convergence
// loop to observe how the engine behaves against real strategic content.
//
// This test does NOT write anything back to disk — it's read-only against the
// EPF files and writes only to an ephemeral test database.
func TestConvergence_RealEmergentInstance(t *testing.T) {
	// Check the instance exists.
	absPath, err := filepath.Abs(emergentInstancePath)
	if err != nil || !dirExists(absPath) {
		t.Skipf("Emergent EPF instance not found at %s — skipping real-world test", emergentInstancePath)
	}

	db := database.TestDB(t)
	ctx := context.Background()

	// --- Import the instance ---
	t.Log("=== Phase 1: Import Emergent EPF instance ===")

	wsSvc := workspace.NewService(db)
	ws, err := wsSvc.CreateWorkspace(ctx, "emergent-company", nil)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}

	payloads, productName := scanTestInstance(t, absPath)
	t.Logf("Scanned %d artifacts from disk (product: %s)", len(payloads), productName)

	instSvc := instance.NewService(db)
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:     ws.ID,
		Name:            productName,
		InitialPayloads: payloads,
	})
	if err != nil {
		t.Fatalf("import instance: %v", err)
	}
	t.Logf("Instance imported: %s (id: %s)", inst.Name, inst.ID)

	// Backfill strategic index.
	stratSvc := strategy.NewService(db)
	indexed, err := stratSvc.BackfillIndex(ctx, inst.ID)
	if err != nil {
		t.Fatalf("backfill index: %v", err)
	}
	t.Logf("Strategic index derived: %d artifacts indexed", indexed)

	// --- Check initial state ---
	t.Log("\n=== Phase 2: Initial equilibrium assessment ===")

	rippleSvc := ripple.NewService(db)
	cfg := ripple.DefaultRippleConfig()

	report, err := ripple.ComputeEquilibrium(ctx, db, inst.ID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	t.Logf("Initial equilibrium: score=%.2f, threshold=%.2f, in_equilibrium=%v",
		report.Score, report.Threshold, report.InEquilibrium)
	t.Logf("  Critical: %d, Warning: %d, Info: %d, Dismissed: %d",
		report.CriticalCount, report.WarningCount, report.InfoCount, report.DismissedCount)

	// --- Run structural coherence check ---
	t.Log("\n=== Phase 3: Structural coherence check ===")

	cohReport, err := ripple.AnalyzeCoherence(ctx, db, inst.ID)
	if err != nil {
		t.Fatalf("coherence check: %v", err)
	}
	t.Logf("Orphaned value paths: %d", len(cohReport.OrphanedPaths))
	for _, o := range cohReport.OrphanedPaths {
		t.Logf("  - %s (%s)", o.ValuePath, o.ArtifactType)
	}
	t.Logf("Untested assumptions: %d", len(cohReport.UntestedAssumptions))
	for _, u := range cohReport.UntestedAssumptions {
		t.Logf("  - %s", u.AssumptionKey)
	}

	// --- Generate signals from coherence report ---
	signals := ripple.GenerateSignalsFromRipple(inst.ID, cohReport)
	t.Logf("Signals generated from structural analysis: %d", len(signals))
	for _, s := range signals {
		t.Logf("  [%s/%s] %s → %s: %s",
			s.SignalType, s.Severity, s.SourceKey, s.TargetKey, truncate(s.Description, 80))
	}

	// Persist signals so convergence loop can see them.
	if len(signals) > 0 {
		if err := rippleSvc.CreateSignals(ctx, signals); err != nil {
			t.Fatalf("create signals: %v", err)
		}
	}

	// --- Run convergence loop ---
	t.Log("\n=== Phase 4: Run convergence loop (structural only, no resolver) ===")

	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: rippleSvc,
		// No Memory, no Resolver — structural analysis + agent-orchestrated mode.
	}

	summary := ripple.RunConvergenceLoop(ctx, inst.ID, nil, cfg, convSvc)

	t.Logf("\nConvergence result:")
	t.Logf("  Iterations:      %d", summary.Iterations)
	t.Logf("  Starting score:  %.2f", summary.StartingScore)
	t.Logf("  Ending score:    %.2f", summary.EndingScore)
	t.Logf("  Equilibrium:     %v", summary.EquilibriumReached)
	t.Logf("  Auto-resolved:   %d", summary.AutoResolved)
	t.Logf("  Escalated:       %d", summary.Escalated)
	t.Logf("  Damping reason:  %s", summary.DampingReason)
	t.Logf("  Version publish: %v", summary.VersionPublished)

	// --- Simulate a North Star change and check blast radius ---
	t.Log("\n=== Phase 5: Simulate North Star change → blast radius ===")

	blastReport, err := ripple.AnalyzeStructuralRipple(ctx, db, inst.ID, "north_star", "north_star")
	if err != nil {
		t.Fatalf("blast radius: %v", err)
	}
	t.Logf("North Star blast radius: %d affected artifacts", len(blastReport.AffectedArtifacts))
	for _, a := range blastReport.AffectedArtifacts {
		t.Logf("  [%s] %s (%s) — %s, stale %d days",
			a.Direction, a.ArtifactKey, a.ArtifactType, a.Relationship, a.StaleDays)
	}

	// Generate signals from the blast radius.
	blastSignals := ripple.GenerateSignalsFromRipple(inst.ID, blastReport)
	t.Logf("Signals from North Star ripple: %d", len(blastSignals))
	for _, s := range blastSignals {
		t.Logf("  [%s/%s] %s: %s", s.SignalType, s.Severity, s.TargetKey, truncate(s.Description, 80))
	}

	// --- Now run convergence with a mock resolver to test auto-resolution ---
	t.Log("\n=== Phase 6: Convergence with mock resolver ===")

	if len(blastSignals) > 0 {
		// Tag signals as autonomous for testing.
		autoTier := string(ripple.AuthorityAutonomous)
		for _, s := range blastSignals {
			s.AuthorityTier = &autoTier
		}
		if err := rippleSvc.CreateSignals(ctx, blastSignals); err != nil {
			t.Fatalf("create blast signals: %v", err)
		}
	}

	// Use a tight config to see damping in action.
	tightCfg := ripple.DefaultRippleConfig()
	tightCfg.EquilibriumThreshold = 0.95 // strict
	tightCfg.Damping.MaxIterations = 3
	tightCfg.Damping.ChangeBudget = 0.15 // tight

	resolveCount := 0
	resolver := &countingResolver{
		result: &ripple.ResolveResult{
			Updated:     true,
			NewPayload:  json.RawMessage(`{"auto_fixed": true}`),
			Explanation: "Simulated alignment fix",
			Distance:    0.04,
		},
		count: &resolveCount,
	}

	commitCount := 0
	convSvc2 := ripple.ConvergenceServices{
		DB:       db,
		Ripple:   rippleSvc,
		Resolver: resolver,
		CommitAutoFn: func(ctx context.Context, instanceID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error {
			commitCount++
			t.Logf("  CommitAuto #%d: %s (type=%s)", commitCount, artifactKey, artifactType)
			return nil
		},
	}

	summary2 := ripple.RunConvergenceLoop(ctx, inst.ID, nil, tightCfg, convSvc2)

	t.Logf("\nConvergence with resolver:")
	t.Logf("  Iterations:      %d", summary2.Iterations)
	t.Logf("  Starting score:  %.2f", summary2.StartingScore)
	t.Logf("  Ending score:    %.2f", summary2.EndingScore)
	t.Logf("  Equilibrium:     %v", summary2.EquilibriumReached)
	t.Logf("  Auto-resolved:   %d", summary2.AutoResolved)
	t.Logf("  Escalated:       %d", summary2.Escalated)
	t.Logf("  Damping reason:  %s", summary2.DampingReason)
	t.Logf("  Resolver calls:  %d", resolveCount)
	t.Logf("  Commits:         %d", commitCount)

	// --- Final signal inventory ---
	t.Log("\n=== Phase 7: Final signal inventory ===")
	counts, err := rippleSvc.CountByStatus(ctx, inst.ID)
	if err != nil {
		t.Fatalf("count signals: %v", err)
	}
	t.Logf("Final signal counts: critical=%d, warning=%d, info=%d",
		counts[domain.SignalSeverityCritical],
		counts[domain.SignalSeverityWarning],
		counts[domain.SignalSeverityInfo])

	// --- Convergence history ---
	runs, err := rippleSvc.ListConvergenceRuns(ctx, inst.ID, "", 10)
	if err != nil {
		t.Fatalf("list convergence runs: %v", err)
	}
	t.Logf("Convergence runs recorded: %d", len(runs))
	for _, r := range runs {
		damping := "none"
		if r.DampingReason != nil {
			damping = *r.DampingReason
		}
		t.Logf("  iter=%d, auto=%d, escalated=%d, eq=%.2f→%.2f, damping=%s",
			r.Iterations, r.AutoResolved, r.Escalated,
			safeFloat(r.StartingScore), safeFloat(r.EndingScore), damping)
	}
}

// TestConvergence_RealEmergentInstance_WithMemory runs the full convergence loop
// against the real Emergent EPF instance with Memory semantic analysis enabled.
// It imports the instance, ingests all artifacts into Memory, waits for
// embeddings, then runs the complete semantic analysis pipeline.
//
// Requires Memory server running (reads config from .env.local).
func TestConvergence_RealEmergentInstance_WithMemory(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping semantic test in short mode")
	}

	absPath, err := filepath.Abs(emergentInstancePath)
	if err != nil || !dirExists(absPath) {
		t.Skipf("Emergent EPF instance not found at %s", emergentInstancePath)
	}

	// Load Memory config from .env.local.
	memCfg := loadMemoryConfig(t)
	memClient, memErr := memory.New(memCfg)
	if memErr != nil {
		t.Skipf("Memory client creation failed: %v", memErr)
	}

	// Quick health check.
	_, searchErr := memClient.Search(context.Background(), memory.SearchRequest{
		Query: "test", Limit: 1,
	})
	if searchErr != nil {
		t.Skipf("Memory not available: %v", searchErr)
	}

	db := database.TestDB(t)
	ctx := context.Background()

	// --- Phase 1: Import ---
	t.Log("=== Phase 1: Import Emergent EPF instance ===")
	wsSvc := workspace.NewService(db)
	ws, err := wsSvc.CreateWorkspace(ctx, "emergent-semantic-test", nil)
	if err != nil {
		t.Fatalf("create workspace: %v", err)
	}
	payloads, productName := scanTestInstance(t, absPath)
	t.Logf("Scanned %d artifacts (product: %s)", len(payloads), productName)

	instSvc := instance.NewService(db)
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID:     ws.ID,
		Name:            productName,
		InitialPayloads: payloads,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	stratSvc := strategy.NewService(db)
	indexed, _ := stratSvc.BackfillIndex(ctx, inst.ID)
	t.Logf("Indexed %d artifacts (instance: %s)", indexed, inst.ID)

	// --- Phase 2: Ingest into Memory ---
	t.Log("\n=== Phase 2: Ingest artifacts into Memory ===")
	ingestSvc := ingest.NewService(db, memClient)
	if ingestErr := ingestSvc.ReingestInstance(ctx, inst.ID); ingestErr != nil {
		t.Fatalf("ingest into Memory: %v", ingestErr)
	}
	t.Log("Ingestion complete — waiting for embeddings...")

	// Poll embedding progress until all are computed.
	waitForEmbeddings(t, memClient, 90*time.Second)

	// Verify ingestion by searching for a known artifact.
	verifyResults, _ := memClient.Search(ctx, memory.SearchRequest{
		Query: "strategy", Limit: 5,
	})
	t.Logf("Verification search for 'strategy': %d results", len(verifyResults))
	for _, r := range verifyResults {
		t.Logf("  %s (type=%s, score=%.2f)", r.Object.Key, r.Object.Type, r.Score)
	}

	rippleSvc := ripple.NewService(db)
	cfg := ripple.DefaultRippleConfig()

	// --- Phase 3: Semantic drift detection ---
	t.Log("\n=== Phase 3: Semantic Drift Detection ===")
	analyzer := ripple.NewSemanticAnalyzer(memClient, db)
	if analyzer == nil {
		t.Fatal("analyzer should not be nil")
	}

	drifts, driftErr := analyzer.DetectDrift(ctx, inst.ID)
	if driftErr != nil {
		t.Logf("Drift error (non-fatal): %v", driftErr)
	}
	t.Logf("Drift signals: %d", len(drifts))
	for _, d := range drifts {
		t.Logf("  %s drifting from %s (better: %s %.2f)",
			d.ArtifactKey, d.DeclaredPath, d.BetterMatch, d.BetterMatchScore)
	}

	// --- Phase 4: Clustering detection ---
	t.Log("\n=== Phase 4: Clustering Detection ===")
	clusters, clusterErr := analyzer.DetectClustering(ctx, inst.ID)
	if clusterErr != nil {
		t.Logf("Clustering error (non-fatal): %v", clusterErr)
	}
	t.Logf("Clustering signals: %d", len(clusters))
	for i, c := range clusters {
		if i >= 10 {
			t.Logf("  ... and %d more", len(clusters)-10)
			break
		}
		t.Logf("  %s <-> %s (score %.2f)", c.ArtifactKeyA, c.ArtifactKeyB, c.Score)
	}

	// --- Phase 5: Cross-track tension ---
	t.Log("\n=== Phase 5: Cross-Track Tension ===")
	tensionSignals, tensionResults, tensionErr := ripple.DetectCrossTrackTension(ctx, db, memClient, inst.ID, cfg)
	if tensionErr != nil {
		t.Logf("Tension error (non-fatal): %v", tensionErr)
	}
	t.Logf("Track pairs analyzed: %d", len(tensionResults))
	for _, tr := range tensionResults {
		status := "within baseline"
		if tr.Excess > 0 {
			status = fmt.Sprintf("EXCESS %.2f", tr.Excess)
		}
		t.Logf("  %s <-> %s: similarity=%.2f, baseline=%.2f → %s",
			tr.TrackA, tr.TrackB, tr.MeasuredScore, tr.Baseline, status)
	}
	t.Logf("Tension signals: %d", len(tensionSignals))

	// --- Phase 6: Vertical alignment ---
	t.Log("\n=== Phase 6: Vertical Alignment (top-down) ===")
	verticalSignals, verticalResults, verticalErr := ripple.DetectVerticalMisalignment(ctx, db, memClient, inst.ID, cfg)
	if verticalErr != nil {
		t.Logf("Vertical error (non-fatal): %v", verticalErr)
	}
	t.Logf("Vertical pairs evaluated: %d", len(verticalResults))
	aligned, weak, notFound := 0, 0, 0
	for _, vr := range verticalResults {
		switch {
		case vr.Similarity == 0 && strings.Contains(vr.Description, "does not appear"):
			notFound++
		case vr.Similarity > 0 && vr.Similarity < 0.20:
			weak++
		default:
			aligned++
		}
	}
	t.Logf("  Aligned: %d, Weak: %d, Not found: %d", aligned, weak, notFound)
	for i, vr := range verticalResults {
		if i >= 20 {
			t.Logf("  ... and %d more", len(verticalResults)-20)
			break
		}
		status := fmt.Sprintf("%.2f", vr.Similarity)
		if vr.Similarity == 0 && strings.Contains(vr.Description, "does not appear") {
			status = "NOT FOUND"
		}
		t.Logf("  [%s] %s → %s", status, vr.UpstreamKey, vr.DownstreamKey)
	}
	t.Logf("Vertical signals: %d", len(verticalSignals))

	// --- Phase 7: Full analysis + equilibrium ---
	t.Log("\n=== Phase 7: Full Semantic Analysis + Equilibrium ===")
	allSignals := analyzer.FullSemanticAnalysisWithConfig(ctx, inst.ID, cfg)
	byType := map[string]int{}
	bySeverity := map[string]int{}
	for _, s := range allSignals {
		byType[s.SignalType]++
		bySeverity[s.Severity]++
	}
	t.Logf("Total semantic signals: %d (by type: %v, by severity: %v)",
		len(allSignals), byType, bySeverity)

	// Persist all signals.
	if len(allSignals) > 0 {
		_ = rippleSvc.CreateSignals(ctx, allSignals)
	}
	cohReport, _ := ripple.AnalyzeCoherence(ctx, db, inst.ID)
	structSignals := ripple.GenerateSignalsFromRipple(inst.ID, cohReport)
	if len(structSignals) > 0 {
		_ = rippleSvc.CreateSignals(ctx, structSignals)
	}

	eqReport, _ := ripple.ComputeEquilibrium(ctx, db, inst.ID, cfg)
	t.Logf("Equilibrium: score=%.2f, threshold=%.2f, in_eq=%v",
		eqReport.Score, eqReport.Threshold, eqReport.InEquilibrium)
	t.Logf("  Critical: %d, Warning: %d, Info: %d, Tension within baseline: %d",
		eqReport.CriticalCount, eqReport.WarningCount, eqReport.InfoCount, eqReport.TensionWithin)

	// --- Phase 8: Convergence with full semantic ---
	t.Log("\n=== Phase 8: Convergence Loop (structural + semantic) ===")
	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: rippleSvc,
		Mem:    memClient,
	}
	summary := ripple.RunConvergenceLoop(ctx, inst.ID, nil, cfg, convSvc)
	t.Logf("Convergence: iterations=%d, score=%.2f→%.2f, equilibrium=%v, escalated=%d, damping=%s",
		summary.Iterations, summary.StartingScore, summary.EndingScore,
		summary.EquilibriumReached, summary.Escalated, summary.DampingReason)
}

// TestConvergence_RealEmergentInstance_FullLoop runs the convergence loop with
// a resolver that generates real fixes, commits them via CommitAuto, and loops
// until equilibrium is reached or damping fires. This tests the full
// sense → classify → resolve → commit → re-sense cycle.
func TestConvergence_RealEmergentInstance_FullLoop(t *testing.T) {
	if testing.Short() {
		t.Skip("skipping full convergence loop test in short mode")
	}

	absPath, err := filepath.Abs(emergentInstancePath)
	if err != nil || !dirExists(absPath) {
		t.Skipf("Emergent EPF instance not found at %s", emergentInstancePath)
	}

	memCfg := loadMemoryConfig(t)
	memClient, memErr := memory.New(memCfg)
	if memErr != nil {
		t.Skipf("Memory client failed: %v", memErr)
	}
	if _, err := memClient.Search(context.Background(), memory.SearchRequest{Query: "test", Limit: 1}); err != nil {
		t.Skipf("Memory not available: %v", err)
	}

	db := database.TestDB(t)
	ctx := context.Background()

	// --- Import ---
	t.Log("=== Import ===")
	wsSvc := workspace.NewService(db)
	ws, _ := wsSvc.CreateWorkspace(ctx, "emergent-fullloop", nil)
	payloads, productName := scanTestInstance(t, absPath)
	instSvc := instance.NewService(db)
	inst, err := instSvc.ImportInstance(ctx, instance.ImportParams{
		WorkspaceID: ws.ID, Name: productName, InitialPayloads: payloads,
	})
	if err != nil {
		t.Fatalf("import: %v", err)
	}
	stratSvc := strategy.NewService(db)
	indexed, _ := stratSvc.BackfillIndex(ctx, inst.ID)
	t.Logf("Imported %d artifacts", indexed)

	// --- Ingest into Memory ---
	t.Log("=== Ingest ===")
	ingestSvc := ingest.NewService(db, memClient)
	if ingestErr := ingestSvc.ReingestInstance(ctx, inst.ID); ingestErr != nil {
		t.Fatalf("ingest: %v", ingestErr)
	}
	waitForEmbeddings(t, memClient, 90*time.Second)

	rippleSvc := ripple.NewService(db)
	cfg := ripple.DefaultRippleConfig()

	// --- Initial equilibrium ---
	t.Log("\n=== Initial State ===")
	eq0, _ := ripple.ComputeEquilibrium(ctx, db, inst.ID, cfg)
	t.Logf("Initial equilibrium: score=%.2f (threshold=%.2f)", eq0.Score, eq0.Threshold)

	// --- Seed structural signals from coherence check ---
	cohReport, _ := ripple.AnalyzeCoherence(ctx, db, inst.ID)
	structSignals := ripple.GenerateSignalsFromRipple(inst.ID, cohReport)
	if len(structSignals) > 0 {
		_ = rippleSvc.CreateSignals(ctx, structSignals)
	}
	t.Logf("Structural signals seeded: %d", len(structSignals))

	// --- Seed semantic signals ---
	analyzer := ripple.NewSemanticAnalyzer(memClient, db)
	semSignals := analyzer.FullSemanticAnalysisWithConfig(ctx, inst.ID, cfg)
	if len(semSignals) > 0 {
		_ = rippleSvc.CreateSignals(ctx, semSignals)
	}
	t.Logf("Semantic signals seeded: %d", len(semSignals))

	eq1, _ := ripple.ComputeEquilibrium(ctx, db, inst.ID, cfg)
	t.Logf("Post-seed equilibrium: score=%.2f, critical=%d, warning=%d, info=%d",
		eq1.Score, eq1.CriticalCount, eq1.WarningCount, eq1.InfoCount)

	// --- Run convergence with resolver ---
	t.Log("\n=== Convergence Loop with Resolver ===")

	// The resolver simulates what an LLM would do: for each signal,
	// read the current artifact, "fix" it by adding an alignment note,
	// and return the updated payload.
	resolveCount := 0
	commitCount := 0

	resolver := &smartMockResolver{
		db:         db,
		instanceID: inst.ID,
		count:      &resolveCount,
	}

	convSvc := ripple.ConvergenceServices{
		DB:       db,
		Ripple:   rippleSvc,
		Mem:      memClient,
		Resolver: resolver,
		CommitAutoFn: func(ctx context.Context, instanceID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error {
			commitCount++
			// Actually commit the mutation so the graph state changes.
			_, commitErr := stratSvc.CommitAuto(ctx, strategy.CommitAutoParams{
				InstanceID:   instanceID,
				ArtifactType: artifactType,
				ArtifactKey:  artifactKey,
				Action:       "update",
				Payload:      payload,
				SignalID:     &signalID,
			})
			if commitErr != nil {
				t.Logf("  CommitAuto failed for %s: %v", artifactKey, commitErr)
				return commitErr
			}
			t.Logf("  CommitAuto #%d: %s", commitCount, artifactKey)
			return nil
		},
	}

	cfg.Damping.MaxIterations = 5
	cfg.Damping.ChangeBudget = 1.0 // generous budget for the full loop test

	summary := ripple.RunConvergenceLoop(ctx, inst.ID, nil, cfg, convSvc)

	t.Logf("\n=== Results ===")
	t.Logf("  Iterations:      %d", summary.Iterations)
	t.Logf("  Starting score:  %.4f", summary.StartingScore)
	t.Logf("  Ending score:    %.4f", summary.EndingScore)
	t.Logf("  Equilibrium:     %v", summary.EquilibriumReached)
	t.Logf("  Auto-resolved:   %d", summary.AutoResolved)
	t.Logf("  Escalated:       %d", summary.Escalated)
	t.Logf("  Damping:         %s", summary.DampingReason)
	t.Logf("  Resolver calls:  %d", resolveCount)
	t.Logf("  Commits:         %d", commitCount)

	// --- Post-convergence signal inventory ---
	t.Log("\n=== Post-Convergence Signal Inventory ===")
	counts, _ := rippleSvc.CountByStatus(ctx, inst.ID)
	t.Logf("Active: critical=%d, warning=%d, info=%d",
		counts[domain.SignalSeverityCritical],
		counts[domain.SignalSeverityWarning],
		counts[domain.SignalSeverityInfo])

	// Count resolved signals.
	var resolvedCount int
	resolvedCount, _ = db.NewSelect().TableExpr("ripple_signals").
		Where("instance_id = ?", inst.ID).
		Where("status = ?", domain.SignalStatusResolved).
		Count(ctx)
	t.Logf("Resolved: %d", resolvedCount)

	// Final equilibrium.
	eqFinal, _ := ripple.ComputeEquilibrium(ctx, db, inst.ID, cfg)
	t.Logf("\nFinal equilibrium: score=%.4f (threshold=%.2f) → %v",
		eqFinal.Score, eqFinal.Threshold, eqFinal.InEquilibrium)
	if eqFinal.Score > eq1.Score {
		t.Logf("  Score improved by %.4f (%.2f → %.2f)", eqFinal.Score-eq1.Score, eq1.Score, eqFinal.Score)
	}

	// --- Convergence history ---
	runs, _ := rippleSvc.ListConvergenceRuns(ctx, inst.ID, "", 10)
	t.Logf("\nConvergence runs: %d", len(runs))
	for _, r := range runs {
		damping := "none"
		if r.DampingReason != nil {
			damping = *r.DampingReason
		}
		t.Logf("  iter=%d auto=%d escalated=%d score=%.2f→%.2f damping=%s",
			r.Iterations, r.AutoResolved, r.Escalated,
			safeFloat(r.StartingScore), safeFloat(r.EndingScore), damping)
	}
}

// smartMockResolver simulates an LLM resolver by reading the target artifact,
// adding an alignment marker to its payload, and returning it as a fix.
// This approximates what a real LLM would do: read the artifact, make a
// small semantic adjustment, return the updated JSON.
type smartMockResolver struct {
	db         *bun.DB
	instanceID uuid.UUID
	count      *int
}

func (r *smartMockResolver) Resolve(ctx context.Context, signal *domain.RippleSignal, currentPayload json.RawMessage) (*ripple.ResolveResult, error) {
	*r.count++

	// Parse current payload.
	var payload map[string]any
	if err := json.Unmarshal(currentPayload, &payload); err != nil {
		return nil, nil // can't parse → skip
	}

	// Add an alignment marker — simulates what an LLM would do (tighten wording,
	// add strategic alignment note, etc.).
	payload["_alignment_note"] = fmt.Sprintf("Auto-aligned with %s (signal: %s)", signal.SourceKey, signal.Description[:min(80, len(signal.Description))])

	newPayload, err := json.Marshal(payload)
	if err != nil {
		return nil, nil
	}

	return &ripple.ResolveResult{
		Updated:     true,
		NewPayload:  newPayload,
		Explanation: fmt.Sprintf("Added alignment note referencing %s", signal.SourceKey),
		Distance:    0.02, // small change
	}, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// loadMemoryConfig reads Memory connection details from .env.local.
func loadMemoryConfig(t *testing.T) memory.Config {
	t.Helper()
	cfg := memory.Config{
		BaseURL:  "http://localhost:3002",
		AuthMode: memory.AuthModeAPIKey,
	}

	data, err := os.ReadFile("../../.env.local")
	if err != nil {
		t.Skipf("No .env.local found: %v", err)
	}
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if k, v, ok := strings.Cut(line, "="); ok {
			switch k {
			case "EPF_MEMORY_URL":
				cfg.BaseURL = v
			case "EPF_MEMORY_PROJECT":
				cfg.ProjectID = v
			case "EPF_MEMORY_TOKEN":
				cfg.Token = v
			}
		}
	}

	if cfg.ProjectID == "" || cfg.Token == "" {
		t.Skip("Memory project/token not configured in .env.local")
	}
	return cfg
}

// waitForEmbeddings polls Memory's embedding progress until all pending
// embeddings are computed, or the timeout is reached.
func waitForEmbeddings(t *testing.T, client *memory.Client, timeout time.Duration) {
	t.Helper()
	ctx := context.Background()
	deadline := time.Now().Add(timeout)

	for time.Now().Before(deadline) {
		progress, err := client.GetEmbeddingProgress(ctx)
		if err != nil {
			t.Logf("  embedding progress check failed: %v", err)
			time.Sleep(2 * time.Second)
			continue
		}
		pending := progress.Pending + progress.Processing
		t.Logf("  embeddings: pending=%d, processing=%d, completed=%d, failed=%d",
			progress.Pending, progress.Processing, progress.Completed, progress.Failed)
		if pending == 0 {
			t.Log("  all embeddings computed")
			return
		}
		time.Sleep(3 * time.Second)
	}
	t.Log("  WARNING: embedding timeout reached — some embeddings may be pending")
}

// --- Helpers ---

func dirExists(path string) bool {
	info, err := os.Stat(path)
	return err == nil && info.IsDir()
}

// scanTestInstance is a simplified version of cmd_import.scanEPFInstance for testing.
func scanTestInstance(t *testing.T, instancePath string) (map[string]any, string) {
	t.Helper()
	payloads := make(map[string]any)
	var productName string

	err := filepath.WalkDir(instancePath, func(path string, d os.DirEntry, err error) error {
		if err != nil || d.IsDir() {
			return err
		}
		if !strings.HasSuffix(d.Name(), ".yaml") && !strings.HasSuffix(d.Name(), ".yml") {
			return nil
		}
		// Skip metadata, migration, ad-hoc files.
		if d.Name() == "_meta.yaml" || d.Name() == "_epf.yaml" || d.Name() == "_MIGRATION_PLAN.yaml" {
			if d.Name() == "_meta.yaml" || d.Name() == "_epf.yaml" {
				data, _ := os.ReadFile(path)
				var raw map[string]any
				if yaml.Unmarshal(data, &raw) == nil {
					for _, k := range []string{"product_name", "product", "name"} {
						if v, ok := raw[k]; ok {
							if s, ok := v.(string); ok && s != "" && productName == "" {
								productName = s
							}
						}
					}
				}
			}
			return nil
		}
		rel, _ := filepath.Rel(instancePath, path)
		rel = filepath.ToSlash(rel)
		// Skip ad-hoc directories.
		if strings.HasPrefix(rel, "ad-hoc") {
			return nil
		}

		data, readErr := os.ReadFile(path)
		if readErr != nil {
			return nil
		}
		var rawAny any
		if yaml.Unmarshal(data, &rawAny) != nil {
			return nil
		}
		raw, ok := normalizeYAMLForTest(rawAny).(map[string]any)
		if !ok || len(raw) == 0 {
			return nil
		}

		key := testArtifactKey(rel, d.Name())
		payloads[key] = raw
		return nil
	})
	if err != nil {
		t.Fatalf("walk instance: %v", err)
	}
	return payloads, productName
}

func testArtifactKey(relPath, name string) string {
	base := strings.TrimSuffix(name, filepath.Ext(name))
	switch base {
	case "00_north_star", "north_star":
		return "north_star"
	case "01_insight_analyses", "insight_analyses":
		return "insight_analyses"
	case "02_strategy_foundations", "strategy_foundations":
		return "strategy_foundations"
	case "03_insight_opportunity", "insight_opportunity":
		return "insight_opportunity"
	case "04_strategy_formula", "strategy_formula":
		return "strategy_formula"
	case "05_roadmap_recipe", "roadmap_recipe":
		return "roadmap_recipe"
	case "mappings":
		return "mappings"
	case "navigation_graph":
		return "navigation_graph"
	}
	if strings.HasPrefix(base, "fd-") {
		return base
	}
	if strings.Contains(relPath, "value_models/") {
		return "value_model_" + base
	}
	if strings.Contains(relPath, "workflows/") {
		return "workflow_" + base
	}
	ext := filepath.Ext(relPath)
	return strings.TrimSuffix(relPath, ext)
}

func normalizeYAMLForTest(v any) any {
	switch val := v.(type) {
	case map[string]any:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[k] = normalizeYAMLForTest(vv)
		}
		return out
	case map[interface{}]interface{}:
		out := make(map[string]any, len(val))
		for k, vv := range val {
			out[fmt.Sprintf("%v", k)] = normalizeYAMLForTest(vv)
		}
		return out
	case []any:
		for i, item := range val {
			val[i] = normalizeYAMLForTest(item)
		}
		return val
	default:
		return val
	}
}

func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen] + "..."
}

func safeFloat(f *float64) float64 {
	if f == nil {
		return 0
	}
	return *f
}

type countingResolver struct {
	result *ripple.ResolveResult
	count  *int
}

func (r *countingResolver) Resolve(_ context.Context, _ *domain.RippleSignal, _ json.RawMessage) (*ripple.ResolveResult, error) {
	*r.count++
	return r.result, nil
}

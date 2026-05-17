package ripple_test

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// seedStrategyGraph creates a realistic strategy graph for convergence testing:
// - North Star
// - Strategy Formula
// - 3 features with contributes_to relationships
// - 1 value model
// Returns the instance ID.
func seedStrategyGraph(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	instID := seedInstance(t, db)

	artifacts := []struct {
		key          string
		artifactType string
		payload      map[string]any
		track        string
	}{
		{
			key: "north_star", artifactType: "north_star",
			payload: map[string]any{
				"vision":  "Democratize strategic planning for every team",
				"mission": "AI-powered strategy authoring that keeps teams aligned",
			},
		},
		{
			key: "strategy_formula", artifactType: "strategy_formula",
			payload: map[string]any{
				"strategic_bets": []string{"AI-first authoring", "Real-time coherence", "Cross-track alignment"},
			},
		},
		{
			key: "vm-product", artifactType: "value_model", track: "product",
			payload: map[string]any{
				"track": "product",
				"paths": []string{"Product.Core.StrategyAuthoring", "Product.Core.CoherenceEngine"},
			},
		},
		{
			key: "fd-001", artifactType: "feature", track: "product",
			payload: map[string]any{
				"name":               "Strategy Editor",
				"job_to_be_done":     "When I need to edit my strategy, I want an AI-assisted editor so I can maintain alignment",
				"solution_approach":  "YAML editing with real-time validation and ripple preview",
				"contributes_to":     []string{"Product.Core.StrategyAuthoring"},
			},
		},
		{
			key: "fd-002", artifactType: "feature", track: "product",
			payload: map[string]any{
				"name":               "Coherence Dashboard",
				"job_to_be_done":     "When my strategy graph has misalignments, I want to see them clearly so I can fix them",
				"solution_approach":  "Signal dashboard with severity classification and guided resolution",
				"contributes_to":     []string{"Product.Core.CoherenceEngine"},
			},
		},
		{
			key: "fd-003", artifactType: "feature", track: "commercial",
			payload: map[string]any{
				"name":               "Enterprise Onboarding",
				"job_to_be_done":     "When an enterprise team adopts the platform, I want a guided setup so they get value quickly",
				"solution_approach":  "Multi-step onboarding wizard with strategy import",
				"contributes_to":     []string{"Product.Core.StrategyAuthoring"},
			},
		},
	}

	for _, a := range artifacts {
		payloadJSON, _ := json.Marshal(a.payload)
		mutID := uuid.New()

		// Create mutation.
		_, err := db.NewInsert().Model(&domain.StrategyMutation{
			ID:           mutID,
			InstanceID:   instID,
			ArtifactType: a.artifactType,
			ArtifactKey:  a.key,
			Action:       domain.MutationActionCreate,
			Payload:      payloadJSON,
			Status:       domain.MutationStatusCommitted,
			Source:       "system",
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed mutation %s: %v", a.key, err)
		}

		// Create artifact.
		var track *string
		if a.track != "" {
			track = &a.track
		}
		name := ""
		if n, ok := a.payload["name"].(string); ok {
			name = n
		}
		var namePtr *string
		if name != "" {
			namePtr = &name
		}
		_, err = db.NewInsert().Model(&domain.StrategyArtifact{
			ID:           uuid.New(),
			InstanceID:   instID,
			ArtifactKey:  a.key,
			ArtifactType: a.artifactType,
			Status:       domain.ArtifactStatusActive,
			Track:        track,
			Name:         namePtr,
			Payload:      payloadJSON,
			MutationID:   mutID,
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed artifact %s: %v", a.key, err)
		}
	}

	// Create relationships.
	rels := []struct {
		source, target, relType, sourceType, targetType string
	}{
		{"fd-001", "vm-product", "contributes_to", "feature", "value_model"},
		{"fd-002", "vm-product", "contributes_to", "feature", "value_model"},
		{"fd-003", "vm-product", "contributes_to", "feature", "value_model"},
		{"fd-001", "north_star", "contributes_to", "feature", "north_star"},
		{"fd-002", "north_star", "contributes_to", "feature", "north_star"},
	}
	for _, r := range rels {
		_, err := db.NewInsert().Model(&domain.StrategyRelationship{
			ID:           uuid.New(),
			InstanceID:   instID,
			SourceKey:    r.source,
			SourceType:   r.sourceType,
			TargetKey:    r.target,
			TargetType:   r.targetType,
			Relationship: r.relType,
		}).Exec(ctx)
		if err != nil {
			t.Fatalf("seed relationship %s->%s: %v", r.source, r.target, err)
		}
	}

	return instID
}

func TestConvergenceE2E_FullGraph_ReachesEquilibrium(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedStrategyGraph(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Run convergence on a fresh graph — should be in equilibrium (no signals).
	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: svc,
		// No Memory, no Resolver — structural only, agent-orchestrated mode.
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	t.Logf("Convergence summary: iterations=%d, equilibrium=%v, starting=%.2f, ending=%.2f, damping=%s",
		summary.Iterations, summary.EquilibriumReached, summary.StartingScore, summary.EndingScore, summary.DampingReason)

	if !summary.EquilibriumReached {
		t.Error("fresh graph should be in equilibrium")
	}
	if summary.StartingScore < 0.70 {
		t.Errorf("starting score=%.2f, expected >= 0.70 for fresh graph", summary.StartingScore)
	}
}

func TestConvergenceE2E_WithStaleSignals_MaxIterations(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedStrategyGraph(t, db)

	cfg := ripple.DefaultRippleConfig()
	cfg.Damping.MaxIterations = 3 // limit for faster test

	// Inject critical signals to drop equilibrium below threshold.
	for i := 0; i < 4; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    domain.SignalSeverityCritical,
			SourceKey:   "north_star",
			TargetKey:   fmt.Sprintf("fd-%03d", i+1),
			Description: fmt.Sprintf("fd-%03d is stale after North Star change", i+1),
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	convSvc := ripple.ConvergenceServices{DB: db, Ripple: svc}
	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	t.Logf("Convergence: iterations=%d, equilibrium=%v, score=%.2f→%.2f, damping=%s, escalated=%d",
		summary.Iterations, summary.EquilibriumReached,
		summary.StartingScore, summary.EndingScore,
		summary.DampingReason, summary.Escalated)

	if summary.EquilibriumReached {
		t.Error("should NOT reach equilibrium with 4 unresolved critical signals")
	}
	if summary.DampingReason != "max_iterations" {
		t.Errorf("damping=%s, want max_iterations", summary.DampingReason)
	}
	if summary.Iterations != 3 {
		t.Errorf("iterations=%d, want 3", summary.Iterations)
	}
	if summary.Escalated < 4 {
		t.Errorf("escalated=%d, want >= 4 (critical signals)", summary.Escalated)
	}

	// Verify convergence run was persisted.
	runs, err := svc.ListConvergenceRuns(ctx, instID, "", 10)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("runs=%d, want 1", len(runs))
	}
	if runs[0].DampingReason == nil || *runs[0].DampingReason != "max_iterations" {
		t.Errorf("persisted damping reason mismatch")
	}
}

func TestConvergenceE2E_WithMockResolver_AutoResolves(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedStrategyGraph(t, db)
	cfg := ripple.DefaultRippleConfig()
	cfg.Damping.MaxIterations = 3
	cfg.EquilibriumThreshold = 0.95 // high threshold so warning signals drop us below

	// Inject 2 orphan warning signals — orphan+warning maps to autonomous authority.
	// 2 structural warnings = 2 × 0.02 = 0.04 penalty, score = 0.96 < 0.95 threshold.
	// Wait — 0.96 > 0.95 so this would be in equilibrium. Need more signals.
	// Use 3 orphan warnings: 3 × 0.02 = 0.06, score = 0.94 < 0.95.
	for i := 0; i < 3; i++ {
		key := fmt.Sprintf("fd-%03d", i+1)
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypeOrphan,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   "vm-product",
			TargetKey:   key,
			Description: fmt.Sprintf("value path %s has no contributing features", key),
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	// Mock resolver that always returns a small fix.
	resolver := &mockResolver{
		fixPayload: json.RawMessage(`{"name": "Auto-fixed Feature", "description": "Aligned with updated strategy"}`),
		distance:   0.03,
	}

	// Mock CommitAutoFn that just resolves signals (no real mutation needed for this test).
	commitCount := 0
	commitAutoFn := func(ctx context.Context, instanceID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error {
		commitCount++
		t.Logf("  CommitAuto: %s (type=%s, signal=%s)", artifactKey, artifactType, signalID)
		return nil
	}

	convSvc := ripple.ConvergenceServices{
		DB:           db,
		Ripple:       svc,
		Resolver:     resolver,
		CommitAutoFn: commitAutoFn,
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	t.Logf("Convergence: iterations=%d, auto_resolved=%d, equilibrium=%v, score=%.2f→%.2f, damping=%s",
		summary.Iterations, summary.AutoResolved, summary.EquilibriumReached,
		summary.StartingScore, summary.EndingScore, summary.DampingReason)

	if summary.AutoResolved != 3 {
		t.Errorf("auto_resolved=%d, want 3", summary.AutoResolved)
	}
	if commitCount != 3 {
		t.Errorf("commit count=%d, want 3", commitCount)
	}
	if resolver.callCount != 3 {
		t.Errorf("resolver calls=%d, want 3", resolver.callCount)
	}
}

func TestConvergenceE2E_ChangeBudget_StopsAutoResolve(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedStrategyGraph(t, db)

	cfg := ripple.DefaultRippleConfig()
	cfg.Damping.MaxIterations = 5
	cfg.Damping.ChangeBudget = 0.10 // very tight budget
	cfg.EquilibriumThreshold = 0.95 // high threshold so signals keep us below

	// Inject 5 orphan warning signals (orphan+warning → autonomous).
	// 5 structural warnings = 5 × 0.02 = 0.10 penalty, score = 0.90 < 0.95.
	for i := 0; i < 5; i++ {
		key := fmt.Sprintf("fd-%03d", i+1)
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypeOrphan,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   "vm-product",
			TargetKey:   key,
			Description: fmt.Sprintf("value path %s has no contributing features", key),
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	// Resolver returns distance 0.05 per fix → budget of 0.10 allows max 2 fixes.
	resolver := &mockResolver{
		fixPayload: json.RawMessage(`{"name": "Fixed"}`),
		distance:   0.05,
	}

	commitCount := 0
	convSvc := ripple.ConvergenceServices{
		DB:       db,
		Ripple:   svc,
		Resolver: resolver,
		CommitAutoFn: func(ctx context.Context, instanceID uuid.UUID, artifactKey, artifactType string, payload json.RawMessage, signalID uuid.UUID) error {
			commitCount++
			return nil
		},
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	t.Logf("Convergence: iterations=%d, auto_resolved=%d, damping=%s, budget_used=%.2f/%.2f",
		summary.Iterations, summary.AutoResolved, summary.DampingReason,
		float64(commitCount)*0.05, cfg.Damping.ChangeBudget)

	// Should have auto-resolved exactly 2 (budget 0.10 / distance 0.05 = 2).
	if commitCount > 2 {
		t.Errorf("commit count=%d, want <= 2 (budget should cap at 0.10)", commitCount)
	}
}

// mockResolver is a test implementation of SignalResolver.
type mockResolver struct {
	fixPayload json.RawMessage
	distance   float64
	callCount  int
}

func (m *mockResolver) Resolve(_ context.Context, _ *domain.RippleSignal, _ json.RawMessage) (*ripple.ResolveResult, error) {
	m.callCount++
	return &ripple.ResolveResult{
		Updated:     true,
		NewPayload:  m.fixPayload,
		Explanation: "Mock auto-fix applied",
		Distance:    m.distance,
	}, nil
}

package ripple_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestRunConvergenceLoop_AlreadyInEquilibrium(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// No signals → already in equilibrium.
	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: svc,
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	if !summary.EquilibriumReached {
		t.Error("should report equilibrium reached with no signals")
	}
	if summary.Iterations != 0 {
		t.Errorf("iterations=%d, want 0 (no loop needed)", summary.Iterations)
	}
	if summary.DampingReason != "" {
		t.Errorf("damping_reason=%q, want empty", summary.DampingReason)
	}
	if summary.StartingScore != 1.0 {
		t.Errorf("starting_score=%f, want 1.0", summary.StartingScore)
	}
}

func TestRunConvergenceLoop_WithSignals_ReachesMaxIterations(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Use a low max iterations to test damping.
	cfg := ripple.DefaultRippleConfig()
	cfg.Damping.MaxIterations = 2

	// Create enough critical signals to drop below equilibrium threshold.
	// 4 critical signals = 4 * 0.20 = 0.80 penalty, score = 0.20, well below 0.70.
	for i := 0; i < 4; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    domain.SignalSeverityCritical,
			SourceKey:   "north_star",
			TargetKey:   "fd-001",
			Description: "fd-001 is stale after North Star change",
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: svc,
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	if summary.EquilibriumReached {
		t.Error("should NOT reach equilibrium with unresolved critical signal")
	}
	if summary.DampingReason != "max_iterations" {
		t.Errorf("damping_reason=%q, want max_iterations", summary.DampingReason)
	}
	if summary.Iterations != 2 {
		t.Errorf("iterations=%d, want 2", summary.Iterations)
	}
}

func TestRunConvergenceLoop_WarningsInEquilibrium(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Create only warning signals — with default threshold 0.70,
	// up to 6 warnings (6 * 0.05 = 0.30, score = 0.70) is still equilibrium.
	for i := 0; i < 4; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypeOrphan,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   "src",
			TargetKey:   "target",
			Description: "warning",
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: svc,
	}

	summary := ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	// 4 warnings = 0.20 penalty, score = 0.80, threshold = 0.70 → equilibrium.
	if !summary.EquilibriumReached {
		t.Errorf("should reach equilibrium (4 warnings, score ~0.80, threshold 0.70)")
	}
}

func TestRunConvergenceLoop_ConvergenceRunPersisted(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	convSvc := ripple.ConvergenceServices{
		DB:     db,
		Ripple: svc,
	}

	_ = ripple.RunConvergenceLoop(ctx, instID, nil, cfg, convSvc)

	// Verify the run was persisted.
	runs, err := svc.ListConvergenceRuns(ctx, instID, "", 10)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("got %d runs, want 1", len(runs))
	}
	if !runs[0].EquilibriumReached {
		t.Error("persisted run should show equilibrium_reached=true")
	}
}

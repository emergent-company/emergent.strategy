package ripple_test

import (
	"context"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

func TestComputeEquilibrium_NoSignals(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	report, err := ripple.ComputeEquilibrium(ctx, db, instID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	if report.Score != 1.0 {
		t.Errorf("score=%f, want 1.0 (no signals)", report.Score)
	}
	if !report.InEquilibrium {
		t.Error("should be in equilibrium with no signals")
	}
}

func TestComputeEquilibrium_CriticalSignals(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Create 5 critical propagation signals → penalty = 5 * 0.15 = 0.75 → score = 0.25.
	for i := 0; i < 5; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    domain.SignalSeverityCritical,
			SourceKey:   "src",
			TargetKey:   "target",
			Description: "test",
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	report, err := ripple.ComputeEquilibrium(ctx, db, instID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	if report.Score != 0.25 {
		t.Errorf("score=%f, want 0.25 (5 critical propagation × 0.15 = 0.75 penalty)", report.Score)
	}
	if report.InEquilibrium {
		t.Error("should NOT be in equilibrium with 5 critical signals")
	}
	if report.CriticalCount != 5 {
		t.Errorf("critical count=%d, want 5", report.CriticalCount)
	}
}

func TestComputeEquilibrium_WarningSignals(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Create 4 warning orphan signals → penalty = 4 * 0.02 = 0.08 → score = 0.92.
	// Orphan warnings are structural (low weight) — normal WIP state.
	for i := 0; i < 4; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypeOrphan,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   "src",
			TargetKey:   "target",
			Description: "test",
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	report, err := ripple.ComputeEquilibrium(ctx, db, instID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	if report.Score != 0.92 {
		t.Errorf("score=%f, want 0.92 (4 orphan warnings × 0.02 = 0.08 penalty)", report.Score)
	}
	if !report.InEquilibrium {
		t.Error("should be in equilibrium (0.92 >= 0.70 threshold)")
	}
}

func TestComputeEquilibrium_DismissedExcluded(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Create a critical signal then dismiss it.
	sig := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypePropagation,
		Severity:    domain.SignalSeverityCritical,
		SourceKey:   "src",
		TargetKey:   "target",
		Description: "test",
	}
	if err := svc.CreateSignal(ctx, sig); err != nil {
		t.Fatalf("create signal: %v", err)
	}
	if _, err := svc.DismissSignal(ctx, sig.ID, "intentional"); err != nil {
		t.Fatalf("dismiss signal: %v", err)
	}

	report, err := ripple.ComputeEquilibrium(ctx, db, instID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	if report.Score != 1.0 {
		t.Errorf("score=%f, want 1.0 (dismissed signals excluded)", report.Score)
	}
	if report.DismissedCount != 1 {
		t.Errorf("dismissed count=%d, want 1", report.DismissedCount)
	}
}

func TestComputeEquilibrium_InfoSignalsNoPenalty(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)
	cfg := ripple.DefaultRippleConfig()

	// Create 10 info signals → penalty = 0 → score = 1.0.
	for i := 0; i < 10; i++ {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypeClustering,
			Severity:    domain.SignalSeverityInfo,
			SourceKey:   "src",
			TargetKey:   "target",
			Description: "test",
		}); err != nil {
			t.Fatalf("create signal: %v", err)
		}
	}

	report, err := ripple.ComputeEquilibrium(ctx, db, instID, cfg)
	if err != nil {
		t.Fatalf("compute equilibrium: %v", err)
	}
	if report.Score != 1.0 {
		t.Errorf("score=%f, want 1.0 (info signals have zero penalty)", report.Score)
	}
	if !report.InEquilibrium {
		t.Error("should be in equilibrium (info signals don't affect score)")
	}
	if report.InfoCount != 10 {
		t.Errorf("info count=%d, want 10", report.InfoCount)
	}
}

func TestConfigGetAndUpdate(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Get config — should return defaults.
	cfg, err := svc.GetConfig(ctx, instID)
	if err != nil {
		t.Fatalf("get config: %v", err)
	}
	if cfg.EquilibriumThreshold != 0.70 {
		t.Errorf("default threshold=%f, want 0.70", cfg.EquilibriumThreshold)
	}

	// Update config.
	cfg.EquilibriumThreshold = 0.85
	if err := svc.UpdateConfig(ctx, instID, cfg); err != nil {
		t.Fatalf("update config: %v", err)
	}

	// Read back.
	cfg2, err := svc.GetConfig(ctx, instID)
	if err != nil {
		t.Fatalf("get config after update: %v", err)
	}
	if cfg2.EquilibriumThreshold != 0.85 {
		t.Errorf("updated threshold=%f, want 0.85", cfg2.EquilibriumThreshold)
	}

	// Update again — should upsert.
	cfg2.Damping.MaxIterations = 10
	if err := svc.UpdateConfig(ctx, instID, cfg2); err != nil {
		t.Fatalf("second update: %v", err)
	}
	cfg3, err := svc.GetConfig(ctx, instID)
	if err != nil {
		t.Fatalf("get config after second update: %v", err)
	}
	if cfg3.Damping.MaxIterations != 10 {
		t.Errorf("max iterations=%d, want 10", cfg3.Damping.MaxIterations)
	}
	if cfg3.EquilibriumThreshold != 0.85 {
		t.Errorf("threshold should be preserved=%f, want 0.85", cfg3.EquilibriumThreshold)
	}
}

func TestConvergenceRunSaveAndList(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	score := 0.85
	run := &domain.ConvergenceRun{
		InstanceID:         instID,
		Iterations:         3,
		AutoResolved:       2,
		Escalated:          1,
		StartingScore:      &score,
		EndingScore:        &score,
		EquilibriumReached: true,
	}
	if err := svc.SaveConvergenceRun(ctx, run); err != nil {
		t.Fatalf("save: %v", err)
	}

	runs, err := svc.ListConvergenceRuns(ctx, instID, "", 10)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("got %d runs, want 1", len(runs))
	}
	if runs[0].Iterations != 3 {
		t.Errorf("iterations=%d, want 3", runs[0].Iterations)
	}
	if !runs[0].EquilibriumReached {
		t.Error("should have equilibrium_reached=true")
	}
}

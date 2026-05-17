package ripple_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/ripple"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// helper creates a workspace + instance and returns the instance ID.
func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	wsID := uuid.New()
	_, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-" + wsID.String()[:8],
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "test-instance",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

func TestCreateAndListSignals(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Create two signals.
	sig1 := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypePropagation,
		Severity:    domain.SignalSeverityCritical,
		SourceKey:   "north_star",
		TargetKey:   "fd-001",
		Description: "fd-001 is stale after North Star change",
	}
	sig2 := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypeOrphan,
		Severity:    domain.SignalSeverityWarning,
		SourceKey:   "vm-product",
		TargetKey:   "vm-product/analytics",
		Description: "Value path has no contributing features",
	}
	if err := svc.CreateSignal(ctx, sig1); err != nil {
		t.Fatalf("create sig1: %v", err)
	}
	if err := svc.CreateSignal(ctx, sig2); err != nil {
		t.Fatalf("create sig2: %v", err)
	}

	// List all active signals — should get both, critical first.
	sigs, err := svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(sigs) != 2 {
		t.Fatalf("got %d signals, want 2", len(sigs))
	}
	if sigs[0].Severity != domain.SignalSeverityCritical {
		t.Errorf("first signal severity=%s, want critical", sigs[0].Severity)
	}

	// Filter by severity.
	sigs, err = svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID, Severity: domain.SignalSeverityWarning})
	if err != nil {
		t.Fatalf("list warning: %v", err)
	}
	if len(sigs) != 1 {
		t.Fatalf("got %d warning signals, want 1", len(sigs))
	}

	// Filter by type.
	sigs, err = svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID, SignalType: domain.SignalTypeOrphan})
	if err != nil {
		t.Fatalf("list orphan: %v", err)
	}
	if len(sigs) != 1 {
		t.Fatalf("got %d orphan signals, want 1", len(sigs))
	}
}

func TestAcknowledgeSignal(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	sig := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypePropagation,
		Severity:    domain.SignalSeverityWarning,
		SourceKey:   "north_star",
		TargetKey:   "fd-001",
		Description: "test signal",
	}
	if err := svc.CreateSignal(ctx, sig); err != nil {
		t.Fatalf("create: %v", err)
	}

	acked, err := svc.AcknowledgeSignal(ctx, sig.ID)
	if err != nil {
		t.Fatalf("acknowledge: %v", err)
	}
	if acked.Status != domain.SignalStatusAcknowledged {
		t.Errorf("status=%s, want acknowledged", acked.Status)
	}

	// Acknowledged signals are still listed when filtering by 'all'.
	sigs, err := svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID, Status: "all"})
	if err != nil {
		t.Fatalf("list all: %v", err)
	}
	if len(sigs) != 1 {
		t.Fatalf("got %d, want 1", len(sigs))
	}

	// But not when filtering by active (default).
	sigs, err = svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID})
	if err != nil {
		t.Fatalf("list active: %v", err)
	}
	if len(sigs) != 0 {
		t.Fatalf("got %d active, want 0 (signal is acknowledged)", len(sigs))
	}
}

func TestResolveSignal(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	sig := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypePropagation,
		Severity:    domain.SignalSeverityCritical,
		SourceKey:   "north_star",
		TargetKey:   "fd-001",
		Description: "test signal",
	}
	if err := svc.CreateSignal(ctx, sig); err != nil {
		t.Fatalf("create: %v", err)
	}

	batchID := uuid.New()
	resolved, err := svc.ResolveSignal(ctx, sig.ID, &batchID)
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	if resolved.Status != domain.SignalStatusResolved {
		t.Errorf("status=%s, want resolved", resolved.Status)
	}
	if resolved.ResolvedAt == nil {
		t.Error("resolved_at should be set")
	}
	if resolved.BatchID == nil || *resolved.BatchID != batchID {
		t.Error("batch_id should match")
	}

	// Cannot resolve again.
	_, err = svc.ResolveSignal(ctx, sig.ID, nil)
	if err == nil {
		t.Error("expected error resolving already-resolved signal")
	}
}

func TestResolveByTarget(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Create 3 signals, 2 targeting fd-001.
	for _, target := range []string{"fd-001", "fd-001", "fd-002"} {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    domain.SignalSeverityWarning,
			SourceKey:   "north_star",
			TargetKey:   target,
			Description: "test",
		}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}

	batchID := uuid.New()
	n, err := svc.ResolveByTarget(ctx, instID, "fd-001", &batchID)
	if err != nil {
		t.Fatalf("resolve by target: %v", err)
	}
	if n != 2 {
		t.Errorf("resolved %d, want 2", n)
	}

	// fd-002 signal should still be active.
	sigs, err := svc.ListSignals(ctx, ripple.ListParams{InstanceID: instID})
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(sigs) != 1 {
		t.Fatalf("got %d active, want 1", len(sigs))
	}
	if sigs[0].TargetKey != "fd-002" {
		t.Errorf("remaining signal targets %s, want fd-002", sigs[0].TargetKey)
	}
}

func TestDismissSignal(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	sig := &domain.RippleSignal{
		InstanceID:  instID,
		SignalType:  domain.SignalTypeTension,
		Severity:    domain.SignalSeverityWarning,
		SourceKey:   "product-track",
		TargetKey:   "commercial-track",
		Description: "cross-track tension",
	}
	if err := svc.CreateSignal(ctx, sig); err != nil {
		t.Fatalf("create: %v", err)
	}

	dismissed, err := svc.DismissSignal(ctx, sig.ID, "intentional dual motion strategy")
	if err != nil {
		t.Fatalf("dismiss: %v", err)
	}
	if dismissed.Status != domain.SignalStatusDismissed {
		t.Errorf("status=%s, want dismissed", dismissed.Status)
	}
	if dismissed.ResolvedAt == nil {
		t.Error("resolved_at should be set for dismissed signals")
	}
}

func TestCountByStatus(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Create signals of different severities.
	severities := []string{domain.SignalSeverityCritical, domain.SignalSeverityCritical, domain.SignalSeverityWarning, domain.SignalSeverityInfo}
	for i, sev := range severities {
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    sev,
			SourceKey:   "src",
			TargetKey:   fmt.Sprintf("target-%d", i),
			Description: "test",
		}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}

	counts, err := svc.CountByStatus(ctx, instID)
	if err != nil {
		t.Fatalf("count: %v", err)
	}
	if counts[domain.SignalSeverityCritical] != 2 {
		t.Errorf("critical=%d, want 2", counts[domain.SignalSeverityCritical])
	}
	if counts[domain.SignalSeverityWarning] != 1 {
		t.Errorf("warning=%d, want 1", counts[domain.SignalSeverityWarning])
	}
	if counts[domain.SignalSeverityInfo] != 1 {
		t.Errorf("info=%d, want 1", counts[domain.SignalSeverityInfo])
	}
}

func TestTopCritical(t *testing.T) {
	db := database.TestDB(t)
	svc := ripple.NewService(db)
	ctx := context.Background()
	instID := seedInstance(t, db)

	// Create 5 signals: 2 critical, 3 warning.
	for i := 0; i < 5; i++ {
		sev := domain.SignalSeverityWarning
		if i < 2 {
			sev = domain.SignalSeverityCritical
		}
		if err := svc.CreateSignal(ctx, &domain.RippleSignal{
			InstanceID:  instID,
			SignalType:  domain.SignalTypePropagation,
			Severity:    sev,
			SourceKey:   "src",
			TargetKey:   fmt.Sprintf("target-%d", i),
			Description: "test",
		}); err != nil {
			t.Fatalf("create: %v", err)
		}
	}

	top, err := svc.TopCritical(ctx, instID, 3)
	if err != nil {
		t.Fatalf("top critical: %v", err)
	}
	if len(top) != 3 {
		t.Fatalf("got %d, want 3", len(top))
	}
	// First two should be critical.
	for i := 0; i < 2; i++ {
		if top[i].Severity != domain.SignalSeverityCritical {
			t.Errorf("top[%d].severity=%s, want critical", i, top[i].Severity)
		}
	}
}

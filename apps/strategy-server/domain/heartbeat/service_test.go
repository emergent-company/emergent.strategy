package heartbeat_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/uptrace/bun"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/heartbeat"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
)

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

func seedOrg(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	orgID := uuid.New()
	_, err := db.ExecContext(context.Background(),
		"INSERT INTO orgs (id, name, slug, created_at, updated_at) VALUES (?, ?, ?, NOW(), NOW())",
		orgID, "Test Org", "test-hb-"+orgID.String()[:8])
	if err != nil {
		t.Fatalf("seed org: %v", err)
	}
	return orgID
}

func seedInstance(t *testing.T, db *bun.DB) uuid.UUID {
	t.Helper()
	ctx := context.Background()
	orgID := seedOrg(t, db)

	wsID := uuid.New()
	_, err := db.NewInsert().Model(&domain.Workspace{
		ID:          wsID,
		GithubOwner: "test-hb-" + wsID.String()[:8],
		OrgID:       orgID,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed workspace: %v", err)
	}

	instID := uuid.New()
	_, err = db.NewInsert().Model(&domain.StrategyInstance{
		ID:          instID,
		WorkspaceID: wsID,
		Name:        "hb-test-instance",
		Status:      domain.InstanceStatusActive,
	}).Exec(ctx)
	if err != nil {
		t.Fatalf("seed instance: %v", err)
	}
	return instID
}

// mockEvaluator implements TriggerEvaluator with a configurable response.
type mockEvaluator struct {
	firedFor map[uuid.UUID]heartbeat.TriggerState
}

func (m *mockEvaluator) EvaluateTriggers(_ context.Context, id uuid.UUID) heartbeat.TriggerState {
	if s, ok := m.firedFor[id]; ok {
		return s
	}
	return heartbeat.TriggerState{}
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

// TestEvaluateAll_NoInstances verifies no panic and no results when DB is empty.
func TestEvaluateAll_NoInstances(t *testing.T) {
	db := database.TestDB(t)
	svc := heartbeat.NewService(db, &mockEvaluator{})
	results, err := svc.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results, got %d", len(results))
	}
}

// TestEvaluateAll_FiredTrigger verifies that a fired trigger creates a signal.
func TestEvaluateAll_FiredTrigger(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	instID := seedInstance(t, db)
	evaluator := &mockEvaluator{
		firedFor: map[uuid.UUID]heartbeat.TriggerState{
			instID: {
				Fired:         true,
				Reason:        "time",
				ReasonMessage: "No assessment exists yet",
			},
		},
	}

	svc := heartbeat.NewService(db, evaluator)
	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	if results[0].InstanceID != instID {
		t.Errorf("instance_id = %v, want %v", results[0].InstanceID, instID)
	}
	if results[0].Signal.Reason != "time" {
		t.Errorf("reason = %q, want %q", results[0].Signal.Reason, "time")
	}

	// Verify persisted to DB.
	sigs, err := svc.ListSignals(ctx, instID)
	if err != nil {
		t.Fatalf("ListSignals: %v", err)
	}
	if len(sigs) != 1 {
		t.Fatalf("expected 1 persisted signal, got %d", len(sigs))
	}
	if sigs[0].Message != "No assessment exists yet" {
		t.Errorf("message = %q, want %q", sigs[0].Message, "No assessment exists yet")
	}
}

// TestEvaluateAll_NoFiredTrigger verifies that a healthy instance produces no signal.
func TestEvaluateAll_NoFiredTrigger(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	instID := seedInstance(t, db)
	// evaluator returns Fired=false for all instances
	svc := heartbeat.NewService(db, &mockEvaluator{})

	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for healthy instance, got %d", len(results))
	}

	sigs, err := svc.ListSignals(ctx, instID)
	if err != nil {
		t.Fatalf("ListSignals: %v", err)
	}
	if len(sigs) != 0 {
		t.Errorf("expected 0 persisted signals, got %d", len(sigs))
	}
}

// TestEvaluateAll_Deduplication verifies that a second run does not create
// a duplicate signal when an unacknowledged one already exists.
func TestEvaluateAll_Deduplication(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	instID := seedInstance(t, db)
	evaluator := &mockEvaluator{
		firedFor: map[uuid.UUID]heartbeat.TriggerState{
			instID: {Fired: true, Reason: "time", ReasonMessage: "overdue"},
		},
	}
	svc := heartbeat.NewService(db, evaluator)

	// First run — should create 1 signal.
	_, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("first EvaluateAll: %v", err)
	}

	// Second run — should NOT create a duplicate.
	_, err = svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("second EvaluateAll: %v", err)
	}

	sigs, err := svc.ListSignals(ctx, instID)
	if err != nil {
		t.Fatalf("ListSignals: %v", err)
	}
	if len(sigs) != 1 {
		t.Errorf("expected exactly 1 signal after 2 runs (dedup), got %d", len(sigs))
	}
}

// TestAcknowledge verifies that acknowledging a signal removes it from the
// unacknowledged list and re-enables creation of a new signal.
func TestAcknowledge(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	instID := seedInstance(t, db)
	evaluator := &mockEvaluator{
		firedFor: map[uuid.UUID]heartbeat.TriggerState{
			instID: {Fired: true, Reason: "time", ReasonMessage: "overdue"},
		},
	}
	svc := heartbeat.NewService(db, evaluator)

	// Create initial signal.
	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 1 {
		t.Fatalf("expected 1 result, got %d", len(results))
	}
	sigID := results[0].Signal.ID

	// Acknowledge it.
	if err := svc.Acknowledge(ctx, sigID); err != nil {
		t.Fatalf("Acknowledge: %v", err)
	}

	// Should no longer be in unacknowledged list.
	sigs, err := svc.ListSignals(ctx, instID)
	if err != nil {
		t.Fatalf("ListSignals after ack: %v", err)
	}
	if len(sigs) != 0 {
		t.Errorf("expected 0 unacknowledged signals after ack, got %d", len(sigs))
	}

	// AllSignals should still show it (with acknowledged_at set).
	allSigs, err := svc.ListAllSignals(ctx, instID)
	if err != nil {
		t.Fatalf("ListAllSignals: %v", err)
	}
	if len(allSigs) != 1 {
		t.Fatalf("expected 1 total signal, got %d", len(allSigs))
	}
	if allSigs[0].AcknowledgedAt == nil {
		t.Error("acknowledged_at should be set after Acknowledge")
	}

	// After acknowledging, a new run should be able to create a fresh signal.
	results2, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("second EvaluateAll: %v", err)
	}
	if len(results2) != 1 {
		t.Errorf("expected 1 new signal after ack, got %d", len(results2))
	}
}

// TestAcknowledge_NotFound verifies the error sentinel for missing/already-acked signals.
func TestAcknowledge_NotFound(t *testing.T) {
	db := database.TestDB(t)
	svc := heartbeat.NewService(db, &mockEvaluator{})
	err := svc.Acknowledge(context.Background(), uuid.New())
	if err == nil {
		t.Fatal("expected error for non-existent signal ID")
	}
}

// TestEvaluateAll_ArchivedInstanceSkipped verifies archived instances are not evaluated.
func TestEvaluateAll_ArchivedInstanceSkipped(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	// Seed an archived instance.
	orgID := seedOrg(t, db)
	wsID := uuid.New()
	db.NewInsert().Model(&domain.Workspace{ //nolint:errcheck
		ID: wsID, GithubOwner: "archived-ws", OrgID: orgID,
	}).Exec(ctx)
	archivedInstID := uuid.New()
	db.NewInsert().Model(&domain.StrategyInstance{ //nolint:errcheck
		ID: archivedInstID, WorkspaceID: wsID, Name: "archived", Status: "archived",
	}).Exec(ctx)

	// Evaluator would fire for this instance.
	evaluator := &mockEvaluator{
		firedFor: map[uuid.UUID]heartbeat.TriggerState{
			archivedInstID: {Fired: true, Reason: "time", ReasonMessage: "overdue"},
		},
	}
	svc := heartbeat.NewService(db, evaluator)

	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 0 {
		t.Errorf("expected 0 results for archived instance, got %d", len(results))
	}
}

// TestEvaluateAll_MultipleInstances verifies that multiple instances are all evaluated.
func TestEvaluateAll_MultipleInstances(t *testing.T) {
	db := database.TestDB(t)
	ctx := context.Background()

	inst1 := seedInstance(t, db)
	inst2 := seedInstance(t, db)
	inst3 := seedInstance(t, db)

	// inst1 and inst3 fire, inst2 does not.
	evaluator := &mockEvaluator{
		firedFor: map[uuid.UUID]heartbeat.TriggerState{
			inst1: {Fired: true, Reason: "signals", ReasonMessage: "4 critical signals"},
			inst3: {Fired: true, Reason: "time", ReasonMessage: "overdue"},
		},
	}
	svc := heartbeat.NewService(db, evaluator)

	results, err := svc.EvaluateAll(ctx)
	if err != nil {
		t.Fatalf("EvaluateAll: %v", err)
	}
	if len(results) != 2 {
		t.Fatalf("expected 2 results, got %d", len(results))
	}

	// Verify no signal created for inst2.
	sigs2, err := svc.ListSignals(ctx, inst2)
	if err != nil {
		t.Fatalf("ListSignals inst2: %v", err)
	}
	if len(sigs2) != 0 {
		t.Errorf("expected 0 signals for inst2, got %d", len(sigs2))
	}
}

// TestRunTicker_StopsOnContextCancel verifies the ticker goroutine exits cleanly.
func TestRunTicker_StopsOnContextCancel(t *testing.T) {
	db := database.TestDB(t)
	svc := heartbeat.NewService(db, &mockEvaluator{})

	ctx, cancel := context.WithTimeout(context.Background(), 200*time.Millisecond)
	defer cancel()

	done := make(chan struct{})
	go func() {
		svc.RunTicker(ctx, 50*time.Millisecond)
		close(done)
	}()

	select {
	case <-done:
		// good — goroutine exited
	case <-time.After(2 * time.Second):
		t.Fatal("RunTicker did not stop within 2s after context cancellation")
	}
}

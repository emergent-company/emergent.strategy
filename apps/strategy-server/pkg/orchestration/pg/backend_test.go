package pg_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
	orchpg "github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration/pg"
)

// mockWorkflow is a minimal Workflow for testing the pg backend.
type mockWorkflow struct {
	name  string
	steps []orchestration.Step
}

func (w *mockWorkflow) Name() string                               { return w.name }
func (w *mockWorkflow) Steps() []orchestration.Step                { return w.steps }
func (w *mockWorkflow) ConcurrencyKey(r *orchestration.Run) string { return r.ConcurrencyKey }

func TestPgBackend_InsertAndGet(t *testing.T) {
	db := database.TestDB(t)

	cfg := orchpg.Config{Workers: 1}
	be := orchpg.NewBackend(db, cfg)

	ctx := context.Background()
	wf := &mockWorkflow{name: "test_wf"}
	registry := map[string]orchestration.Workflow{wf.name: wf}

	if err := be.Start(ctx, registry); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _ = be.Stop(ctx) }()

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "test_wf",
		ConcurrencyKey: "instance-001",
		Input:          map[string]any{"instance_id": "instance-001"},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}

	if err := be.Enqueue(ctx, run); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	got, err := be.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if got.ID != run.ID {
		t.Errorf("want ID %s, got %s", run.ID, got.ID)
	}
	if got.WorkflowName != run.WorkflowName {
		t.Errorf("want workflow %s, got %s", run.WorkflowName, got.WorkflowName)
	}
}

func TestPgBackend_ActiveRun(t *testing.T) {
	db := database.TestDB(t)

	cfg := orchpg.Config{Workers: 1}
	be := orchpg.NewBackend(db, cfg)

	ctx := context.Background()
	wf := &mockWorkflow{name: "active_wf"}
	registry := map[string]orchestration.Workflow{wf.name: wf}

	if err := be.Start(ctx, registry); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _ = be.Stop(ctx) }()

	// No run yet — should return nil.
	active, err := be.ActiveRun(ctx, "active_wf", "key-1")
	if err != nil {
		t.Fatalf("ActiveRun (empty): %v", err)
	}
	if active != nil {
		t.Fatal("expected nil active run before any enqueue")
	}

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "active_wf",
		ConcurrencyKey: "key-1",
		Input:          map[string]any{},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}
	if err := be.Enqueue(ctx, run); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}

	active, err = be.ActiveRun(ctx, "active_wf", "key-1")
	if err != nil {
		t.Fatalf("ActiveRun: %v", err)
	}
	if active == nil {
		t.Fatal("expected active run after enqueue")
	}
	if active.ID != run.ID {
		t.Errorf("want run ID %s, got %s", run.ID, active.ID)
	}
}

func TestPgBackend_ListRuns(t *testing.T) {
	db := database.TestDB(t)

	cfg := orchpg.Config{Workers: 1}
	be := orchpg.NewBackend(db, cfg)

	ctx := context.Background()
	wf := &mockWorkflow{name: "list_wf"}
	registry := map[string]orchestration.Workflow{wf.name: wf}

	if err := be.Start(ctx, registry); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _ = be.Stop(ctx) }()

	for i := 0; i < 3; i++ {
		r := &orchestration.Run{
			ID:             uuid.New(),
			WorkflowName:   "list_wf",
			ConcurrencyKey: "ck",
			Input:          map[string]any{},
			Status:         orchestration.StatusPending,
			Steps:          []orchestration.StepLog{},
		}
		if err := be.Enqueue(ctx, r); err != nil {
			t.Fatalf("Enqueue %d: %v", i, err)
		}
	}

	// Wait briefly for workers to pick up runs and potentially change their status,
	// then drain to avoid interference with the list test.
	time.Sleep(50 * time.Millisecond)

	runs, err := be.ListRuns(ctx, "list_wf", "ck")
	if err != nil {
		t.Fatalf("ListRuns: %v", err)
	}
	if len(runs) != 3 {
		t.Errorf("want 3 runs, got %d", len(runs))
	}
}

func TestPgBackend_MarkStaleFailed(t *testing.T) {
	db := database.TestDB(t)

	ctx := context.Background()
	wf := &mockWorkflow{name: "stale_wf"}

	// Insert a pending run using a backend that has not been started yet.
	// Workers are not running, so the run stays pending in the DB.
	be1 := orchpg.NewBackend(db, orchpg.Config{Workers: 4})
	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "stale_wf",
		ConcurrencyKey: "stale-key",
		Input:          map[string]any{},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}
	if err := be1.Enqueue(ctx, run); err != nil {
		t.Fatalf("Enqueue: %v", err)
	}
	// Stop be1 immediately — no workers were started so no processing happened.
	_ = be1.Stop(ctx)

	// Start a fresh backend simulating a server restart.
	// Start() must mark the pending run as failed before launching new workers.
	be2 := orchpg.NewBackend(db, orchpg.Config{Workers: 4})
	registry := map[string]orchestration.Workflow{wf.name: wf}
	if err := be2.Start(ctx, registry); err != nil {
		t.Fatalf("Start: %v", err)
	}
	defer func() { _ = be2.Stop(ctx) }()

	// markStaleFailed is synchronous in Start, so the run must already be failed.
	got, err := be2.GetRun(ctx, run.ID)
	if err != nil {
		t.Fatalf("GetRun: %v", err)
	}
	if got.Status != orchestration.StatusFailed {
		t.Errorf("want status=failed after server restart, got %s", got.Status)
	}
	if got.Error != "server restart" {
		t.Errorf("want error='server restart', got %q", got.Error)
	}
}

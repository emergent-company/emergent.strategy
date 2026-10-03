package aimdbos_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// TestRunStore_MarkRunningIfPending_DoesNotClobberProgressAlreadyRecorded
// is a direct, deterministic reproduction of a real data-loss race found
// in CI, not inferred from code reading: three separate CI runs on
// unrelated branches failed
// TestDBOSEngine_InstanceDependentPlanning_TwoInstancesGetDifferentPlans
// and friends with one step silently reverted from "done" back to
// "pending" while its siblings completed normally.
//
// Root cause: dbos.RunWorkflow (StartRun's caller) starts the workflow in
// a background goroutine and returns as soon as it is launched — confirmed
// by reading the DBOS library's own RunWorkflow, which does `go func() {
// result, err = fn(workflowCtx, input) ... }()` with no wait for even the
// first step. StartRun used to follow that call with an unconditional
// UpdateStatus seeded from a local run.Steps variable captured before
// RunWorkflow was ever invoked. If the real workflow goroutine raced
// ahead and persisted a step's completion via its own read-modify-write
// (recordStepDone -> withRun) before StartRun's trailing write reached
// Postgres, that stale write silently reverted the row to its initial
// all-pending placeholder state — a genuine lost-update bug a production
// run could hit under the same ordering, not just a flaky test assertion.
//
// This test does not need DBOS, a workflow, or timing at all to prove the
// fix: it drives RunStore directly, simulating the exact interleaving by
// hand — write the "done" progress a concurrent workflow goroutine would
// have recorded, *then* call the method StartRun calls on its own
// (delayed) return path, and assert the progress survives.
func TestRunStore_MarkRunningIfPending_DoesNotClobberProgressAlreadyRecorded(t *testing.T) {
	db, _ := database.TestDBWithDSN(t)
	store := aimdbos.NewRunStore(db)

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "race_test_wf",
		ConcurrencyKey: uuid.New().String(),
		Input:          map[string]any{},
		Status:         orchestration.StatusPending,
		Steps: []orchestration.StepLog{
			{Name: "a", Status: "pending"},
			{Name: "b", Status: "pending"},
			{Name: "c", Status: "pending"},
		},
	}
	if err := store.Create(t.Context(), run, run.ID.String()); err != nil {
		t.Fatalf("create: %v", err)
	}

	// Simulate the workflow goroutine racing ahead of StartRun's own
	// trailing call: step "a" completes and is persisted via the same
	// read-modify-write path recordStepDone/withRun actually uses —
	// fetch current state, mutate, write back the full row.
	progressed, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get after create: %v", err)
	}
	progressed.Status = orchestration.StatusRunning
	progressed.CurrentStep = "a"
	progressed.Steps[0].Status = "done"
	if err := store.UpdateStatus(t.Context(), run.ID, progressed.Status, progressed.CurrentStep, "", progressed.Steps); err != nil {
		t.Fatalf("simulate workflow progress: %v", err)
	}

	// StartRun's own trailing call, arriving "late" (after the simulated
	// progress above) — exactly the interleaving that corrupted
	// production rows before this fix. MarkRunningIfPending's WHERE
	// status='pending' must make this a no-op: the row is already
	// "running", not "pending".
	if err := store.MarkRunningIfPending(t.Context(), run.ID); err != nil {
		t.Fatalf("mark running if pending: %v", err)
	}

	final, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get final: %v", err)
	}
	if final.Status != orchestration.StatusRunning {
		t.Errorf("Status = %q, want running (unchanged from the simulated progress)", final.Status)
	}
	if final.CurrentStep != "a" {
		t.Errorf("CurrentStep = %q, want \"a\" (unchanged)", final.CurrentStep)
	}
	if final.Steps[0].Status != "done" {
		t.Errorf("step \"a\" = %q, want \"done\" — MarkRunningIfPending clobbered real progress back to a stale placeholder", final.Steps[0].Status)
	}
	if final.Steps[1].Status != "pending" || final.Steps[2].Status != "pending" {
		t.Errorf("steps b/c = %+v, want still pending (unaffected either way)", final.Steps[1:])
	}
}

// TestRunStore_MarkRunningIfPending_MarksARunThatHasNotYetProgressed is the
// complementary, common-case property: when nothing has raced ahead (the
// overwhelming majority of real calls), this must still do its one real
// job — flip a freshly created run from "pending" to "running".
func TestRunStore_MarkRunningIfPending_MarksARunThatHasNotYetProgressed(t *testing.T) {
	db, _ := database.TestDBWithDSN(t)
	store := aimdbos.NewRunStore(db)

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   "race_test_wf",
		ConcurrencyKey: uuid.New().String(),
		Input:          map[string]any{},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{{Name: "only", Status: "pending"}},
	}
	if err := store.Create(t.Context(), run, run.ID.String()); err != nil {
		t.Fatalf("create: %v", err)
	}

	if err := store.MarkRunningIfPending(t.Context(), run.ID); err != nil {
		t.Fatalf("mark running if pending: %v", err)
	}

	final, err := store.GetByID(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get: %v", err)
	}
	if final.Status != orchestration.StatusRunning {
		t.Errorf("Status = %q, want running", final.Status)
	}
}

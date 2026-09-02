package pg_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
	orchpg "github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration/pg"
)

// Gate instrumentation exists so review latency is measurable. Before it, a
// step's FinishedAt marked the step body returning, the awaiting_human status
// was overwritten with "done" on resume, and a gate a human cleared was
// afterwards indistinguishable from a step that never gated.

// gatedWorkflow is one gated step followed by one ungated step, which is the
// smallest shape that exercises both branches.
func gatedWorkflow(name string, batchID string) *mockWorkflow {
	return &mockWorkflow{
		name: name,
		steps: []orchestration.Step{
			{
				Name:      "gated",
				HumanGate: true,
				Execute: func(context.Context, *orchestration.Run) (orchestration.StepResult, error) {
					return orchestration.StepResult{BatchID: batchID}, nil
				},
			},
			{
				Name: "ungated",
				Execute: func(context.Context, *orchestration.Run) (orchestration.StepResult, error) {
					return orchestration.StepResult{}, nil
				},
			},
		},
	}
}

func startGatedRun(t *testing.T, be *orchpg.Backend, wf *mockWorkflow) *orchestration.Run {
	t.Helper()

	run := &orchestration.Run{
		ID:             uuid.New(),
		WorkflowName:   wf.name,
		ConcurrencyKey: "instance-" + uuid.NewString()[:8],
		Input:          map[string]any{"instance_id": "i-1"},
		Status:         orchestration.StatusPending,
		Steps:          []orchestration.StepLog{},
	}
	if err := be.Enqueue(t.Context(), run); err != nil {
		t.Fatalf("enqueue: %v", err)
	}
	return run
}

// awaitStatus polls until the run reaches a status, since the worker pool runs
// the step asynchronously.
func awaitStatus(t *testing.T, be *orchpg.Backend, runID uuid.UUID, want orchestration.RunStatus) *orchestration.Run {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	var last orchestration.RunStatus
	for time.Now().Before(deadline) {
		run, err := be.GetRun(t.Context(), runID)
		if err == nil && run != nil {
			last = run.Status
			if run.Status == want {
				return run
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("run %s never reached %s (last status %q)", runID, want, last)
	return nil
}

func stepByName(t *testing.T, run *orchestration.Run, name string) orchestration.StepLog {
	t.Helper()
	for _, s := range run.Steps {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("step %q not found in run (steps: %+v)", name, run.Steps)
	return orchestration.StepLog{}
}

func newGateBackend(t *testing.T, wf *mockWorkflow) *orchpg.Backend {
	t.Helper()

	be := orchpg.NewBackend(database.TestDB(t), orchpg.Config{Workers: 1})
	if err := be.Start(t.Context(), map[string]orchestration.Workflow{wf.name: wf}); err != nil {
		t.Fatalf("start backend: %v", err)
	}
	t.Cleanup(func() { _ = be.Stop(context.Background()) })
	return be
}

// TestGate_OpenIsRecordedBeforeWaiting is the load-bearing one: the gate-open
// stamp must be durable before the worker blocks, or a crash during the wait
// loses the only record of when the wait began.
func TestGate_OpenIsRecordedBeforeWaiting(t *testing.T) {
	wf := gatedWorkflow("gate_open_wf", "batch-1")
	be := newGateBackend(t, wf)
	run := startGatedRun(t, be, wf)

	paused := awaitStatus(t, be, run.ID, orchestration.StatusAwaitingHuman)
	gated := stepByName(t, paused, "gated")

	if gated.GateOpenedAt == nil {
		t.Fatal("gate opened but GateOpenedAt was not persisted before waiting")
	}
	if gated.GateClearedAt != nil {
		t.Errorf("GateClearedAt set while the gate is still open: %v", gated.GateClearedAt)
	}
	if gated.GateOutcome != "" {
		t.Errorf("GateOutcome = %q while the gate is still open, want empty", gated.GateOutcome)
	}

	// An open gate reports elapsed wait; a cleared duration is not yet known.
	if _, ok := gated.GateWait(); ok {
		t.Error("GateWait reported a duration for a gate that has not cleared")
	}
	if _, ok := gated.GateOpenFor(time.Now().UTC()); !ok {
		t.Error("GateOpenFor reported nothing for an open gate")
	}
}

func TestGate_CommitRecordsClearanceAndOutcome(t *testing.T) {
	wf := gatedWorkflow("gate_commit_wf", "batch-1")
	be := newGateBackend(t, wf)
	run := startGatedRun(t, be, wf)

	paused := awaitStatus(t, be, run.ID, orchestration.StatusAwaitingHuman)
	openedAt := stepByName(t, paused, "gated").GateOpenedAt

	if err := be.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}
	done := awaitStatus(t, be, run.ID, orchestration.StatusCompleted)
	gated := stepByName(t, done, "gated")

	if gated.GateOutcome != orchestration.GateCommitted {
		t.Errorf("GateOutcome = %q, want %q", gated.GateOutcome, orchestration.GateCommitted)
	}
	if gated.GateClearedAt == nil {
		t.Fatal("GateClearedAt not recorded on commit")
	}
	// The open stamp must survive clearance — it is half the measurement.
	if gated.GateOpenedAt == nil || !gated.GateOpenedAt.Equal(*openedAt) {
		t.Errorf("GateOpenedAt changed across clearance: %v then %v", openedAt, gated.GateOpenedAt)
	}
	if _, ok := gated.GateWait(); !ok {
		t.Error("GateWait unknown after a clean commit")
	}
}

func TestGate_DiscardRecordsDiscardedOutcome(t *testing.T) {
	wf := gatedWorkflow("gate_discard_wf", "batch-1")
	be := newGateBackend(t, wf)
	run := startGatedRun(t, be, wf)

	awaitStatus(t, be, run.ID, orchestration.StatusAwaitingHuman)

	if err := be.Resume(t.Context(), run.ID, false); err != nil {
		t.Fatalf("resume: %v", err)
	}
	aborted := awaitStatus(t, be, run.ID, orchestration.StatusAborted)
	gated := stepByName(t, aborted, "gated")

	if gated.GateOutcome != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want %q", gated.GateOutcome, orchestration.GateDiscarded)
	}
	if gated.GateClearedAt == nil {
		t.Error("GateClearedAt not recorded on discard")
	}
}

// TestGate_UngatedStepRecordsNoGate is what makes the measurement meaningful:
// without it, a gate that cleared instantly would be indistinguishable from a
// step that never gated, which is the defect this change exists to fix.
func TestGate_UngatedStepRecordsNoGate(t *testing.T) {
	wf := gatedWorkflow("gate_ungated_wf", "batch-1")
	be := newGateBackend(t, wf)
	run := startGatedRun(t, be, wf)

	awaitStatus(t, be, run.ID, orchestration.StatusAwaitingHuman)
	if err := be.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}
	done := awaitStatus(t, be, run.ID, orchestration.StatusCompleted)

	ungated := stepByName(t, done, "ungated")
	if ungated.GateOpenedAt != nil || ungated.GateClearedAt != nil || ungated.GateOutcome != "" {
		t.Errorf("ungated step carries gate data: opened=%v cleared=%v outcome=%q",
			ungated.GateOpenedAt, ungated.GateClearedAt, ungated.GateOutcome)
	}
}

// TestGate_LegacyStepLogDecodes covers the 204 runs already in the database,
// written before any of these fields existed. Absent must stay absent rather
// than decoding as the zero time, or every historical gate would report as
// cleared in 1970.
func TestGate_LegacyStepLogDecodes(t *testing.T) {
	legacy := []byte(`{
		"name": "draft_assessment",
		"status": "done",
		"batch_id": "b-1",
		"started_at": "2026-06-02T08:47:54Z",
		"finished_at": "2026-06-02T08:48:10Z"
	}`)

	var step orchestration.StepLog
	if err := json.Unmarshal(legacy, &step); err != nil {
		t.Fatalf("legacy StepLog failed to decode: %v", err)
	}

	if step.GateOpenedAt != nil || step.GateClearedAt != nil {
		t.Errorf("legacy step decoded gate timestamps: opened=%v cleared=%v",
			step.GateOpenedAt, step.GateClearedAt)
	}
	if step.GateOutcome != "" {
		t.Errorf("legacy step decoded GateOutcome = %q, want empty", step.GateOutcome)
	}
	if _, ok := step.GateWait(); ok {
		t.Error("legacy step reported a known gate wait; it is unknowable")
	}
}

// TestGate_OmittedWhenAbsent keeps stored runs from growing three null fields
// each, and keeps "absent" distinguishable on the wire.
func TestGate_OmittedWhenAbsent(t *testing.T) {
	encoded, err := json.Marshal(orchestration.StepLog{Name: "ungated", Status: "done"})
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var decoded map[string]any
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	for _, key := range []string{"gate_opened_at", "gate_cleared_at", "gate_outcome"} {
		if _, present := decoded[key]; present {
			t.Errorf("%q serialised for a step that never gated", key)
		}
	}
}

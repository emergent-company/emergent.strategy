package aimdbos_test

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// newEngineWithRetention is retention_test.go's own constructor, not a
// reuse of newEngine/newEngineWithConfig: those fix WorkflowRetention at
// its zero value (disabled), which is correct for every other test in this
// package but not for these — see openspec/changes/adopt-dbos-dynamic-aim,
// Part C5.
func newEngineWithRetention(t *testing.T, retention time.Duration, workflows ...orchestration.Workflow) *aimdbos.DBOSEngine {
	t.Helper()
	db, dsn := database.TestDBWithDSN(t)
	runStore := aimdbos.NewRunStore(db)

	engine, err := aimdbos.NewDBOSEngine(runStore, aimdbos.DBOSEngineConfig{
		AppName:            "aimdbos-retention-test",
		DatabaseURL:        dsn,
		ApplicationVersion: "test-fixed-version",
		AbandonGatesAfter:  time.Hour,
		WorkflowRetention:  retention,
	})
	if err != nil {
		t.Fatalf("new engine: %v", err)
	}
	for _, w := range workflows {
		engine.Register(w)
	}
	if err := engine.Start(t.Context()); err != nil {
		t.Fatalf("start: %v", err)
	}
	t.Cleanup(func() {
		stopCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = engine.Stop(stopCtx)
	})
	return engine
}

// TestDBOSEngine_ReapCompletedWorkflows_ReapsOldTerminalWorkflows confirms
// the sweep actually deletes DBOS's own workflow record for a completed
// run once it is older than WorkflowRetention — not just that it returns a
// plausible-looking count. A one-millisecond retention window makes an
// already-completed test run immediately eligible without a real sleep of
// any meaningful duration.
func TestDBOSEngine_ReapCompletedWorkflows_ReapsOldTerminalWorkflows(t *testing.T) {
	wf := &fakeWorkflow{name: "reap_wf", steps: []aim.Step{fakeStep("only", false, "")}}
	engine := newEngineWithRetention(t, time.Millisecond, wf)

	run, err := engine.StartRun(t.Context(), "reap_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	time.Sleep(10 * time.Millisecond) // comfortably past the 1ms retention window

	n, err := engine.ReapCompletedWorkflows()
	if err != nil {
		t.Fatalf("reap: %v", err)
	}
	if n < 1 {
		t.Fatalf("reaped %d workflows, want at least 1", n)
	}

	// A second, immediate sweep must find nothing left to reap — if the
	// first sweep had merely counted candidates without actually deleting
	// them, this would find the same workflow again.
	n2, err := engine.ReapCompletedWorkflows()
	if err != nil {
		t.Fatalf("second reap: %v", err)
	}
	if n2 != 0 {
		t.Errorf("second sweep reaped %d, want 0 — first sweep did not actually delete", n2)
	}

	// aim_cycle_runs' own record is untouched by DBOS-side deletion — this
	// engine's permanent run history is a separate table from DBOS's own
	// bookkeeping (DBOSEngineConfig.WorkflowRetention's doc comment).
	stillThere, err := engine.GetRun(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("GetRun after reap: %v", err)
	}
	if stillThere.Status != orchestration.StatusCompleted {
		t.Errorf("run status after reap = %q, want completed (aim_cycle_runs must survive DBOS-side deletion)", stillThere.Status)
	}
}

// TestDBOSEngine_ReapCompletedWorkflows_NeverTouchesActiveOrRecentRuns
// confirms two things a naive sweep could get wrong: it never reaps a
// non-terminal (parked at a gate) run regardless of how old the
// WorkflowRetention window is measured against, and it never reaps a
// terminal run that is not yet older than the window. The parked run's
// continued functionality (Resume still works after the sweep) is the
// strongest available proof its underlying DBOS record was not deleted —
// a wrongly-deleted record would leave Resume's dbos.Send with nothing to
// deliver to.
func TestDBOSEngine_ReapCompletedWorkflows_NeverTouchesActiveOrRecentRuns(t *testing.T) {
	wf := &fakeWorkflow{name: "keep_wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
	// One hour retention: a run completed moments ago is nowhere near
	// eligible, regardless of how the sweep's cutoff is computed.
	engine := newEngineWithRetention(t, time.Hour, wf)

	parkedRun, err := engine.StartRun(t.Context(), "keep_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start parked: %v", err)
	}
	awaitEngineStatus(t, engine, parkedRun.ID, orchestration.StatusAwaitingHuman)

	recentRun, err := engine.StartRun(t.Context(), "keep_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start recent: %v", err)
	}
	awaitEngineStatus(t, engine, recentRun.ID, orchestration.StatusAwaitingHuman)
	if err := engine.Resume(t.Context(), recentRun.ID, true); err != nil {
		t.Fatalf("resume recent: %v", err)
	}
	awaitEngineStatus(t, engine, recentRun.ID, orchestration.StatusCompleted)

	n, err := engine.ReapCompletedWorkflows()
	if err != nil {
		t.Fatalf("reap: %v", err)
	}
	if n != 0 {
		t.Fatalf("reaped %d workflows, want 0 (one active, one too recent)", n)
	}

	// The parked run's DBOS record must still be alive and resumable.
	if err := engine.Resume(t.Context(), parkedRun.ID, true); err != nil {
		t.Fatalf("resume parked run after sweep: %v (its DBOS record may have been wrongly reaped)", err)
	}
	awaitEngineStatus(t, engine, parkedRun.ID, orchestration.StatusCompleted)
}

// TestDBOSEngine_ReapCompletedWorkflows_RetentionDisabled_IsANoOp confirms
// WorkflowRetention<=0 is a real "never delete anything" guarantee, not
// just the ticker loop choosing not to call this method — see
// ReapCompletedWorkflows's own doc comment for why the guard lives in the
// method itself.
func TestDBOSEngine_ReapCompletedWorkflows_RetentionDisabled_IsANoOp(t *testing.T) {
	wf := &fakeWorkflow{name: "disabled_wf", steps: []aim.Step{fakeStep("only", false, "")}}
	engine := newEngineWithRetention(t, 0, wf)

	run, err := engine.StartRun(t.Context(), "disabled_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	time.Sleep(10 * time.Millisecond)

	n, err := engine.ReapCompletedWorkflows()
	if err != nil {
		t.Fatalf("reap: %v", err)
	}
	if n != 0 {
		t.Errorf("reaped %d workflows with retention disabled, want 0", n)
	}
}

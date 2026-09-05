package aimdbos_test

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// fakePlannerWorkflow satisfies orchestration.Workflow (Name), the
// structural cast DBOSEngine.Register requires (CycleSteps), AND
// aim.Planner (Plan) — the combination that opts a workflow into
// per-instance planning instead of the automatic staticPlanner fallback
// every plain *fakeWorkflow gets. See openspec/changes/adopt-dbos-dynamic-aim,
// Part C4.
type fakePlannerWorkflow struct {
	name  string
	steps []aim.Step
	plan  func(ctx context.Context, instanceID uuid.UUID, completed []aim.StepOutput) ([]string, error)
}

func (w *fakePlannerWorkflow) Name() string           { return w.name }
func (w *fakePlannerWorkflow) CycleSteps() []aim.Step { return w.steps }
func (w *fakePlannerWorkflow) Plan(ctx context.Context, instanceID uuid.UUID, completed []aim.StepOutput) ([]string, error) {
	return w.plan(ctx, instanceID, completed)
}

var _ aim.Planner = (*fakePlannerWorkflow)(nil)

// filterDone is the same "remaining = order minus completed" logic
// domain/aim.CycleWorkflow.Plan uses, shared here so each test's planner
// function only needs to supply the order for a given instance/point.
func filterDone(order []string, completed []aim.StepOutput) []string {
	done := make(map[string]bool, len(completed))
	for _, c := range completed {
		done[c.Step] = true
	}
	remaining := make([]string, 0, len(order))
	for _, name := range order {
		if !done[name] {
			remaining = append(remaining, name)
		}
	}
	return remaining
}

// TestDBOSEngine_InstanceDependentPlanning_TwoInstancesGetDifferentPlans is
// Part C4's core requirement: step selection is decided once at cycle
// start, per instance, before any step runs — not a property of the
// workflow name alone. instanceA's plan omits "b" entirely (a genuine
// step-SET difference); instanceB's plan runs all three.
func TestDBOSEngine_InstanceDependentPlanning_TwoInstancesGetDifferentPlans(t *testing.T) {
	instanceA := uuid.New()
	instanceB := uuid.New()

	wf := &fakePlannerWorkflow{
		name: "planned_wf",
		steps: []aim.Step{
			fakeStep("a", false, ""),
			fakeStep("b", false, ""),
			fakeStep("c", false, ""),
		},
		plan: func(_ context.Context, instanceID uuid.UUID, completed []aim.StepOutput) ([]string, error) {
			switch instanceID {
			case instanceA:
				return filterDone([]string{"a", "c"}, completed), nil
			case instanceB:
				return filterDone([]string{"a", "b", "c"}, completed), nil
			default:
				return nil, nil
			}
		},
	}
	engine := newEngine(t, wf)

	runA, err := engine.StartRun(t.Context(), "planned_wf", instanceA.String(), nil)
	if err != nil {
		t.Fatalf("start run A: %v", err)
	}
	// The plan is resolved before the first step runs — assert the
	// placeholder set StartRun returns already reflects it, not just the
	// eventual completed set.
	if len(runA.Steps) != 2 {
		t.Fatalf("instance A: got %d planned steps, want 2 (a, c): %+v", len(runA.Steps), runA.Steps)
	}

	runB, err := engine.StartRun(t.Context(), "planned_wf", instanceB.String(), nil)
	if err != nil {
		t.Fatalf("start run B: %v", err)
	}
	if len(runB.Steps) != 3 {
		t.Fatalf("instance B: got %d planned steps, want 3 (a, b, c): %+v", len(runB.Steps), runB.Steps)
	}

	doneA := awaitEngineStatus(t, engine, runA.ID, orchestration.StatusCompleted)
	doneB := awaitEngineStatus(t, engine, runB.ID, orchestration.StatusCompleted)

	if len(doneA.Steps) != 2 || stepIn(t, doneA, "a").Status != "done" || stepIn(t, doneA, "c").Status != "done" {
		t.Errorf("instance A final steps = %+v, want exactly a and c, both done", doneA.Steps)
	}
	for _, s := range doneA.Steps {
		if s.Name == "b" {
			t.Errorf("instance A ran step %q, which its plan never included", s.Name)
		}
	}

	if len(doneB.Steps) != 3 || stepIn(t, doneB, "a").Status != "done" || stepIn(t, doneB, "b").Status != "done" || stepIn(t, doneB, "c").Status != "done" {
		t.Errorf("instance B final steps = %+v, want a, b, c all done", doneB.Steps)
	}
}

// TestDBOSEngine_Replan_TakesEffectAtTheNextBoundary proves a replan signal
// changes what runs after the boundary it is picked up at — sent while
// step "a" is still in flight (confirmed via a channel it closes on entry,
// not a wall-clock guess), so it is delivered and the flag observed true
// before cycleWorkflow's own boundary check for "a" ever runs, making the
// outcome deterministic rather than a race against how fast "a" completes.
//
// This does not claim to hit the narrower "after step1's own completion,
// before step2 begins" instant specifically — that gap is not
// independently observable without instrumenting production code — but the
// observable effect (what runs after the boundary) is the same regardless
// of exactly when within [step1 starts, step1's boundary check runs] the
// signal lands, and this is the deterministic way to guarantee it lands
// somewhere in that window at all.
func TestDBOSEngine_Replan_TakesEffectAtTheNextBoundary(t *testing.T) {
	instanceID := uuid.New()
	startedA := make(chan struct{})
	releaseA := make(chan struct{})

	wf := &fakePlannerWorkflow{
		name: "replan_wf",
		steps: []aim.Step{
			fakeStep("a", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
				close(startedA)
				<-releaseA
				return aim.StepOutput{Step: "a"}, nil
			}),
			fakeStep("b", false, ""),
			fakeStep("c", false, ""),
			fakeStep("d", false, ""),
		},
		plan: func(_ context.Context, _ uuid.UUID, completed []aim.StepOutput) ([]string, error) {
			if len(completed) == 0 {
				return []string{"a", "b", "c"}, nil // original plan
			}
			// Once "a" has completed, the re-plan replaces the rest of the
			// cycle with "d" alone — "b" and "c" must never run.
			return filterDone([]string{"d"}, completed), nil
		},
	}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "replan_wf", instanceID.String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	<-startedA // "a" is confirmed in flight
	if err := engine.Replan(t.Context(), run.ID); err != nil {
		t.Fatalf("replan: %v", err)
	}
	close(releaseA) // let "a" finish now that the replan request is durably recorded

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if stepIn(t, done, "a").Status != "done" {
		t.Errorf("step a did not complete: %+v", done.Steps)
	}
	if stepIn(t, done, "d").Status != "done" {
		t.Errorf("step d (the re-planned step) did not run: %+v", done.Steps)
	}
	for _, name := range []string{"b", "c"} {
		for _, s := range done.Steps {
			if s.Name == name {
				t.Errorf("step %q ran despite being dropped by the re-plan: %+v", name, done.Steps)
			}
		}
	}
}

// TestDBOSEngine_Replan_DoesNotInterruptAStepAlreadyInFlight is the
// complementary property to the test above: a replan signal sent while a
// step is confirmed already running (not merely "before the next one
// starts") never affects that step's own outcome — it completes with
// exactly the output it would have produced regardless — and only changes
// what comes after it. This is what "narrower than a reconciler" means
// concretely: re-planning influences the future, never work in flight.
func TestDBOSEngine_Replan_DoesNotInterruptAStepAlreadyInFlight(t *testing.T) {
	instanceID := uuid.New()
	startedB := make(chan struct{})
	releaseB := make(chan struct{})

	wf := &fakePlannerWorkflow{
		name: "replan_wf2",
		steps: []aim.Step{
			fakeStep("a", false, ""),
			fakeStep("b", false, "batch-b", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
				close(startedB)
				<-releaseB
				return aim.StepOutput{Step: "b", BatchID: "batch-b"}, nil
			}),
			fakeStep("c", false, ""),
			fakeStep("d", false, ""),
		},
		plan: func(_ context.Context, _ uuid.UUID, completed []aim.StepOutput) ([]string, error) {
			if len(completed) < 2 {
				return filterDone([]string{"a", "b", "c"}, completed), nil // original plan
			}
			// Once both "a" and "b" have completed, "c" is replaced by "d".
			return filterDone([]string{"d"}, completed), nil
		},
	}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "replan_wf2", instanceID.String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	<-startedB // "b" is confirmed already running — not merely "about to start"
	if err := engine.Replan(t.Context(), run.ID); err != nil {
		t.Fatalf("replan: %v", err)
	}
	close(releaseB) // let "b" finish, unaffected by the pending replan

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	b := stepIn(t, done, "b")
	if b.Status != "done" || b.BatchID != "batch-b" {
		t.Errorf("step b was affected by an in-flight replan: %+v", b)
	}
	if stepIn(t, done, "d").Status != "done" {
		t.Errorf("step d (the re-planned step) did not run: %+v", done.Steps)
	}
	for _, s := range done.Steps {
		if s.Name == "c" {
			t.Errorf("step c ran despite being dropped by the re-plan: %+v", done.Steps)
		}
	}
}

// TestDBOSEngine_Replan_NoOneEverCalls_NoReplanCheckRecvHappens documents
// (rather than strictly proves, since it would require intercepting DBOS's
// own logging) the design intent behind RunStore.ReplanRequested existing
// at all: a cycle nobody ever calls Replan on must complete correctly with
// its original plan intact — the flag defaults false, so every boundary's
// dbos.RunAsStep check reads false and never calls dbos.Recv. This test
// asserts the observable half of that (the original plan runs to
// completion unchanged); the other half (no dbos.Recv call, and therefore
// none of DBOS's own timeout-reached warning log, in the common case) is
// established structurally by checkReplan's short-circuit, not re-verified
// here per run.
func TestDBOSEngine_Replan_NoOneEverCalls_OriginalPlanRunsUnchanged(t *testing.T) {
	instanceID := uuid.New()
	planCalls := 0

	wf := &fakePlannerWorkflow{
		name: "no_replan_wf",
		steps: []aim.Step{
			fakeStep("a", false, ""),
			fakeStep("b", false, ""),
		},
		plan: func(_ context.Context, _ uuid.UUID, completed []aim.StepOutput) ([]string, error) {
			planCalls++
			return filterDone([]string{"a", "b"}, completed), nil
		},
	}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "no_replan_wf", instanceID.String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	if stepIn(t, done, "a").Status != "done" || stepIn(t, done, "b").Status != "done" {
		t.Errorf("original plan did not run to completion: %+v", done.Steps)
	}
	// Plan is called exactly once — at StartRun, in host code — never again,
	// since no boundary ever finds replan_requested true.
	if planCalls != 1 {
		t.Errorf("Plan called %d times, want exactly 1 (cycle start only, no boundary re-plan)", planCalls)
	}
}

// TestDBOSEngine_Replan_AfterRetry_TargetsTheLiveWorkflow started out as
// the same test shape as
// TestDBOSEngine_Resume_AfterRetry_TargetsTheLiveWorkflow, on the
// assumption that Replan's identical dbos.Send-to-runID mistake was an
// identically serious bug. Mutation testing it (reintroducing the
// unfixed code, expecting a failure) instead revealed it is a real but
// *smaller* bug than Resume's: DBOSEngine.Replan's own
// RunStore.SetReplanRequested write goes straight to Postgres, not
// through DBOS at all, so a run's replan_requested flag is set correctly
// regardless of which workflow the accompanying dbos.Send reaches.
// checkReplan (workflow.go) then treats a Recv timeout as "proceed with a
// fresh Plan() anyway," by design (the signal carries no payload, so its
// arrival was never informationally necessary) — which means a
// misdirected Send does not produce a wrong *outcome*, only an
// unnecessary wait of up to replanRecvGrace before checkReplan's next
// boundary falls through to its own timeout.
//
// So this test asserts what the bug actually costs: replanRecvGrace is
// 5s in production config, but newEngine's test config leaves
// AbandonGatesAfter (not replanRecvGrace, which is a workflow.go
// constant, not configurable) as-is — replanRecvGrace itself is fixed at
// 5s regardless. A run whose Replan reached the live workflow completes
// almost immediately once release is closed; one whose Replan silently
// missed still completes, but only after paying the full 5s timeout at
// the next boundary. Asserting completion well under that bound is what
// makes this test fail under the reintroduced bug instead of passing
// for the wrong reason, as the correctness-only version of this test did
// when first written.
func TestDBOSEngine_Replan_AfterRetry_TargetsTheLiveWorkflow(t *testing.T) {
	var flakyAttempts atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})

	wf := &fakePlannerWorkflow{
		name: "replan_after_retry_wf",
		steps: []aim.Step{
			fakeStep("flaky", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
				if flakyAttempts.Add(1) == 1 {
					return aim.StepOutput{}, errors.New("first attempt fails")
				}
				close(started)
				<-release
				return aim.StepOutput{Step: "flaky"}, nil
			}),
			fakeStep("b", false, ""),
			fakeStep("c", false, ""),
			fakeStep("d", false, ""),
		},
		plan: func(_ context.Context, _ uuid.UUID, completed []aim.StepOutput) ([]string, error) {
			if len(completed) == 0 {
				return []string{"flaky", "b", "c"}, nil // original plan
			}
			// Once "flaky" has completed (on the retry), the re-plan
			// replaces the rest of the cycle with "d" alone.
			return filterDone([]string{"d"}, completed), nil
		},
	}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "replan_after_retry_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}

	<-started // the retried (forked) workflow's "flaky" step is confirmed in flight
	if err := engine.Replan(t.Context(), run.ID); err != nil {
		t.Fatalf("replan: %v", err)
	}
	close(release)

	start := time.Now()
	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	elapsed := time.Since(start)

	// The actual, mutation-provable signal: a Replan that reached the live
	// workflow lets checkReplan pick the signal up almost immediately;
	// one that missed still eventually succeeds (checkReplan's own
	// timeout fallback), but only after paying replanRecvGrace (5s) in
	// full. 2s is comfortably above realistic scheduling jitter and
	// comfortably below the 5s fallback.
	if elapsed > 2*time.Second {
		t.Errorf("run took %v to complete after Replan — want well under replanRecvGrace's 5s, which suggests Replan's Send missed the live workflow and checkReplan fell through to its own timeout instead", elapsed)
	}

	if stepIn(t, done, "flaky").Status != "done" {
		t.Errorf("flaky did not complete: %+v", done.Steps)
	}
	if stepIn(t, done, "d").Status != "done" {
		t.Errorf("step d (the re-planned step) did not run: %+v", done.Steps)
	}
	for _, name := range []string{"b", "c"} {
		for _, s := range done.Steps {
			if s.Name == name {
				t.Errorf("step %q ran despite being dropped by the re-plan: %+v", name, done.Steps)
			}
		}
	}
}

// TestDBOSEngine_Replan_TerminalRun_Errors confirms Replan refuses to
// queue a request against a run that can never reach another boundary.
func TestDBOSEngine_Replan_TerminalRun_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("only", false, "")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if err := engine.Replan(t.Context(), run.ID); err == nil {
		t.Error("expected an error replanning a completed run, got nil")
	}
}

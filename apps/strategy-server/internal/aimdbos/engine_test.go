package aimdbos_test

import (
	"context"
	"errors"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimdbos"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// fakeWorkflow satisfies orchestration.Workflow (Name()) plus CycleSteps(),
// which is what DBOSEngine's structural cast actually looks for. Mirrors
// internal/aimadk's identical test fixture.
type fakeWorkflow struct {
	name  string
	steps []aim.Step
}

func (w *fakeWorkflow) Name() string           { return w.name }
func (w *fakeWorkflow) CycleSteps() []aim.Step { return w.steps }

// fakeStep builds a step that stages batchID by default. runs is optional
// and overrides the body entirely when supplied.
func fakeStep(name string, gate bool, batchID string, runs ...func(context.Context, aim.StepInput) (aim.StepOutput, error)) aim.Step {
	run := func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		return aim.StepOutput{BatchID: batchID}, nil
	}
	if len(runs) > 0 {
		run = runs[0]
	}
	return aim.Step{Name: name, HumanGate: gate, Run: run}
}

// newEngine builds a DBOSEngine against a fresh, isolated test database and
// registers the given workflows. AbandonGatesAfter defaults generously; use
// newEngineWithConfig for tests that need a short one.
//
// Takes orchestration.Workflow, not *fakeWorkflow specifically, so
// planner_test.go's fakePlannerWorkflow (which additionally implements
// aim.Planner, opting into per-instance planning instead of the automatic
// staticPlanner fallback — see engine.go's Register) can reuse this same
// setup rather than duplicating it.
func newEngine(t *testing.T, workflows ...orchestration.Workflow) *aimdbos.DBOSEngine {
	t.Helper()
	return newEngineWithConfig(t, time.Hour, workflows...)
}

func newEngineWithConfig(t *testing.T, abandonGatesAfter time.Duration, workflows ...orchestration.Workflow) *aimdbos.DBOSEngine {
	t.Helper()

	db, dsn := database.TestDBWithDSN(t)
	runStore := aimdbos.NewRunStore(db)

	engine, err := aimdbos.NewDBOSEngine(runStore, aimdbos.DBOSEngineConfig{
		AppName:            "aimdbos-test",
		DatabaseURL:        dsn,
		ApplicationVersion: "test-fixed-version", // stable across a test; see DBOSEngineConfig doc
		AbandonGatesAfter:  abandonGatesAfter,
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

// awaitEngineStatus polls GetRun until it reaches want, since DBOSEngine
// drives execution in the background.
func awaitEngineStatus(t *testing.T, engine *aimdbos.DBOSEngine, runID uuid.UUID, want orchestration.RunStatus) *orchestration.Run {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	var last orchestration.RunStatus
	for time.Now().Before(deadline) {
		run, err := engine.GetRun(t.Context(), runID)
		if err == nil {
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

func awaitEngineStep(t *testing.T, engine *aimdbos.DBOSEngine, runID uuid.UUID, wantStatus orchestration.RunStatus, wantStep string) *orchestration.Run {
	t.Helper()

	deadline := time.Now().Add(10 * time.Second)
	var lastStatus orchestration.RunStatus
	var lastStep string
	for time.Now().Before(deadline) {
		run, err := engine.GetRun(t.Context(), runID)
		if err == nil {
			lastStatus, lastStep = run.Status, run.CurrentStep
			if run.Status == wantStatus && run.CurrentStep == wantStep {
				return run
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatalf("run %s never reached status=%s step=%q (last status=%q step=%q)",
		runID, wantStatus, wantStep, lastStatus, lastStep)
	return nil
}

func stepIn(t *testing.T, run *orchestration.Run, name string) orchestration.StepLog {
	t.Helper()
	for _, s := range run.Steps {
		if s.Name == name {
			return s
		}
	}
	t.Fatalf("step %q not found in run.Steps (%+v)", name, run.Steps)
	return orchestration.StepLog{}
}

func TestDBOSEngine_UngatedWorkflow_CompletesWithoutPausing(t *testing.T) {
	wf := &fakeWorkflow{name: "ungated_wf", steps: []aim.Step{
		fakeStep("step_one", false, ""),
		fakeStep("step_two", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "ungated_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	if len(done.Steps) != 2 {
		t.Fatalf("got %d steps, want 2: %+v", len(done.Steps), done.Steps)
	}
	if stepIn(t, done, "step_one").Status != "done" || stepIn(t, done, "step_two").Status != "done" {
		t.Errorf("steps not both done: %+v", done.Steps)
	}
}

// TestDBOSEngine_StepInput_ReceivesTheInstanceID_NotTheRunID is a regression
// test for a real bug found by manual testing, not by this suite
// originally: cycleWorkflow passed runID (the DBOS/aim_cycle_runs row's own
// id) as aim.StepInput.InstanceID, instead of instanceID (the EPF strategy
// instance the cycle actually runs against). Every existing fixture in this
// file uses fakeStep's default body, which ignores in.InstanceID entirely —
// so this was invisible to every test here despite making every real step
// (which all key their DB reads off StepInput.InstanceID) query strategy
// data scoped to the wrong id, on every single AIM cycle run, always.
// Caught only by running a real cycle against real data through the actual
// web UI, where domain/aim.Service.loadArtifactPayload's WHERE instance_id
// = <run id> predictably matched zero rows and surfaced as a generic
// "No roadmap found for instance" — a symptom that looked like a data
// problem and was actually this.
func TestDBOSEngine_StepInput_ReceivesTheInstanceID_NotTheRunID(t *testing.T) {
	wantInstanceID := uuid.New()
	var gotInstanceID uuid.UUID

	wf := &fakeWorkflow{name: "instance_id_wf", steps: []aim.Step{
		fakeStep("only", false, "", func(_ context.Context, in aim.StepInput) (aim.StepOutput, error) {
			gotInstanceID = in.InstanceID
			return aim.StepOutput{}, nil
		}),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "instance_id_wf", wantInstanceID.String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if gotInstanceID != wantInstanceID {
		t.Errorf("StepInput.InstanceID = %s, want %s (the concurrency key / EPF instance id) — got %s instead, which is run.ID: %v",
			gotInstanceID, wantInstanceID, gotInstanceID, gotInstanceID == run.ID)
	}
}

// TestDBOSEngine_StepInput_AllFieldsWiredCorrectly is the general-purpose
// guard the instanceID-specific test above should have been from the
// start: it checks every field of aim.StepInput at every step boundary,
// not just one. The instanceID bug was found and fixed as a single
// targeted regression test; this test exists so the *next* wiring mistake
// in this exact struct literal (internal/aimdbos/workflow.go's
// step.Run(stepCtx, aim.StepInput{...}) call) — RunID, Params, or Prior,
// not just InstanceID — fails loudly here instead of needing another round
// of manual testing against real data to find.
func TestDBOSEngine_StepInput_AllFieldsWiredCorrectly(t *testing.T) {
	wantInstanceID := uuid.New()
	wantParams := map[string]any{"decision": "persevere", "_trigger": "aim_cycle"}

	var gotOne, gotTwo aim.StepInput
	wf := &fakeWorkflow{name: "fields_wf", steps: []aim.Step{
		fakeStep("one", false, "", func(_ context.Context, in aim.StepInput) (aim.StepOutput, error) {
			gotOne = in
			return aim.StepOutput{Meta: map[string]any{"from": "one"}}, nil
		}),
		fakeStep("two", false, "", func(_ context.Context, in aim.StepInput) (aim.StepOutput, error) {
			gotTwo = in
			return aim.StepOutput{}, nil
		}),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "fields_wf", wantInstanceID.String(), wantParams)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	// RunID: the run's own id, as a string, on every step.
	if gotOne.RunID != run.ID.String() {
		t.Errorf("step one: RunID = %q, want %q", gotOne.RunID, run.ID.String())
	}
	if gotTwo.RunID != run.ID.String() {
		t.Errorf("step two: RunID = %q, want %q", gotTwo.RunID, run.ID.String())
	}

	// InstanceID: the concurrency key, on every step — the field the
	// original bug got wrong.
	if gotOne.InstanceID != wantInstanceID {
		t.Errorf("step one: InstanceID = %s, want %s", gotOne.InstanceID, wantInstanceID)
	}
	if gotTwo.InstanceID != wantInstanceID {
		t.Errorf("step two: InstanceID = %s, want %s", gotTwo.InstanceID, wantInstanceID)
	}

	// Params: StartRun's input map, unchanged, on every step — not just
	// the first.
	if d, _ := gotOne.Params["decision"].(string); d != "persevere" {
		t.Errorf("step one: Params[decision] = %v, want persevere", gotOne.Params["decision"])
	}
	if d, _ := gotTwo.Params["decision"].(string); d != "persevere" {
		t.Errorf("step two: Params[decision] = %v, want persevere", gotTwo.Params["decision"])
	}

	// Prior: accumulates as the cycle progresses — empty for the first
	// step, containing the first step's own output by the second.
	if len(gotOne.Prior) != 0 {
		t.Errorf("step one: Prior = %+v, want empty (nothing has completed yet)", gotOne.Prior)
	}
	if len(gotTwo.Prior) != 1 || gotTwo.Prior[0].Step != "one" {
		t.Fatalf("step two: Prior = %+v, want exactly one entry for step \"one\"", gotTwo.Prior)
	}
	if from, _ := gotTwo.Prior[0].Meta["from"].(string); from != "one" {
		t.Errorf("step two: Prior[0].Meta[from] = %v, want \"one\" — step one's actual output, not a placeholder", gotTwo.Prior[0].Meta["from"])
	}
}

func TestDBOSEngine_GatedStep_PausesThenCommits(t *testing.T) {
	wf := &fakeWorkflow{name: "gated_wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "gated_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	parked := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)
	draft := stepIn(t, parked, "draft")
	if draft.BatchID != "batch-1" {
		t.Fatalf("draft.BatchID = %q, want batch-1", draft.BatchID)
	}
	if draft.GateOpenedAt == nil {
		t.Error("GateOpenedAt not recorded when gate opened")
	}

	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	draft = stepIn(t, done, "draft")
	if draft.GateOutcome != orchestration.GateCommitted {
		t.Errorf("GateOutcome = %q, want committed", draft.GateOutcome)
	}
	if draft.GateClearedAt == nil {
		t.Error("GateClearedAt not recorded when gate cleared")
	}
	if stepIn(t, done, "apply").Status != "done" {
		t.Error("apply step did not run after gate cleared")
	}
}

func TestDBOSEngine_GatedStep_Discard_AbortsRun(t *testing.T) {
	wf := &fakeWorkflow{name: "gated_wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "gated_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	if err := engine.Resume(t.Context(), run.ID, false); err != nil {
		t.Fatalf("resume with discard: %v", err)
	}

	aborted := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)
	draft := stepIn(t, aborted, "draft")
	if draft.GateOutcome != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want discarded", draft.GateOutcome)
	}
	if stepIn(t, aborted, "apply").Status == "done" {
		t.Error("apply step ran despite the gate being discarded")
	}
}

func TestDBOSEngine_EmptyBatch_AutoAdvancesWithoutPausing(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("draft", true, ""), // HumanGate but nothing staged
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	if stepIn(t, done, "draft").Status != "done" {
		t.Error("draft did not auto-advance")
	}
}

func TestDBOSEngine_TwoSequentialGates_EachResumesCorrectly(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("gate_one", true, "batch-1"),
		fakeStep("gate_two", true, "batch-2"),
		fakeStep("snapshot", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "gate_one")
	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume gate one: %v", err)
	}

	second := awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "gate_two")
	if got := stepIn(t, second, "gate_one").Status; got != "done" {
		t.Fatalf("gate_one.Status = %q after clearing, want done", got)
	}
	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume gate two: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	for _, name := range []string{"gate_one", "gate_two", "snapshot"} {
		if stepIn(t, done, name).Status != "done" {
			t.Errorf("%s not done in final run", name)
		}
	}
}

// TestDBOSEngine_Register_AcceptsTheRealAIMCycleWorkflow closes the loop on
// the structural interface check in Register: it is not enough that a test
// fake satisfies cycleStepsProvider, since the whole point is that
// domain/aim.CycleWorkflow — the value cmd_serve.go actually registers — does
// too, unmodified. Equivalent to internal/aimadk's identically-named test,
// now that DBOSEngine replaces ADKEngine.
func TestDBOSEngine_Register_AcceptsTheRealAIMCycleWorkflow(t *testing.T) {
	db, dsn := database.TestDBWithDSN(t)
	store := aimdbos.NewRunStore(db)
	engine, err := aimdbos.NewDBOSEngine(store, aimdbos.DBOSEngineConfig{
		AppName:            "test-app",
		DatabaseURL:        dsn,
		ApplicationVersion: "test-fixed-version",
		AbandonGatesAfter:  time.Hour,
	})
	if err != nil {
		t.Fatalf("new engine: %v", err)
	}

	real := aim.NewCycleWorkflow(nil, nil)
	engine.Register(real)
	if err := engine.Start(t.Context()); err != nil {
		t.Fatalf("start: %v", err)
	}
	defer func() { _ = engine.Stop(t.Context()) }()

	// StartRun will fail once a real step body actually runs (svc is nil),
	// but reaching that failure — rather than "unknown workflow" — proves
	// Register accepted it and the workflow function can drive its real steps.
	run, err := engine.StartRun(t.Context(), aim.WorkflowName, uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start run: %v (Register likely rejected the real workflow)", err)
	}

	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
}

func TestDBOSEngine_StartRun_UnknownWorkflow_Errors(t *testing.T) {
	engine := newEngine(t)
	if _, err := engine.StartRun(t.Context(), "nope", uuid.New().String(), nil); err == nil {
		t.Fatal("expected an error for an unregistered workflow")
	}
}

func TestDBOSEngine_StartRun_InvalidConcurrencyKey_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)
	if _, err := engine.StartRun(t.Context(), "wf", "not-a-uuid", nil); err == nil {
		t.Fatal("expected an error for a non-UUID concurrency key")
	}
}

func TestDBOSEngine_StartRun_SecondActiveRun_ReturnsErrAlreadyActive(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newEngine(t, wf)

	instanceID := uuid.New().String()
	if _, err := engine.StartRun(t.Context(), "wf", instanceID, nil); err != nil {
		t.Fatalf("first start: %v", err)
	}

	_, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if !errors.Is(err, orchestration.ErrAlreadyActive) {
		t.Fatalf("second start: err = %v, want ErrAlreadyActive", err)
	}
}

func TestDBOSEngine_Resume_NonAwaitingRun_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if err := engine.Resume(t.Context(), run.ID, true); err == nil {
		t.Fatal("expected resume on a completed run to error")
	}
}

func TestDBOSEngine_Abort_WhileAwaitingHuman_IsADiscard(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	if err := engine.Abort(t.Context(), run.ID); err != nil {
		t.Fatalf("abort: %v", err)
	}

	aborted := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)
	if got := stepIn(t, aborted, "draft").GateOutcome; got != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want discarded", got)
	}
}

// TestDBOSEngine_Abort_AfterRetry_CancelsTheLiveWorkflow closes the same
// gap TestDBOSEngine_Resume_AfterRetry_TargetsTheLiveWorkflow closed for
// Resume, for Abort's StatusRunning/StatusPending branch specifically
// (its StatusAwaitingHuman branch already delegates to the now-fixed
// Resume, so it was covered incidentally — this branch, dbos.CancelWorkflow,
// was not).
//
// A wrong-target cancel cannot be detected by checking RunStore state
// alone: Abort unconditionally writes StatusAborted to aim_cycle_runs
// regardless of whether the underlying dbos.CancelWorkflow call actually
// reached the live workflow — the same blind spot that let the Resume bug
// hide for so long (a send/cancel to a dead workflow ID returns no error).
// The only way to observe whether the *correct* workflow was actually
// cancelled is behavioural: if Abort wrongly cancelled the dead original,
// the live (retried) workflow, unaffected, will run its next step to
// completion once unblocked; if Abort correctly cancelled the live one,
// that next step must never run.
func TestDBOSEngine_Abort_AfterRetry_CancelsTheLiveWorkflow(t *testing.T) {
	var attempt atomic.Int32
	started := make(chan struct{})
	release := make(chan struct{})
	var afterRan atomic.Bool

	wf := &fakeWorkflow{name: "abort_after_retry_wf", steps: []aim.Step{
		fakeStep("flaky", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
			if attempt.Add(1) == 1 {
				return aim.StepOutput{}, errors.New("first attempt fails")
			}
			close(started)
			<-release
			return aim.StepOutput{Step: "flaky"}, nil
		}),
		fakeStep("after", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
			afterRan.Store(true)
			return aim.StepOutput{}, nil
		}),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "abort_after_retry_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}

	<-started // the retried (forked) workflow's "flaky" step is confirmed genuinely running

	if err := engine.Abort(t.Context(), run.ID); err != nil {
		t.Fatalf("abort: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)

	close(release) // let the blocked step body actually return
	time.Sleep(200 * time.Millisecond)

	if afterRan.Load() {
		t.Error("step \"after\" ran despite the run being aborted — Abort cancelled the wrong (dead original) workflow, not the live retried one")
	}
}

func TestDBOSEngine_ListRuns_ReturnsAllRunsForInstance(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	instanceID := uuid.New().String()
	run1, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start 1: %v", err)
	}
	awaitEngineStatus(t, engine, run1.ID, orchestration.StatusCompleted)

	run2, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start 2: %v", err)
	}
	awaitEngineStatus(t, engine, run2.ID, orchestration.StatusCompleted)

	runs, err := engine.ListRuns(t.Context(), "wf", instanceID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 2 {
		t.Fatalf("got %d runs, want 2", len(runs))
	}
}

func TestDBOSEngine_FindRunByBatch_ResolvesTheOpenGate(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "the-batch-id")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	found, err := engine.FindRunByBatch(t.Context(), "the-batch-id")
	if err != nil {
		t.Fatalf("find by batch: %v", err)
	}
	if found == nil || found.ID != run.ID {
		t.Fatalf("FindRunByBatch did not resolve the open gate: %+v", found)
	}
}

// ── retry (Part C3 — via dbos.ForkWorkflow, confirmed by direct probe) ───────

func countingStep(name string, gate bool, batchID string, count *atomic.Int32) aim.Step {
	return fakeStep(name, gate, batchID, func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		count.Add(1)
		return aim.StepOutput{BatchID: batchID}, nil
	})
}

var errStepThree = errors.New("step three: transient failure")

func TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure(t *testing.T) {
	var count1, count2, count3 atomic.Int32
	failOnce := fakeStep("step_three", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		if count3.Add(1) == 1 {
			return aim.StepOutput{}, errStepThree
		}
		return aim.StepOutput{Step: "step_three"}, nil
	})
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		countingStep("step_one", true, "batch-1", &count1),
		countingStep("step_two", true, "batch-2", &count2),
		failOnce,
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "step_one")
	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume gate one: %v", err)
	}
	awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "step_two")
	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume gate two: %v", err)
	}

	failed := awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
	if got := count1.Load(); got != 1 {
		t.Fatalf("step_one ran %d times before failure, want 1", got)
	}
	if got := count2.Load(); got != 1 {
		t.Fatalf("step_two ran %d times before failure, want 1", got)
	}
	if got := count3.Load(); got != 1 {
		t.Fatalf("step_three ran %d times before failing, want 1", got)
	}
	if !strings.Contains(failed.Error, "step three") && !strings.Contains(failed.Error, "step_three") {
		t.Fatalf("run.Error = %q, want it to mention the failing step", failed.Error)
	}
	// The failed step's own row must reflect the failure too — found missing
	// by manual testing against a real cycle, not by this suite originally:
	// recordFailure set only the run-level Status/Error, leaving
	// run.Steps[stepThree] at whatever status it had before (typically
	// "pending", since a step that errors never reaches recordStepDone). The
	// run panel only renders a step's own error line when that step's own
	// Status is "failed" (aim_run_panel.templ), so this silently hid the
	// failure at the step-timeline level even though the header was correct.
	failedStep := stepIn(t, failed, "step_three")
	if failedStep.Status != "failed" {
		t.Errorf("step_three.Status = %q, want failed", failedStep.Status)
	}
	if !strings.Contains(failedStep.Error, "transient failure") {
		t.Errorf("step_three.Error = %q, want it to contain the actual error", failedStep.Error)
	}

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}

	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if got := count1.Load(); got != 1 {
		t.Errorf("step_one ran %d times after retry, want still 1 — ForkWorkflow must not re-execute it", got)
	}
	if got := count2.Load(); got != 1 {
		t.Errorf("step_two ran %d times after retry, want still 1 — ForkWorkflow must not re-execute it", got)
	}
	if got := count3.Load(); got != 2 {
		t.Errorf("step_three ran %d times total, want 2 (the original failure plus the retry)", got)
	}
}

// TestDBOSEngine_Retry_MutationCheck_WrongStartStepFailsTheAbove documents a
// manual verification, not an automated one — see the comment.
//
// Performed by hand: forced firstIncompleteStepIndex to always return 0
// (`return 0, nil` right after fetching DBOS's step list). Result:
// TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure failed — not on
// a counter mismatch, but by timing out with the run stuck at
// awaiting_human: ForkWorkflow with StartStep=0 replayed step_one from
// scratch, and because its result was never carried "forward" the way
// harden-aim-execution's ADK-specific machinery had to fake, the gate
// after it genuinely re-opened, waiting for a review of what looked like
// new work. That failure mode is a direct demonstration that StartStep's
// value is load-bearing, not incidental. Reverting restored the passing
// test.
// TestDBOSEngine_Resume_AfterRetry_TargetsTheLiveWorkflow is a regression
// test for a real bug found by manual testing (approving a real gate on a
// once-retried run): dbos.ForkWorkflow always mints a new DBOS-internal
// workflow ID for the retried attempt (design.md, probe 1), but Resume,
// Replan, and Abort all addressed runID unconditionally — which stops
// being the live workflow's ID the instant a retry succeeds. The practical
// symptom: dbos.Send to the now-ERROR'd original workflow returns no
// error, so nothing here looked wrong from the caller's side, while the
// actually-parked live (forked) workflow waited on Recv until
// AbandonGatesAfter elapsed, having received nothing.
//
// Every fixture elsewhere in this file that combines a gate with Retry
// (TestDBOSEngine_Retry_SkipsCompletedSteps_ResumesAtFailure) resolves its
// gates *before* the step that ever fails, never after a retry — so this
// exact combination, fail before a gate then retry into reaching one, was
// untested until now.
func TestDBOSEngine_Resume_AfterRetry_TargetsTheLiveWorkflow(t *testing.T) {
	var gateAttempts atomic.Int32
	wf := &fakeWorkflow{name: "retry_then_gate_wf", steps: []aim.Step{
		fakeStep("gate", true, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
			if gateAttempts.Add(1) == 1 {
				return aim.StepOutput{}, errors.New("first attempt fails before ever reaching the gate")
			}
			return aim.StepOutput{Step: "gate", BatchID: "batch-1"}, nil
		}),
		fakeStep("after_gate", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "retry_then_gate_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("retry: %v", err)
	}

	// The retry's forked workflow now runs "gate" a second time, succeeds,
	// and opens a real gate — inside the forked workflow, not the
	// original.
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}

	// Before the fix, this hung until AbandonGatesAfter (newEngine's 1h
	// default) because Resume's Send targeted the dead original workflow —
	// awaitEngineStatus's 10s deadline turns that into a clear failure
	// instead of the test itself hanging for an hour.
	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	if stepIn(t, done, "gate").GateOutcome != orchestration.GateCommitted {
		t.Errorf("gate outcome = %q, want committed", stepIn(t, done, "gate").GateOutcome)
	}
	if stepIn(t, done, "after_gate").Status != "done" {
		t.Errorf("after_gate did not run: %+v", done.Steps)
	}
}

// TestDBOSEngine_Retry_SecondFailure_CanBeRetriedAgain closes a gap
// referenced as planned in design.md but never actually written: every
// other retry test here forks exactly once. This one fails at "flaky_one",
// retries (forking from the original — flaky_one succeeds this time),
// fails at a *different* step ("flaky_two"), and retries a second time —
// which must fork from the *first retry's* forked workflow (which has
// flaky_one's success recorded), not from the original (which does not).
//
// The two flaky steps, not one, are what make a wrong second fork
// observable at all: if flaky_one and flaky_two were the same step,
// forking from the original vs. the first retry's fork would look
// identical (both lineages agree on "flaky is not yet done" at that
// point), and a test built that way would pass even with the bug
// reintroduced — confirmed by writing that version first, mutating the
// fix, and watching it pass when it should have failed. With two distinct
// steps, forking from the wrong (original) lineage on the second retry
// would redundantly re-run flaky_one, which only the first retry's fork
// ever actually completed.
func TestDBOSEngine_Retry_SecondFailure_CanBeRetriedAgain(t *testing.T) {
	var countOne, countOneFlaky, countTwoFlaky, countThree atomic.Int32
	flakyOne := fakeStep("flaky_one", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		if countOneFlaky.Add(1) == 1 {
			return aim.StepOutput{}, errors.New("flaky_one: first attempt fails")
		}
		return aim.StepOutput{Step: "flaky_one"}, nil
	})
	flakyTwo := fakeStep("flaky_two", false, "", func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		if countTwoFlaky.Add(1) == 1 {
			return aim.StepOutput{}, errors.New("flaky_two: first attempt fails")
		}
		return aim.StepOutput{Step: "flaky_two"}, nil
	})
	wf := &fakeWorkflow{name: "second_retry_wf", steps: []aim.Step{
		countingStep("step_one", false, "", &countOne),
		flakyOne,
		flakyTwo,
		countingStep("step_last", false, "", &countThree),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "second_retry_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	// Original workflow: step_one succeeds, flaky_one fails. Never reaches
	// flaky_two.
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
	if got := countOne.Load(); got != 1 {
		t.Fatalf("step_one ran %d times before first failure, want 1", got)
	}

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("first retry: %v", err)
	}
	// First retry's fork: skips step_one (already done), flaky_one
	// succeeds this time, flaky_two fails. This fork is now the only
	// lineage where flaky_one's success is recorded.
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
	if got := countOne.Load(); got != 1 {
		t.Fatalf("step_one ran %d times after first retry, want still 1 — ForkWorkflow must not re-execute it", got)
	}
	if got := countOneFlaky.Load(); got != 2 {
		t.Fatalf("flaky_one ran %d times after first retry, want 2 (original failure + this fork's success)", got)
	}
	if got := countTwoFlaky.Load(); got != 1 {
		t.Fatalf("flaky_two ran %d times after first retry, want 1", got)
	}

	if err := engine.Retry(t.Context(), run.ID); err != nil {
		t.Fatalf("second retry: %v", err)
	}
	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if got := countOne.Load(); got != 1 {
		t.Errorf("step_one ran %d times total, want still 1", got)
	}
	if got := countOneFlaky.Load(); got != 2 {
		t.Errorf("flaky_one ran %d times total, want still 2 — a second retry forking from the original (not the first retry's fork) would redundantly re-run it a third time", got)
	}
	if got := countTwoFlaky.Load(); got != 2 {
		t.Errorf("flaky_two ran %d times total, want 2 (one failure + the succeeding second retry)", got)
	}
	if got := countThree.Load(); got != 1 {
		t.Errorf("step_last ran %d times, want 1", got)
	}
	if stepIn(t, done, "step_last").Status != "done" {
		t.Errorf("step_last not done: %+v", done.Steps)
	}
}

func TestDBOSEngine_Retry_MutationCheck_WrongStartStepFailsTheAbove(t *testing.T) {
	t.Skip("documentation only — see comment; not automatable without a build tag solely for this purpose")
}

// TestDBOSEngine_AbandonedGate_ReleasesTheRunAndFreesTheConcurrencySlot is
// the DBOS-era version of a check `instrument-cycle-gates` originally
// verified by hand against a real 2026-06-02 stale row in the (since
// dropped — see migration 036, then 039) legacy engine's run table. That
// row no longer exists — both tables it ever lived in were deliberately
// dropped across the ADK and DBOS cutovers — so it cannot literally be
// re-swept. What matters is the property it was checking: an abandoned
// gate must not permanently wedge its instance's concurrency slot. That
// property had zero automated coverage under DBOSEngine specifically
// (errGateAbandoned, workflow.go, was reachable only by waiting out a real
// AbandonGatesAfter in production) until this test.
func TestDBOSEngine_AbandonedGate_ReleasesTheRunAndFreesTheConcurrencySlot(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("gate_one", true, "batch-1"),
	}}
	const abandonAfter = 300 * time.Millisecond
	engine := newEngineWithConfig(t, abandonAfter, wf)

	concurrencyKey := uuid.New().String()
	run, err := engine.StartRun(t.Context(), "wf", concurrencyKey, nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "gate_one")

	// Nobody ever calls Resume. Wait past AbandonGatesAfter for DBOS's own
	// Recv timeout to fire.
	abandoned := awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
	if abandoned.Error != "human review abandoned" {
		t.Errorf("run.Error = %q, want %q", abandoned.Error, "human review abandoned")
	}
	gate := stepIn(t, abandoned, "gate_one")
	if gate.GateOutcome != orchestration.GateAbandoned {
		t.Errorf("gate_one.GateOutcome = %q, want %q", gate.GateOutcome, orchestration.GateAbandoned)
	}
	if gate.GateClearedAt == nil {
		t.Error("gate_one.GateClearedAt not set on abandonment")
	}

	// The actual property this test exists to prove: the same
	// instance/concurrency key can start a brand new cycle. Before this
	// path correctly marked the run StatusFailed, an abandoned gate would
	// leave the run at awaiting_human forever (aim_cycle_runs' partial
	// unique index covers pending/running/awaiting_human), and this
	// second StartRun would fail with ErrAlreadyActive.
	second, err := engine.StartRun(t.Context(), "wf", concurrencyKey, nil)
	if err != nil {
		t.Fatalf("start second run after abandonment: %v (concurrency slot not freed)", err)
	}
	if second.ID == run.ID {
		t.Fatal("second StartRun returned the same run id as the abandoned one")
	}
}

func TestDBOSEngine_Retry_NonFailedRun_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if err := engine.Retry(t.Context(), run.ID); err == nil {
		t.Fatal("expected retry of a completed (non-failed) run to error")
	}
}

// TestDBOSEngine_GetRun_CostIndependentOfGateParkDuration closes the last
// open item from adopt-dbos-dynamic-aim's tasks.md §3: does a run panel
// GetRun call cost more while a gate has been parked a long time than while
// it has been parked briefly?
//
// The doc comment above GetRun already states the answer by construction —
// "GetRun ... answers cross-run questions from RunStore only" — a single
// Postgres row read by primary key that never calls into DBOS (no Recv, no
// GetWorkflowSteps, nothing park-duration-dependent).
//
// Verifying that empirically surfaced a real, reproducible effect worth
// recording honestly rather than hiding behind a generous threshold: a
// batch of GetRun calls issued shortly after ~2s of idle time is
// consistently ~1.5-3x slower (steady-state, excluding each batch's own
// first call) than a batch issued after only a few ms of idle time. Traced
// with a control experiment (not kept as a permanent test — see this
// commit's description): the identical slowdown reproduces on a
// *completed* run's GetRun calls with no gate, no DBOS Recv, and no park
// mechanism involved at all. That rules out DBOS's own park/Recv machinery
// as the cause — it is a generic idle-period cost (most likely Go's DB
// connection pool, or OS-level power management on the machine running the
// test), identical whether or not a gate is open. It also means the
// original concern this task named cannot actually manifest: a
// production gate stays open for hours to weeks, during which the pool's
// idle-reconnect cost (double-digit milliseconds at worst, observed above)
// is paid at most once, not repeatedly, and is irrelevant next to a human
// review taking minutes.
//
// The assertion below is deliberately not "no difference" (falsified by the
// finding above) but "difference stays in the idle-reconnect regime, not a
// regime that scales with park duration itself" — checked by parking a
// second time for 10x longer (20s) than the first (2s) and confirming the
// steady-state cost does not scale accordingly; if GetRun's own cost grew
// with park duration, 10x the park time should show materially more than
// noise-level extra cost, not the same idle-reconnect-sized bump twice.
func TestDBOSEngine_GetRun_CostIndependentOfGateParkDuration(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("gate_one", true, "batch-1"),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStep(t, engine, run.ID, orchestration.StatusAwaitingHuman, "gate_one")

	// Warm up: exclude connection-pool/cache effects from the first sample.
	if _, err := engine.GetRun(t.Context(), run.ID); err != nil {
		t.Fatalf("warmup GetRun: %v", err)
	}

	const samples = 20

	// Returns per-call durations, not just an average — needed to tell
	// apart "every call in this batch is slower" (would indicate cost
	// actually scales with park duration) from "only the first call after
	// an idle gap is slower" (a connection-pool/scheduler artifact of the
	// *gap*, unrelated to how long the gate itself has been parked).
	measure := func() []time.Duration {
		out := make([]time.Duration, samples)
		for i := 0; i < samples; i++ {
			start := time.Now()
			if _, err := engine.GetRun(t.Context(), run.ID); err != nil {
				t.Fatalf("GetRun while parked: %v", err)
			}
			out[i] = time.Since(start)
		}
		return out
	}
	steadyState := func(d []time.Duration) time.Duration {
		var total time.Duration
		for _, v := range d[1:] { // drop the first call in the batch
			total += v
		}
		return total / time.Duration(len(d)-1)
	}

	time.Sleep(2 * time.Second)
	shortPark := measure() // gate parked ~2s at this point

	time.Sleep(20 * time.Second)
	longPark := measure() // gate parked ~22s at this point (10x the prior gap)

	shortAvg, longAvg := steadyState(shortPark), steadyState(longPark)

	// Both batches pay an idle-reconnect cost on their own first call
	// (excluded by steadyState) and, per the finding above, a modest
	// (~1.5-3x baseline) steady-state bump that reproduces identically with
	// no gate involved at all. What this assertion actually checks: a 10x
	// longer park (22s vs 2s) does not produce a materially larger bump
	// than a 2x-3x one — i.e., the cost is idle-gap noise, not a function
	// of park duration. A generous 8x bound: comfortably above the
	// idle-reconnect noise band observed in practice (up to ~3x), but would
	// still catch a real park-duration-scaling regression (e.g. a future
	// change that made GetRun read DBOS's own growing step history).
	if longAvg > shortAvg*8 {
		t.Errorf("GetRun steady-state latency scaled with park duration, not just idle-gap noise: 2s-park=%s 22s-park=%s (>8x) short-batch=%v long-batch=%v",
			shortAvg, longAvg, shortPark, longPark)
	}
	t.Logf("GetRun latency — 2s-park batch=%v steady-state=%s; 22s-park batch=%v steady-state=%s",
		shortPark, shortAvg, longPark, longAvg)
}

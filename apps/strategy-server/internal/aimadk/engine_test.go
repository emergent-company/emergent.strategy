package aimadk_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimadk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// fakeWorkflow satisfies orchestration.Workflow — the parameter type
// ADKEngine.Register shares with the legacy engine — plus CycleSteps(),
// which is what ADKEngine actually uses. Steps()/ConcurrencyKey() are never
// called by ADKEngine; they exist only to satisfy the interface.
type fakeWorkflow struct {
	name  string
	steps []aim.Step
}

func (w *fakeWorkflow) Name() string                             { return w.name }
func (w *fakeWorkflow) Steps() []orchestration.Step              { return nil }
func (w *fakeWorkflow) ConcurrencyKey(*orchestration.Run) string { return "" }
func (w *fakeWorkflow) CycleSteps() []aim.Step                   { return w.steps }

// fakeStep builds a step that stages batchID by default. runs is optional
// (variadic so most call sites can omit it) and overrides the body entirely
// when supplied.
func fakeStep(name string, gate bool, batchID string, runs ...func(context.Context, aim.StepInput) (aim.StepOutput, error)) aim.Step {
	run := func(context.Context, aim.StepInput) (aim.StepOutput, error) {
		return aim.StepOutput{BatchID: batchID}, nil
	}
	if len(runs) > 0 {
		run = runs[0]
	}
	return aim.Step{Name: name, HumanGate: gate, Run: run}
}

func newEngine(t *testing.T, workflows ...*fakeWorkflow) *aimadk.ADKEngine {
	t.Helper()

	db := database.TestDB(t)
	store := aimadk.NewRunStore(db)
	sessions := adk.NewSessionStore(db)
	engine := aimadk.NewADKEngine(store, sessions, aimadk.ADKEngineConfig{AppName: "test-app"})

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

// awaitStatus polls GetRun until it reaches want, since ADKEngine drives
// execution in a background goroutine.
func awaitEngineStatus(t *testing.T, engine *aimadk.ADKEngine, runID uuid.UUID, want orchestration.RunStatus) *orchestration.Run {
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

func TestADKEngine_UngatedWorkflow_CompletesWithoutPausing(t *testing.T) {
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

// TestADKEngine_GatedStep_PausesThenCommits is the core lifecycle: a gate
// opens, the run reports awaiting_human with the staged batch, and committing
// advances to the next step and on to completion.
func TestADKEngine_GatedStep_PausesThenCommits(t *testing.T) {
	wf := &fakeWorkflow{name: "gated_wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1", func(_ context.Context, in aim.StepInput) (aim.StepOutput, error) {
			return aim.StepOutput{BatchID: "batch-1", Meta: map[string]any{"llm_used": true, "input_tokens": 42}}, nil
		}),
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf)

	instanceID := uuid.New().String()
	run, err := engine.StartRun(t.Context(), "gated_wf", instanceID, map[string]any{"instance_id": instanceID})
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	paused := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)
	draft := stepIn(t, paused, "draft")
	if draft.BatchID != "batch-1" {
		t.Errorf("BatchID = %q, want batch-1", draft.BatchID)
	}
	if draft.GateOpenedAt == nil {
		t.Fatal("GateOpenedAt not recorded when the gate opened")
	}
	if got, ok := draft.Meta["llm_used"]; !ok || got != true {
		t.Errorf("Meta[llm_used] = %v, step metadata was not projected", got)
	}

	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	draftAfter := stepIn(t, done, "draft")
	if draftAfter.GateOutcome != orchestration.GateCommitted {
		t.Errorf("GateOutcome = %q, want %q", draftAfter.GateOutcome, orchestration.GateCommitted)
	}
	if draftAfter.GateClearedAt == nil {
		t.Error("GateClearedAt not recorded on commit")
	}
	if stepIn(t, done, "apply").Status != "done" {
		t.Error("apply did not run after commit")
	}
}

func TestADKEngine_GatedStep_Discard_AbortsRun(t *testing.T) {
	wf := &fakeWorkflow{name: "discard_wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "discard_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	if err := engine.Resume(t.Context(), run.ID, false); err != nil {
		t.Fatalf("resume: %v", err)
	}

	aborted := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)
	draft := stepIn(t, aborted, "draft")
	if draft.GateOutcome != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want %q", draft.GateOutcome, orchestration.GateDiscarded)
	}
	// "apply" is pre-populated as a pending placeholder from the start (so
	// the run panel can show the whole pipeline upfront), so its presence in
	// Steps proves nothing on its own — status is what shows it never ran.
	if got := stepIn(t, aborted, "apply").Status; got != "pending" {
		t.Errorf("apply status = %q after a discard, want pending (it must not have run)", got)
	}
}

func TestADKEngine_EmptyBatch_AutoAdvancesWithoutPausing(t *testing.T) {
	wf := &fakeWorkflow{name: "autoadvance_wf", steps: []aim.Step{
		fakeStep("maybe_gate", true, ""), // gated, stages nothing
		fakeStep("finish", false, ""),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "autoadvance_wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start run: %v", err)
	}

	done := awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
	if stepIn(t, done, "maybe_gate").GateOpenedAt != nil {
		t.Error("gate opened despite an empty batch")
	}
}

func TestADKEngine_StartRun_UnknownWorkflow_Errors(t *testing.T) {
	engine := newEngine(t)
	_, err := engine.StartRun(t.Context(), "no_such_workflow", uuid.New().String(), nil)
	if err == nil {
		t.Fatal("expected an error for an unregistered workflow")
	}
}

func TestADKEngine_StartRun_InvalidConcurrencyKey_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	_, err := engine.StartRun(t.Context(), "wf", "not-a-uuid", nil)
	if err == nil {
		t.Fatal("expected an error for a non-UUID concurrency key")
	}
}

func TestADKEngine_StartRun_SecondActiveRun_ReturnsErrAlreadyActive(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"), // stays open so the run is non-terminal
	}}
	engine := newEngine(t, wf)
	instanceID := uuid.New().String()

	first, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start first: %v", err)
	}
	awaitEngineStatus(t, engine, first.ID, orchestration.StatusAwaitingHuman)

	_, err = engine.StartRun(t.Context(), "wf", instanceID, nil)
	if !errors.Is(err, orchestration.ErrAlreadyActive) {
		t.Fatalf("start second: err = %v, want ErrAlreadyActive", err)
	}
}

func TestADKEngine_FindRunByBatch_ResolvesTheOpenGate(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-xyz")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	found, err := engine.FindRunByBatch(t.Context(), "batch-xyz")
	if err != nil {
		t.Fatalf("find by batch: %v", err)
	}
	if found == nil || found.ID != run.ID {
		t.Fatalf("found = %+v, want run %s", found, run.ID)
	}
}

func TestADKEngine_Resume_NonAwaitingRun_Errors(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if err := engine.Resume(t.Context(), run.ID, true); err == nil {
		t.Fatal("expected an error resuming a completed run")
	}
}

func TestADKEngine_Abort_WhileAwaitingHuman_IsADiscard(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
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
	if stepIn(t, aborted, "draft").GateOutcome != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want discarded", stepIn(t, aborted, "draft").GateOutcome)
	}
}

// TestADKEngine_Abort_WhileRunning_CancelsMidStep drives a step that blocks
// until its context is cancelled, aborts while it is blocked, and confirms
// the run ends up aborted rather than stuck "running" forever. The step body
// has only the ctx.Done() exit — no second, racing way to return — so a pass
// here means the abort's cancellation is what ended it, not a coincidence of
// goroutine scheduling.
func TestADKEngine_Abort_WhileRunning_CancelsMidStep(t *testing.T) {
	started := make(chan struct{})

	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("slow", false, "", func(ctx context.Context, _ aim.StepInput) (aim.StepOutput, error) {
			close(started)
			<-ctx.Done()
			return aim.StepOutput{}, ctx.Err()
		}),
	}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}

	select {
	case <-started:
	case <-time.After(5 * time.Second):
		t.Fatal("step never started")
	}

	if err := engine.Abort(t.Context(), run.ID); err != nil {
		t.Fatalf("abort: %v", err)
	}

	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)
}

func TestADKEngine_Retry_ReturnsAnExplicitError(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)

	if err := engine.Retry(t.Context(), run.ID); err == nil {
		t.Fatal("expected retry to be explicitly unimplemented, got nil error")
	}
}

func TestADKEngine_ListRuns_ReturnsAllRunsForInstance(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("s", false, "")}}
	engine := newEngine(t, wf)
	instanceID := uuid.New().String()

	first, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start first: %v", err)
	}
	awaitEngineStatus(t, engine, first.ID, orchestration.StatusCompleted)

	second, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start second: %v", err)
	}
	awaitEngineStatus(t, engine, second.ID, orchestration.StatusCompleted)

	runs, err := engine.ListRuns(t.Context(), "wf", instanceID)
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 2 {
		t.Fatalf("got %d runs, want 2", len(runs))
	}
}

// notAIMWorkflow satisfies orchestration.Workflow but not cycleStepsProvider
// — the shape of a workflow this engine cannot run, exercising Register's
// fallback path.
type notAIMWorkflow struct{ name string }

func (w *notAIMWorkflow) Name() string                             { return w.name }
func (w *notAIMWorkflow) Steps() []orchestration.Step              { return nil }
func (w *notAIMWorkflow) ConcurrencyKey(*orchestration.Run) string { return "" }

func TestADKEngine_Register_SkipsWorkflowWithoutCycleSteps(t *testing.T) {
	db := database.TestDB(t)
	store := aimadk.NewRunStore(db)
	sessions := adk.NewSessionStore(db)
	engine := aimadk.NewADKEngine(store, sessions, aimadk.ADKEngineConfig{AppName: "test-app"})

	engine.Register(&notAIMWorkflow{name: "unsupported"})
	if err := engine.Start(t.Context()); err != nil {
		t.Fatalf("start: %v", err)
	}
	defer func() { _ = engine.Stop(t.Context()) }()

	_, err := engine.StartRun(t.Context(), "unsupported", uuid.New().String(), nil)
	if err == nil {
		t.Fatal("expected StartRun to fail for a workflow Register could not use")
	}
}

// TestADKEngine_Register_AcceptsTheRealAIMCycleWorkflow closes the loop on
// the structural interface check in Register: it is not enough that a test
// fake satisfies cycleStepsProvider, since the whole point is that
// domain/aim.CycleWorkflow — the value cmd_serve.go actually registers — does
// too, unmodified.
func TestADKEngine_Register_AcceptsTheRealAIMCycleWorkflow(t *testing.T) {
	db := database.TestDB(t)
	store := aimadk.NewRunStore(db)
	sessions := adk.NewSessionStore(db)
	engine := aimadk.NewADKEngine(store, sessions, aimadk.ADKEngineConfig{AppName: "test-app"})

	real := aim.NewCycleWorkflow(nil, nil)
	engine.Register(real)
	if err := engine.Start(t.Context()); err != nil {
		t.Fatalf("start: %v", err)
	}
	defer func() { _ = engine.Stop(t.Context()) }()

	// StartRun will fail once a real step body actually runs (svc is nil),
	// but reaching that failure — rather than "unknown workflow" — proves
	// Register accepted it and built a working graph + runner.
	run, err := engine.StartRun(t.Context(), aim.WorkflowName, uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start run: %v (Register likely rejected the real workflow)", err)
	}

	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
}

// ── abandoned-gate sweep ──────────────────────────────────────────────────────

func newSweepEngine(t *testing.T, cfg aimadk.ADKEngineConfig, workflows ...*fakeWorkflow) *aimadk.ADKEngine {
	t.Helper()

	db := database.TestDB(t)
	store := aimadk.NewRunStore(db)
	sessions := adk.NewSessionStore(db)
	if cfg.AppName == "" {
		cfg.AppName = "test-app"
	}
	engine := aimadk.NewADKEngine(store, sessions, cfg)

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

func TestADKEngine_Sweep_ReleasesRunParkedPastThreshold(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newSweepEngine(t, aimadk.ADKEngineConfig{
		AbandonGatesAfter: time.Nanosecond, // everything parked is past the threshold
		SweepInterval:     50 * time.Millisecond,
	}, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	released := awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)
	draft := stepIn(t, released, "draft")
	if draft.GateOutcome != orchestration.GateAbandoned {
		t.Errorf("GateOutcome = %q, want %q", draft.GateOutcome, orchestration.GateAbandoned)
	}
	if draft.GateClearedAt == nil {
		t.Error("GateClearedAt not recorded when the gate was released")
	}
	if released.Error == "" {
		t.Error("released run carries no error explaining why")
	}
}

func TestADKEngine_Sweep_ReleaseIsDistinctFromDiscard(t *testing.T) {
	// Two steps: a discard is only enforced by the node after the gate, per
	// aim_graph.go's design, so a single gated step with nothing downstream
	// would complete regardless of the reviewer's verdict.
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{
		fakeStep("draft", true, "batch-1"),
		fakeStep("apply", false, ""),
	}}
	engine := newEngine(t, wf) // no sweep configured

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)

	if err := engine.Resume(t.Context(), run.ID, false); err != nil {
		t.Fatalf("resume: %v", err)
	}
	aborted := awaitEngineStatus(t, engine, run.ID, orchestration.StatusAborted)
	if got := stepIn(t, aborted, "draft").GateOutcome; got != orchestration.GateDiscarded {
		t.Errorf("GateOutcome = %q, want %q — a reviewer's discard must not read as abandoned", got, orchestration.GateDiscarded)
	}
}

func TestADKEngine_Sweep_LeavesRunWithinThresholdAlone(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newSweepEngine(t, aimadk.ADKEngineConfig{
		AbandonGatesAfter: time.Hour,
		SweepInterval:     50 * time.Millisecond,
	}, wf)

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)
	time.Sleep(200 * time.Millisecond) // several sweep intervals

	still, err := engine.GetRun(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if still.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("run within the threshold was released: status %s", still.Status)
	}

	if err := engine.Resume(t.Context(), run.ID, true); err != nil {
		t.Fatalf("resume after sweep interval passed: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusCompleted)
}

func TestADKEngine_Sweep_DisabledByDefault(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newSweepEngine(t, aimadk.ADKEngineConfig{}, wf) // AbandonGatesAfter unset

	run, err := engine.StartRun(t.Context(), "wf", uuid.New().String(), nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)
	time.Sleep(200 * time.Millisecond)

	still, err := engine.GetRun(t.Context(), run.ID)
	if err != nil {
		t.Fatalf("get run: %v", err)
	}
	if still.Status != orchestration.StatusAwaitingHuman {
		t.Fatalf("sweep ran while disabled: status %s", still.Status)
	}
}

func TestADKEngine_Sweep_FreesTheConcurrencySlot(t *testing.T) {
	wf := &fakeWorkflow{name: "wf", steps: []aim.Step{fakeStep("draft", true, "batch-1")}}
	engine := newSweepEngine(t, aimadk.ADKEngineConfig{
		AbandonGatesAfter: time.Nanosecond,
		SweepInterval:     50 * time.Millisecond,
	}, wf)

	instanceID := uuid.New().String()
	run, err := engine.StartRun(t.Context(), "wf", instanceID, nil)
	if err != nil {
		t.Fatalf("start: %v", err)
	}
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusAwaitingHuman)
	awaitEngineStatus(t, engine, run.ID, orchestration.StatusFailed)

	active, err := engine.ActiveRun(t.Context(), "wf", instanceID)
	if err != nil {
		t.Fatalf("active run: %v", err)
	}
	if active != nil {
		t.Fatalf("instance still has an active run after release: %s (%s)", active.ID, active.Status)
	}

	// And a fresh cycle must actually be startable now.
	if _, err := engine.StartRun(t.Context(), "wf", instanceID, nil); err != nil {
		t.Fatalf("start after sweep: %v", err)
	}
}

package adk_test

import (
	"context"
	"errors"
	"slices"
	"sync"
	"testing"

	"google.golang.org/adk/v2/agent"
	"google.golang.org/adk/v2/runner"
	adksession "google.golang.org/adk/v2/session"
	adkworkflow "google.golang.org/adk/v2/workflow"
	"google.golang.org/genai"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/database"
)

const (
	testAppName    = "strategy-server"
	testUserID     = "user-1"
	testSessionID  = "aim-cycle-1"
	testInstanceID = "11111111-1111-1111-1111-111111111111"
)

// ── harness ───────────────────────────────────────────────────────────────────

// stepRecorder records which steps ran, in order, and how many times. Call
// counts are the point: the two-node gate design exists to stop a work node
// running twice, and only a count can show that.
type stepRecorder struct {
	mu    sync.Mutex
	calls []string
}

func (r *stepRecorder) record(name string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls = append(r.calls, name)
}

func (r *stepRecorder) sequence() []string {
	r.mu.Lock()
	defer r.mu.Unlock()
	return slices.Clone(r.calls)
}

func (r *stepRecorder) count(name string) int {
	r.mu.Lock()
	defer r.mu.Unlock()
	n := 0
	for _, c := range r.calls {
		if c == name {
			n++
		}
	}
	return n
}

// fakeStep is a step that stages batchID and records that it ran. An empty
// batchID means "staged nothing", which is what drives gate auto-advance.
func fakeStep(rec *stepRecorder, name string, gate bool, batchID string) adk.AIMStep {
	return adk.AIMStep{
		Name:      name,
		HumanGate: gate,
		Run: func(_ context.Context, _ adk.AIMStepInput) (adk.AIMStepResult, error) {
			rec.record(name)
			return adk.AIMStepResult{BatchID: batchID}, nil
		},
	}
}

type cycleHarness struct {
	t      *testing.T
	runner *runner.Runner
}

// newCycleHarness builds the graph over a real bun-backed session store, so
// pause and resume cross the database exactly as they will in production.
func newCycleHarness(t *testing.T, state map[string]any, steps []adk.AIMStep) *cycleHarness {
	t.Helper()

	root, err := adk.BuildAIMGraph("aim_cycle", steps)
	if err != nil {
		t.Fatalf("BuildAIMGraph: %v", err)
	}

	store := adk.NewSessionStore(database.TestDB(t))
	if _, err := store.Create(t.Context(), &adksession.CreateRequest{
		AppName:   testAppName,
		UserID:    testUserID,
		SessionID: testSessionID,
		State:     state,
	}); err != nil {
		t.Fatalf("create session: %v", err)
	}

	r, err := runner.New(runner.Config{
		AppName:        testAppName,
		Agent:          root,
		SessionService: store,
	})
	if err != nil {
		t.Fatalf("runner.New: %v", err)
	}

	return &cycleHarness{t: t, runner: r}
}

func (h *cycleHarness) run(msg *genai.Content) ([]*adksession.Event, error) {
	h.t.Helper()

	var events []*adksession.Event
	for ev, err := range h.runner.Run(h.t.Context(), testUserID, testSessionID, msg, agent.RunConfig{}) {
		if err != nil {
			return events, err
		}
		events = append(events, ev)
	}
	return events, nil
}

// start kicks off the cycle with an ordinary user turn.
func (h *cycleHarness) start() ([]*adksession.Event, error) {
	return h.run(genai.NewContentFromText("run the cycle", genai.RoleUser))
}

// reply answers an outstanding gate, mimicking what the review handler will
// submit: a FunctionResponse addressed to the interrupt that paused the run.
func (h *cycleHarness) reply(interruptID string, response map[string]any) ([]*adksession.Event, error) {
	return h.run(&genai.Content{
		Role: genai.RoleUser,
		Parts: []*genai.Part{{
			FunctionResponse: &genai.FunctionResponse{
				ID:       interruptID,
				Name:     adkworkflow.WorkflowInputFunctionCallName,
				Response: response,
			},
		}},
	})
}

// pendingReview returns the review prompt a run paused on, if any.
func pendingReview(events []*adksession.Event) *adksession.RequestInput {
	for _, ev := range events {
		if ev != nil && ev.RequestedInput != nil {
			return ev.RequestedInput
		}
	}
	return nil
}

// startAndPause runs the cycle and asserts it stopped at a review gate,
// returning the prompt so the test can answer it.
func (h *cycleHarness) startAndPause() *adksession.RequestInput {
	h.t.Helper()

	events, err := h.start()
	if err != nil {
		h.t.Fatalf("run: unexpected error: %v", err)
	}
	req := pendingReview(events)
	if req == nil {
		h.t.Fatal("run did not pause for review")
	}
	return req
}

// ── construction ──────────────────────────────────────────────────────────────

func TestBuildAIMGraph_RejectsInvalidDefinitions(t *testing.T) {
	t.Parallel()

	ok := func(name string) adk.AIMStep {
		return adk.AIMStep{Name: name, Run: func(context.Context, adk.AIMStepInput) (adk.AIMStepResult, error) {
			return adk.AIMStepResult{}, nil
		}}
	}

	tests := []struct {
		name  string
		graph string
		steps []adk.AIMStep
	}{
		{"no name", "", []adk.AIMStep{ok("a")}},
		{"no steps", "aim_cycle", nil},
		{"step without name", "aim_cycle", []adk.AIMStep{ok("")}},
		{"step without run func", "aim_cycle", []adk.AIMStep{{Name: "a"}}},
		{"duplicate step names", "aim_cycle", []adk.AIMStep{ok("a"), ok("a")}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			t.Parallel()
			if _, err := adk.BuildAIMGraph(tc.graph, tc.steps); err == nil {
				t.Fatal("expected an error, got nil")
			}
		})
	}
}

// ── execution ─────────────────────────────────────────────────────────────────

func TestAIMGraph_UngatedStepsRunInOrder(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		fakeStep(rec, "align_portfolio", false, ""),
		fakeStep(rec, "snapshot_cycle", false, ""),
	})

	events, err := h.start()
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if req := pendingReview(events); req != nil {
		t.Fatalf("ungated cycle paused for review: %+v", req)
	}

	if got, want := h.stepSeq(rec), []string{"align_portfolio", "snapshot_cycle"}; !slices.Equal(got, want) {
		t.Errorf("step order = %v, want %v", got, want)
	}
}

func TestAIMGraph_GateStopsCycleBeforeNextStep(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		fakeStep(rec, "draft_assessment", true, "batch-1"),
		fakeStep(rec, "draft_calibration", true, "batch-2"),
	})

	req := h.startAndPause()

	if got := h.stepSeq(rec); !slices.Equal(got, []string{"draft_assessment"}) {
		t.Errorf("steps ran = %v, want only draft_assessment before review", got)
	}
	if req.InterruptID == "" {
		t.Error("review prompt has no InterruptID; the reply cannot be routed back")
	}

	// The reviewer needs the staged batch, not just prose.
	staged, ok := req.Payload.(adk.AIMStepResult)
	if !ok {
		t.Fatalf("review payload is %T, want adk.AIMStepResult", req.Payload)
	}
	if staged.BatchID != "batch-1" {
		t.Errorf("payload BatchID = %q, want %q", staged.BatchID, "batch-1")
	}
	if staged.Step != "draft_assessment" {
		t.Errorf("payload Step = %q, want %q", staged.Step, "draft_assessment")
	}
}

// TestAIMGraph_ApprovalDoesNotRerunTheApprovedStep is the reason the graph
// splits every gated step into a work node and a gate node.
//
// ADK's single-node HITL pattern re-runs the node body once the human answers.
// AIM steps call an LLM and stage a mutation batch before pausing, so under
// that pattern an approval would repeat the call and stage a second batch —
// silently, and at cost. The split exists to prevent that, and this test is
// what holds it in place.
func TestAIMGraph_ApprovalDoesNotRerunTheApprovedStep(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		fakeStep(rec, "draft_assessment", true, "batch-1"),
		fakeStep(rec, "snapshot_cycle", false, ""),
	})

	req := h.startAndPause()

	if _, err := h.reply(req.InterruptID, map[string]any{"committed": true}); err != nil {
		t.Fatalf("resume: %v", err)
	}

	if n := rec.count("draft_assessment"); n != 1 {
		t.Errorf("draft_assessment ran %d times across pause and resume, want exactly 1", n)
	}
	if n := rec.count("snapshot_cycle"); n != 1 {
		t.Errorf("snapshot_cycle ran %d times, want exactly 1 after approval", n)
	}
}

func TestAIMGraph_DiscardAbortsCycle(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		fakeStep(rec, "draft_assessment", true, "batch-1"),
		fakeStep(rec, "snapshot_cycle", false, ""),
	})

	req := h.startAndPause()

	_, err := h.reply(req.InterruptID, map[string]any{"committed": false})
	if !errors.Is(err, adk.ErrCycleDiscarded) {
		t.Fatalf("resume error = %v, want ErrCycleDiscarded", err)
	}
	if n := rec.count("snapshot_cycle"); n != 0 {
		t.Errorf("snapshot_cycle ran %d times after a discard, want 0", n)
	}
}

// TestAIMGraph_EmptyBatchAutoAdvances covers adapt_foundations, which often
// has nothing to change. A gate with no staged batch must not park the cycle
// on an empty prompt.
func TestAIMGraph_EmptyBatchAutoAdvances(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		fakeStep(rec, "adapt_foundations", true, ""), // gated, but stages nothing
		fakeStep(rec, "align_portfolio", false, ""),
	})

	events, err := h.start()
	if err != nil {
		t.Fatalf("run: %v", err)
	}
	if req := pendingReview(events); req != nil {
		t.Fatalf("paused for review despite an empty batch: %+v", req)
	}

	want := []string{"adapt_foundations", "align_portfolio"}
	if got := h.stepSeq(rec); !slices.Equal(got, want) {
		t.Errorf("step order = %v, want %v", got, want)
	}
}

// TestAIMGraph_UnrecognisedReplyFailsClosed guards the dangerous default.
// Treating a reply we cannot parse as approval would apply a batch nobody
// signed off on.
func TestAIMGraph_UnrecognisedReplyFailsClosed(t *testing.T) {
	tests := []struct {
		name     string
		response map[string]any
	}{
		{"missing verdict", map[string]any{"note": "looks fine"}},
		{"verdict is not a bool", map[string]any{"committed": "yes"}},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			rec := &stepRecorder{}
			h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
				fakeStep(rec, "draft_assessment", true, "batch-1"),
				fakeStep(rec, "snapshot_cycle", false, ""),
			})

			req := h.startAndPause()

			if _, err := h.reply(req.InterruptID, tc.response); err == nil {
				t.Fatal("expected an error for an unparseable reply, got nil")
			}
			if n := rec.count("snapshot_cycle"); n != 0 {
				t.Errorf("snapshot_cycle ran %d times on an unparseable reply, want 0", n)
			}
		})
	}
}

func TestAIMGraph_RequiresInstanceIDInSessionState(t *testing.T) {
	rec := &stepRecorder{}
	h := newCycleHarness(t, nil, []adk.AIMStep{
		fakeStep(rec, "draft_assessment", true, "batch-1"),
	})

	if _, err := h.start(); err == nil {
		t.Fatal("expected an error when instance_id is absent from session state")
	}
	if n := rec.count("draft_assessment"); n != 0 {
		t.Errorf("draft_assessment ran %d times without an instance, want 0", n)
	}
}

func TestAIMGraph_StepFailureStopsCycle(t *testing.T) {
	rec := &stepRecorder{}
	boom := errors.New("llm unavailable")

	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, []adk.AIMStep{
		{
			Name: "draft_assessment",
			Run: func(context.Context, adk.AIMStepInput) (adk.AIMStepResult, error) {
				rec.record("draft_assessment")
				return adk.AIMStepResult{}, boom
			},
		},
		fakeStep(rec, "snapshot_cycle", false, ""),
	})

	_, err := h.start()
	if !errors.Is(err, boom) {
		t.Fatalf("run error = %v, want it to wrap %v", err, boom)
	}
	if n := rec.count("snapshot_cycle"); n != 0 {
		t.Errorf("snapshot_cycle ran %d times after an upstream failure, want 0", n)
	}
}

// TestAIMGraph_StepHistorySurvivesGate is what snapshot_cycle depends on: it
// recovers the calibration decision by reading metadata recorded by steps that
// ran earlier in the cycle, several human gates back.
//
// Two of the three obvious ways to carry that history do not work.
// agent.Context.Actions() is nil inside a workflow node, and State.Set
// reports success while silently discarding the write. Only an emitted event
// carrying Actions.StateDelta survives a pause, so this test pins that: a
// regression would not fail loudly, it would quietly snapshot the wrong
// decision.
func TestAIMGraph_StepHistorySurvivesGate(t *testing.T) {
	var seen []adk.AIMStepResult

	steps := []adk.AIMStep{
		{
			Name:      "draft_calibration",
			HumanGate: true,
			Run: func(context.Context, adk.AIMStepInput) (adk.AIMStepResult, error) {
				return adk.AIMStepResult{
					BatchID: "batch-1",
					Meta:    map[string]any{"suggested_decision": "persevere"},
				}, nil
			},
		},
		{
			Name: "snapshot_cycle",
			Run: func(_ context.Context, in adk.AIMStepInput) (adk.AIMStepResult, error) {
				seen = in.Prior
				return adk.AIMStepResult{}, nil
			},
		},
	}

	h := newCycleHarness(t, map[string]any{adk.StateKeyInstanceID: testInstanceID}, steps)
	req := h.startAndPause()
	if _, err := h.reply(req.InterruptID, map[string]any{"committed": true}); err != nil {
		t.Fatalf("resume: %v", err)
	}

	if len(seen) != 1 {
		t.Fatalf("snapshot_cycle saw %d prior results, want 1: %+v", len(seen), seen)
	}
	if seen[0].Step != "draft_calibration" {
		t.Errorf("prior[0].Step = %q, want %q", seen[0].Step, "draft_calibration")
	}
	// The decision has to survive the JSON round-trip through the database,
	// not just the pause.
	if got := seen[0].Meta["suggested_decision"]; got != "persevere" {
		t.Errorf("prior[0].Meta[suggested_decision] = %v, want %q", got, "persevere")
	}
}

func TestAIMGraph_DeliversRunContextToSteps(t *testing.T) {
	var got adk.AIMStepInput

	steps := []adk.AIMStep{{
		Name: "adapt_strategy",
		Run: func(_ context.Context, in adk.AIMStepInput) (adk.AIMStepResult, error) {
			got = in
			return adk.AIMStepResult{}, nil
		},
	}}

	h := newCycleHarness(t, map[string]any{
		adk.StateKeyInstanceID: testInstanceID,
		adk.StateKeyRunID:      "run-42",
		adk.StateKeyParams:     map[string]any{"decision": "pivot"},
	}, steps)

	if _, err := h.start(); err != nil {
		t.Fatalf("run: %v", err)
	}

	if got.InstanceID != testInstanceID {
		t.Errorf("InstanceID = %q, want %q", got.InstanceID, testInstanceID)
	}
	if got.RunID != "run-42" {
		t.Errorf("RunID = %q, want %q", got.RunID, "run-42")
	}
	if got.Params["decision"] != "pivot" {
		t.Errorf("Params[decision] = %v, want %q", got.Params["decision"], "pivot")
	}
}

// stepSeq is a thin accessor kept on the harness so tests read as behaviour
// rather than bookkeeping.
func (h *cycleHarness) stepSeq(rec *stepRecorder) []string { return rec.sequence() }

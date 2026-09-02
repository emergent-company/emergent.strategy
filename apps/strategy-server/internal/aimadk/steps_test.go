package aimadk_test

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/aim"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/adk"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/aimadk"
)

func TestSteps_PreservesNameAndGate(t *testing.T) {
	t.Parallel()

	got := aimadk.Steps([]aim.Step{
		{Name: "draft_assessment", HumanGate: true},
		{Name: "align_portfolio"},
	})

	if len(got) != 2 {
		t.Fatalf("got %d steps, want 2", len(got))
	}
	if got[0].Name != "draft_assessment" || !got[0].HumanGate {
		t.Errorf("step 0 = %q gate=%v, want draft_assessment gate=true", got[0].Name, got[0].HumanGate)
	}
	if got[1].Name != "align_portfolio" || got[1].HumanGate {
		t.Errorf("step 1 = %q gate=%v, want align_portfolio gate=false", got[1].Name, got[1].HumanGate)
	}
}

// TestSteps_DeliversRunContext covers the one real translation: ADK session
// state is JSON, so the instance id crosses it as a string and has to be
// parsed back into a uuid before any step body sees it.
func TestSteps_DeliversRunContext(t *testing.T) {
	t.Parallel()

	instanceID := uuid.New()
	var seen aim.StepInput

	steps := aimadk.Steps([]aim.Step{{
		Name: "adapt_strategy",
		Run: func(_ context.Context, in aim.StepInput) (aim.StepOutput, error) {
			seen = in
			return aim.StepOutput{BatchID: "batch-1"}, nil
		},
	}})

	out, err := steps[0].Run(t.Context(), adk.AIMStepInput{
		RunID:      "run-7",
		InstanceID: instanceID.String(),
		Params:     map[string]any{"decision": "pivot"},
		Prior: []adk.AIMStepResult{{
			Step: "draft_calibration",
			Meta: map[string]any{"suggested_decision": "persevere"},
		}},
	})
	if err != nil {
		t.Fatalf("run: %v", err)
	}

	if seen.InstanceID != instanceID {
		t.Errorf("InstanceID = %v, want %v", seen.InstanceID, instanceID)
	}
	if seen.RunID != "run-7" {
		t.Errorf("RunID = %q, want %q", seen.RunID, "run-7")
	}
	if seen.Params["decision"] != "pivot" {
		t.Errorf("Params[decision] = %v, want pivot", seen.Params["decision"])
	}

	// snapshot_cycle reads prior step metadata to recover the decision, so the
	// history has to survive the crossing intact.
	if len(seen.Prior) != 1 {
		t.Fatalf("Prior has %d entries, want 1", len(seen.Prior))
	}
	if seen.Prior[0].Step != "draft_calibration" {
		t.Errorf("Prior[0].Step = %q, want draft_calibration", seen.Prior[0].Step)
	}
	if got := seen.Prior[0].Meta["suggested_decision"]; got != "persevere" {
		t.Errorf("Prior[0].Meta[suggested_decision] = %v, want persevere", got)
	}

	if out.BatchID != "batch-1" {
		t.Errorf("BatchID = %q, want batch-1", out.BatchID)
	}
}

// TestSteps_RealCycleFormsAValidGraph checks the actual AIM cycle, not a
// stand-in: the six real steps must satisfy the graph builder's rules (named,
// runnable, unique). Building the graph is enough — no step body is invoked —
// so this catches a malformed cycle definition without needing a live service.
func TestSteps_RealCycleFormsAValidGraph(t *testing.T) {
	t.Parallel()

	cycle := aim.NewCycleWorkflow(nil, nil).CycleSteps()
	if len(cycle) != 6 {
		t.Fatalf("AIM cycle has %d steps, want 6", len(cycle))
	}

	steps := aimadk.Steps(cycle)
	if _, err := adk.BuildAIMGraph(aim.WorkflowName, steps); err != nil {
		t.Fatalf("real AIM cycle does not form a valid ADK graph: %v", err)
	}

	// The gate layout is the part that changes execution shape, so pin it.
	gated := map[string]bool{}
	for _, s := range steps {
		gated[s.Name] = s.HumanGate
	}
	want := map[string]bool{
		"draft_assessment":  true,
		"draft_calibration": true,
		"adapt_strategy":    true,
		"adapt_foundations": true,
		"align_portfolio":   false,
		"snapshot_cycle":    false,
	}
	for name, wantGate := range want {
		gotGate, ok := gated[name]
		if !ok {
			t.Errorf("step %q missing from the cycle", name)
			continue
		}
		if gotGate != wantGate {
			t.Errorf("step %q HumanGate = %v, want %v", name, gotGate, wantGate)
		}
	}
}

func TestSteps_RejectsUnparseableInstanceID(t *testing.T) {
	t.Parallel()

	var ran bool
	steps := aimadk.Steps([]aim.Step{{
		Name: "draft_assessment",
		Run: func(context.Context, aim.StepInput) (aim.StepOutput, error) {
			ran = true
			return aim.StepOutput{}, nil
		},
	}})

	if _, err := steps[0].Run(t.Context(), adk.AIMStepInput{InstanceID: "not-a-uuid"}); err == nil {
		t.Fatal("expected an error for an unparseable instance id, got nil")
	}
	if ran {
		t.Error("step body ran despite an unparseable instance id")
	}
}

func TestSteps_PropagatesStepError(t *testing.T) {
	t.Parallel()

	boom := errors.New("llm unavailable")
	steps := aimadk.Steps([]aim.Step{{
		Name: "draft_assessment",
		Run: func(context.Context, aim.StepInput) (aim.StepOutput, error) {
			return aim.StepOutput{}, boom
		},
	}})

	_, err := steps[0].Run(t.Context(), adk.AIMStepInput{InstanceID: uuid.New().String()})
	if !errors.Is(err, boom) {
		t.Fatalf("err = %v, want it to wrap %v", err, boom)
	}
}

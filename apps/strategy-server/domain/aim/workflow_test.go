package aim

import (
	"testing"

	"github.com/google/uuid"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/orchestration"
)

// TestCycleWorkflow_Name verifies the canonical workflow name.
func TestCycleWorkflow_Name(t *testing.T) {
	wf := NewCycleWorkflow(nil) // nil svc — not called in this test
	if got := wf.Name(); got != WorkflowName {
		t.Errorf("want %q, got %q", WorkflowName, got)
	}
	if WorkflowName != "aim_cycle" {
		t.Errorf("WorkflowName must be 'aim_cycle', got %q", WorkflowName)
	}
}

// TestCycleWorkflow_Steps verifies the four steps and their HumanGate settings.
func TestCycleWorkflow_Steps(t *testing.T) {
	wf := NewCycleWorkflow(nil)
	steps := wf.Steps()

	if len(steps) != 4 {
		t.Fatalf("want 4 steps, got %d", len(steps))
	}

	expected := []struct {
		name      string
		humanGate bool
	}{
		{"draft_assessment", true},
		{"draft_calibration", true},
		{"apply_calibration", true},
		{"snapshot_cycle", false},
	}

	for i, e := range expected {
		if steps[i].Name != e.name {
			t.Errorf("step %d: want name %q, got %q", i, e.name, steps[i].Name)
		}
		if steps[i].HumanGate != e.humanGate {
			t.Errorf("step %q: want HumanGate=%v, got %v", e.name, e.humanGate, steps[i].HumanGate)
		}
		if steps[i].Execute == nil {
			t.Errorf("step %q: Execute must not be nil", e.name)
		}
	}
}

// TestCycleWorkflow_ConcurrencyKey verifies instance_id extraction from run input.
func TestCycleWorkflow_ConcurrencyKey(t *testing.T) {
	wf := NewCycleWorkflow(nil)
	id := uuid.New()

	run := &orchestration.Run{
		Input: map[string]any{"instance_id": id.String()},
	}
	got := wf.ConcurrencyKey(run)
	if got != id.String() {
		t.Errorf("want %q, got %q", id.String(), got)
	}
}

// TestCycleWorkflow_ConcurrencyKey_missing verifies graceful handling of missing instance_id.
func TestCycleWorkflow_ConcurrencyKey_missing(t *testing.T) {
	wf := NewCycleWorkflow(nil)
	run := &orchestration.Run{Input: map[string]any{}}
	got := wf.ConcurrencyKey(run)
	if got != "" {
		t.Errorf("want empty string for missing instance_id, got %q", got)
	}
}

// TestRunInstanceID verifies the runInstanceID helper parses UUIDs correctly.
func TestRunInstanceID_valid(t *testing.T) {
	id := uuid.New()
	run := &orchestration.Run{Input: map[string]any{"instance_id": id.String()}}
	got, err := runInstanceID(run)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got != id {
		t.Errorf("want %s, got %s", id, got)
	}
}

func TestRunInstanceID_missing(t *testing.T) {
	run := &orchestration.Run{Input: map[string]any{}}
	_, err := runInstanceID(run)
	if err == nil {
		t.Fatal("want error for missing instance_id")
	}
}

func TestRunInstanceID_invalid_uuid(t *testing.T) {
	run := &orchestration.Run{Input: map[string]any{"instance_id": "not-a-uuid"}}
	_, err := runInstanceID(run)
	if err == nil {
		t.Fatal("want error for invalid UUID")
	}
}

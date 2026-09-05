package aim

import "testing"

// TestCycleWorkflow_Name verifies the canonical workflow name.
//
// The step list, HumanGate layout, ConcurrencyKey, and instance-id parsing
// this file used to test here belonged to the legacy engine adapter (Steps(),
// ConcurrencyKey(), runInstanceID), deleted along with pkg/orchestration's
// concrete engine. The step list and gate layout are covered, as a superset —
// it also proves the real cycle drives correctly under the actual
// orchestration engine — by internal/aimdbos's
// TestDBOSEngine_Register_AcceptsTheRealAIMCycleWorkflow (formerly
// internal/aimadk's, for ADK).
func TestCycleWorkflow_Name(t *testing.T) {
	wf := NewCycleWorkflow(nil, nil) // nil svc — not called in this test
	if got := wf.Name(); got != WorkflowName {
		t.Errorf("want %q, got %q", WorkflowName, got)
	}
	if WorkflowName != "aim_cycle" {
		t.Errorf("WorkflowName must be 'aim_cycle', got %q", WorkflowName)
	}
}

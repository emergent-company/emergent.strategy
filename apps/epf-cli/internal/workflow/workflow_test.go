package workflow

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/navigation"
)

// --- Loader Tests ---

func TestLoadStateMachine(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if !art.IsMachine() {
		t.Fatal("expected state machine, got configuration")
	}
	sm := art.Machine
	if sm.Name != "canonical-decision-workflow" {
		t.Errorf("name = %q, want %q", sm.Name, "canonical-decision-workflow")
	}
	if sm.InitialState != "proposed" {
		t.Errorf("initial_state = %q, want %q", sm.InitialState, "proposed")
	}
	if len(sm.States) != 7 {
		t.Errorf("states count = %d, want 7", len(sm.States))
	}
	if len(sm.Transitions) != 7 {
		t.Errorf("transitions count = %d, want 7", len(sm.Transitions))
	}
}

func TestLoadConfiguration(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/board_meeting_decision.config.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if !art.IsConfig() {
		t.Fatal("expected configuration, got state machine")
	}
	cfg := art.Config
	if cfg.Name != "board-meeting-decision" {
		t.Errorf("name = %q, want %q", cfg.Name, "board-meeting-decision")
	}
	if cfg.AppliesToMachine != "canonical_decision.state_machine.yaml" {
		t.Errorf("applies_to_machine = %q", cfg.AppliesToMachine)
	}
	if len(cfg.StatePolicies) != 2 {
		t.Errorf("state_policies count = %d, want 2", len(cfg.StatePolicies))
	}
	if len(cfg.Notifications) != 3 {
		t.Errorf("notifications count = %d, want 3", len(cfg.Notifications))
	}
}

func TestLoadInvalid(t *testing.T) {
	_, err := Load([]byte("name: test\n"))
	if err == nil {
		t.Error("expected error for YAML without initial_state or applies_to_machine")
	}
}

// --- Multi-source transition tests ---

func TestMultiSourceTransition(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	sm := art.Machine

	// The "reject-or-recall" transition has from: [deliberation, resolved, documented, ratification-in-progress]
	var rejectTransition *Transition
	for i := range sm.Transitions {
		if sm.Transitions[i].Name == "reject-or-recall" {
			rejectTransition = &sm.Transitions[i]
			break
		}
	}
	if rejectTransition == nil {
		t.Fatal("reject-or-recall transition not found")
	}
	if !rejectTransition.From.IsMulti() {
		t.Error("reject-or-recall should have multiple sources")
	}
	if len(rejectTransition.From.Values) != 4 {
		t.Errorf("reject-or-recall has %d sources, want 4", len(rejectTransition.From.Values))
	}
}

// --- Validation Tests ---

func TestValidateValid(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(art.Machine)
	if len(errs) != 0 {
		t.Errorf("expected 0 errors, got %d:", len(errs))
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateInvalidInitialState(t *testing.T) {
	sm := &StateMachine{
		Name:         "test",
		InitialState: "nonexistent",
		States:       []string{"draft", "done"},
		Transitions:  []Transition{{Name: "finish", From: StringOrArr{Values: []string{"draft"}}, To: "done"}},
	}
	errs := Validate(sm)
	found := false
	for _, e := range errs {
		if e.Field == "initial_state" {
			found = true
		}
	}
	if !found {
		t.Error("expected validation error for invalid initial_state")
	}
}

func TestValidateUnknownTransitionTarget(t *testing.T) {
	sm := &StateMachine{
		Name:         "test",
		InitialState: "draft",
		States:       []string{"draft"},
		Transitions:  []Transition{{Name: "go", From: StringOrArr{Values: []string{"draft"}}, To: "nowhere"}},
	}
	errs := Validate(sm)
	found := false
	for _, e := range errs {
		if e.Message == `transition "go" references unknown target state "nowhere"` {
			found = true
		}
	}
	if !found {
		t.Error("expected validation error for unknown target state")
	}
}

func TestValidateDuplicateTransitionNames(t *testing.T) {
	sm := &StateMachine{
		Name:         "test",
		InitialState: "draft",
		States:       []string{"draft", "review", "done"},
		Transitions: []Transition{
			{Name: "submit", From: StringOrArr{Values: []string{"draft"}}, To: "review"},
			{Name: "submit", From: StringOrArr{Values: []string{"review"}}, To: "done"},
		},
	}
	errs := Validate(sm)
	found := false
	for _, e := range errs {
		if e.Message == `duplicate transition name "submit"` {
			found = true
		}
	}
	if !found {
		t.Error("expected validation error for duplicate transition name")
	}
}

func TestValidateUnreachableState(t *testing.T) {
	sm := &StateMachine{
		Name:         "test",
		InitialState: "draft",
		States:       []string{"draft", "done", "orphan"},
		Transitions:  []Transition{{Name: "finish", From: StringOrArr{Values: []string{"draft"}}, To: "done"}},
	}
	errs := Validate(sm)
	found := false
	for _, e := range errs {
		if e.Message == `state "orphan" has no inbound transitions (unreachable)` {
			found = true
		}
	}
	if !found {
		t.Error("expected validation error for unreachable state")
	}
}

// --- Query Tests ---

func TestTransitionsFrom(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	sm := art.Machine

	// From "proposed" there should be 1 transition: begin-deliberation
	from := sm.TransitionsFrom("proposed")
	if len(from) != 1 {
		t.Errorf("TransitionsFrom(proposed) = %d, want 1", len(from))
	}

	// From "deliberation" there should be 2: resolve + reject-or-recall
	from = sm.TransitionsFrom("deliberation")
	if len(from) != 2 {
		t.Errorf("TransitionsFrom(deliberation) = %d, want 2", len(from))
	}
}

func TestTerminalStates(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	sm := art.Machine

	terminal := sm.TerminalStates()
	if len(terminal) != 1 || terminal[0] != "archived" {
		t.Errorf("TerminalStates = %v, want [archived]", terminal)
	}
}

// --- Adapter Tests ---

func TestToNavigationGraph(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	if g.Name != "canonical-decision-workflow" {
		t.Errorf("graph name = %q", g.Name)
	}
	if g.EntryContext != "proposed" {
		t.Errorf("entry_context = %q, want proposed", g.EntryContext)
	}
	if len(g.Contexts) != 7 {
		t.Errorf("contexts = %d, want 7", len(g.Contexts))
	}

	// Multi-source transitions expand: 6 single-source + 4 from reject-or-recall = 10
	if len(g.Transitions) != 10 {
		t.Errorf("transitions = %d, want 10", len(g.Transitions))
	}

	// Verify multi-source transitions are disambiguated
	foundRejectFromDelib := false
	foundRejectFromResolved := false
	for _, tr := range g.Transitions {
		if tr.ID == "reject-or-recall-from-deliberation" {
			foundRejectFromDelib = true
			if tr.From != "deliberation" || tr.To != "proposed" {
				t.Errorf("reject-from-deliberation: from=%q to=%q", tr.From, tr.To)
			}
		}
		if tr.ID == "reject-or-recall-from-resolved" {
			foundRejectFromResolved = true
		}
	}
	if !foundRejectFromDelib {
		t.Error("missing transition reject-or-recall-from-deliberation")
	}
	if !foundRejectFromResolved {
		t.Error("missing transition reject-or-recall-from-resolved")
	}
}

func TestRunnerWithWorkflowAdapter(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	// Run the happy path: proposed -> deliberation -> resolved -> documented ->
	// ratification-in-progress -> ratified -> archived
	runner := navigation.NewRunner(g, nil)
	if runner.Current() != "proposed" {
		t.Errorf("start = %q, want proposed", runner.Current())
	}

	steps := []string{
		"begin-deliberation",
		"resolve",
		"document",
		"request-signatures",
		"ratify",
		"archive",
	}
	for _, step := range steps {
		if err := runner.Traverse(step); err != nil {
			t.Fatalf("Traverse(%q): %v", step, err)
		}
	}
	if runner.Current() != "archived" {
		t.Errorf("end = %q, want archived", runner.Current())
	}
	if len(runner.History()) != 6 {
		t.Errorf("history = %d, want 6", len(runner.History()))
	}
}

func TestRunnerRejectAndRetry(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)
	runner := navigation.NewRunner(g, nil)

	// Happy path to deliberation, then reject back to proposed
	if err := runner.Traverse("begin-deliberation"); err != nil {
		t.Fatal(err)
	}
	if err := runner.Traverse("reject-or-recall-from-deliberation"); err != nil {
		t.Fatal(err)
	}
	if runner.Current() != "proposed" {
		t.Errorf("after reject: %q, want proposed", runner.Current())
	}

	// Re-enter deliberation and continue
	if err := runner.Traverse("begin-deliberation"); err != nil {
		t.Fatal(err)
	}
	if runner.Current() != "deliberation" {
		t.Errorf("re-enter: %q, want deliberation", runner.Current())
	}
}

func TestReachabilityWithWorkflowAdapter(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	// From proposed, all states should be reachable (no guards)
	paths := navigation.Reachable(g, "proposed", nil)
	if len(paths) != 7 {
		t.Errorf("reachable from proposed = %d, want 7 (all states)", len(paths))
	}
}

func TestShortestPathWithWorkflowAdapter(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	// Shortest path from proposed to archived should be 6 steps (happy path)
	path := navigation.ShortestPath(g, "proposed", "archived", nil)
	if path == nil {
		t.Fatal("no path found from proposed to archived")
	}
	if len(path) != 6 {
		t.Errorf("shortest path length = %d, want 6", len(path))
	}
}

func TestScenarioWithWorkflowAdapter(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	scenario := navigation.JourneyScenario{
		Name: "board-decision-happy-path",
		Steps: []string{
			"begin-deliberation",
			"resolve",
			"document",
			"request-signatures",
			"ratify",
			"archive",
		},
		ExpectedEnd: "archived",
	}
	result := navigation.RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("scenario failed: %s", result.FailReason)
	}
}

func TestScenarioRejectPath(t *testing.T) {
	art, err := LoadFile("testdata/FIRE/workflows/canonical_decision.state_machine.yaml")
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	g := ToNavigationGraph(art.Machine)

	// Test reject from ratification: back to proposed, then re-run full cycle
	scenario := navigation.JourneyScenario{
		Name: "reject-from-ratification-then-succeed",
		Steps: []string{
			"begin-deliberation",
			"resolve",
			"document",
			"request-signatures",
			"reject-or-recall-from-ratification-in-progress",
			"begin-deliberation",
			"resolve",
			"document",
			"request-signatures",
			"ratify",
			"archive",
		},
		ExpectedEnd: "archived",
	}
	result := navigation.RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("scenario failed at step %d: %s", result.FailedAt, result.FailReason)
	}
}

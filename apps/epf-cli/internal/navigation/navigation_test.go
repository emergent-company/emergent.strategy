package navigation

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func testdataPath(name string) string {
	_, filename, _, _ := runtime.Caller(0)
	return filepath.Join(filepath.Dir(filename), "testdata", name)
}

// --- Loader tests ---

func TestLoadMinimalGraph(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if g.Name != "minimal-product" {
		t.Errorf("Name = %q, want %q", g.Name, "minimal-product")
	}
	if len(g.Contexts) != 3 {
		t.Errorf("Contexts = %d, want 3", len(g.Contexts))
	}
	if len(g.Transitions) != 2 {
		t.Errorf("Transitions = %d, want 2", len(g.Transitions))
	}
	if g.EntryContext != "home" {
		t.Errorf("EntryContext = %q, want %q", g.EntryContext, "home")
	}
}

func TestLoadFullGraph(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	if g.Name != "strategy-platform" {
		t.Errorf("Name = %q, want %q", g.Name, "strategy-platform")
	}
	if len(g.Contexts) < 10 {
		t.Errorf("Contexts = %d, want >= 10", len(g.Contexts))
	}
	if len(g.Guards) < 3 {
		t.Errorf("Guards = %d, want >= 3", len(g.Guards))
	}
	if len(g.Groups) < 3 {
		t.Errorf("Groups = %d, want >= 3", len(g.Groups))
	}
	if len(g.Menus) > 0 {
		if len(g.Menus[0].Items) == 0 {
			t.Error("Expected menu items in first menu")
		}
	}
}

func TestContextByID(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	ctx := g.ContextByID("home")
	if ctx == nil {
		t.Fatal("ContextByID(home) returned nil")
	}
	if ctx.Title != "Home" {
		t.Errorf("Title = %q, want %q", ctx.Title, "Home")
	}

	if g.ContextByID("nonexistent") != nil {
		t.Error("ContextByID(nonexistent) should return nil")
	}
}

func TestTransitionsFrom(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	from := g.TransitionsFrom("home")
	if len(from) != 2 {
		t.Errorf("TransitionsFrom(home) = %d, want 2", len(from))
	}

	from = g.TransitionsFrom("settings")
	if len(from) != 0 {
		t.Errorf("TransitionsFrom(settings) = %d, want 0", len(from))
	}
}

// --- Validation tests ---

func TestValidateMinimalGraph(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	if len(errs) != 0 {
		t.Errorf("Validate minimal graph: got %d errors, want 0:", len(errs))
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateFullGraph(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	if len(errs) != 0 {
		t.Errorf("Validate full graph: got %d errors, want 0:", len(errs))
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateOrphanDetected(t *testing.T) {
	g, err := LoadFile(testdataPath("invalid_orphan.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	found := false
	for _, e := range errs {
		if e.Code == "orphan-context" && e.Context == "orphan-page" {
			found = true
		}
	}
	if !found {
		t.Error("Expected orphan-context error for 'orphan-page'")
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateUndefinedGuard(t *testing.T) {
	g, err := LoadFile(testdataPath("invalid_missing_guard.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	found := false
	for _, e := range errs {
		if e.Code == "undefined-guard-ref" {
			found = true
		}
	}
	if !found {
		t.Error("Expected undefined-guard-ref error")
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateCircularParent(t *testing.T) {
	g, err := LoadFile(testdataPath("invalid_circular_parent.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	found := false
	for _, e := range errs {
		if e.Code == "circular-parent-chain" {
			found = true
		}
	}
	if !found {
		t.Error("Expected circular-parent-chain error")
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestValidateDuplicateIDs(t *testing.T) {
	g, err := LoadFile(testdataPath("invalid_duplicate_ids.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}
	errs := Validate(g)
	found := false
	for _, e := range errs {
		if e.Code == "duplicate-context-id" {
			found = true
		}
	}
	if !found {
		t.Error("Expected duplicate-context-id error")
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

// --- Runner tests ---

func TestRunnerBasicTraversal(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	runner := NewRunner(g, nil)
	if runner.Current() != "home" {
		t.Errorf("Current = %q, want %q", runner.Current(), "home")
	}

	if err := runner.Traverse("home-to-settings"); err != nil {
		t.Fatalf("Traverse: %v", err)
	}
	if runner.Current() != "settings" {
		t.Errorf("Current = %q, want %q", runner.Current(), "settings")
	}

	history := runner.History()
	if len(history) != 1 {
		t.Fatalf("History = %d entries, want 1", len(history))
	}
	if history[0].TransitionID != "home-to-settings" {
		t.Errorf("History[0].TransitionID = %q, want %q", history[0].TransitionID, "home-to-settings")
	}
}

func TestRunnerGuardBlocking(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Start without the "instance-active" guard → should block
	runner := NewRunner(g, nil)

	// Navigate to workspace-detail first
	if err := runner.Traverse("list-to-workspace"); err != nil {
		t.Fatalf("Traverse list-to-workspace: %v", err)
	}

	// Try to navigate to instance overview — guarded by instance-active
	err = runner.Traverse("workspace-to-instance")
	if err == nil {
		t.Fatal("Expected guard to block workspace-to-instance")
	}

	// Now enable the guard
	runner.Profile().ToggleGuard("instance-active")
	if err := runner.Traverse("workspace-to-instance"); err != nil {
		t.Fatalf("Traverse with guard enabled: %v", err)
	}
	if runner.Current() != "instance-overview" {
		t.Errorf("Current = %q, want %q", runner.Current(), "instance-overview")
	}
}

func TestRunnerAvailableTransitions(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	runner := NewRunner(g, nil)

	// Navigate to workspace-detail
	if err := runner.Traverse("list-to-workspace"); err != nil {
		t.Fatalf("Traverse: %v", err)
	}

	available := runner.Available()
	if len(available) == 0 {
		t.Fatal("Expected available transitions from workspace-detail")
	}

	// Find the guarded transition
	var guardedFound bool
	for _, at := range available {
		if at.Transition.ID == "workspace-to-instance" {
			guardedFound = true
			if at.Allowed {
				t.Error("workspace-to-instance should be blocked without guard")
			}
			if at.BlockedBy == nil {
				t.Error("Expected BlockedBy to be set")
			}
		}
	}
	if !guardedFound {
		t.Error("Expected workspace-to-instance in available transitions")
	}
}

func TestRunnerInvalidTransition(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	runner := NewRunner(g, nil)

	// Try a nonexistent transition
	if err := runner.Traverse("nonexistent"); err == nil {
		t.Error("Expected error for nonexistent transition")
	}

	// Try a transition from wrong context
	if err := runner.Traverse("home-to-settings"); err != nil {
		t.Fatalf("Traverse: %v", err)
	}
	// Now at settings, try home-to-profile (which starts at home, not settings)
	if err := runner.Traverse("home-to-profile"); err == nil {
		t.Error("Expected error for transition from wrong context")
	}
}

// --- Scenario runner tests ---

func TestRunScenarioPass(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	scenario := JourneyScenario{
		Name:        "navigate to vision",
		Steps:       []string{"list-to-workspace", "workspace-to-instance", "instance-to-vision"},
		Guards:      []string{"instance-active"},
		ExpectedEnd: "vision",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
	if result.FinalState != "vision" {
		t.Errorf("FinalState = %q, want %q", result.FinalState, "vision")
	}
}

func TestRunScenarioGuardFails(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	scenario := JourneyScenario{
		Name:  "navigate without guard",
		Steps: []string{"list-to-workspace", "workspace-to-instance"},
		// No guards enabled — instance-active guard will block
	}

	result := RunScenario(g, scenario)
	if result.Passed {
		t.Error("Expected scenario to fail on guard")
	}
	if result.FailedAt != 1 {
		t.Errorf("FailedAt = %d, want 1", result.FailedAt)
	}
}

func TestRunScenarioWrongEnd(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	scenario := JourneyScenario{
		Name:        "expect wrong end",
		Steps:       []string{"home-to-settings"},
		ExpectedEnd: "profile", // We went to settings, not profile
	}

	result := RunScenario(g, scenario)
	if result.Passed {
		t.Error("Expected scenario to fail on wrong end context")
	}
}

// --- Reachability tests ---

func TestReachableNoGuards(t *testing.T) {
	g, err := LoadFile(testdataPath("minimal_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	reachable := Reachable(g, "home", nil)
	// home itself, settings, profile — 3 contexts reachable
	if len(reachable) != 3 {
		t.Errorf("Reachable from home = %d contexts, want 3", len(reachable))
	}
	if _, ok := reachable["settings"]; !ok {
		t.Error("settings should be reachable from home")
	}
	if _, ok := reachable["profile"]; !ok {
		t.Error("profile should be reachable from home")
	}
}

func TestReachableWithGuards(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Without any guards, should only reach workspace-list + workspace-detail + create-workspace + import-instance
	noGuards := Reachable(g, "workspace-list", NewGuardProfile())

	// With instance-active guard, should reach more
	withGuard := NewGuardProfile()
	withGuard.Guards["instance-active"] = true
	withGuardResult := Reachable(g, "workspace-list", withGuard)

	if len(withGuardResult) <= len(noGuards) {
		t.Errorf("With instance-active guard, should reach more contexts: %d vs %d", len(withGuardResult), len(noGuards))
	}
}

func TestShortestPath(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	profile := NewGuardProfile()
	profile.Guards["instance-active"] = true

	path := ShortestPath(g, "workspace-list", "vision", profile)
	if path == nil {
		t.Fatal("Expected a path from workspace-list to vision")
	}
	if len(path) != 3 {
		t.Errorf("ShortestPath = %d steps, want 3 (list-to-workspace, workspace-to-instance, instance-to-vision)", len(path))
	}
}

func TestShortestPathUnreachable(t *testing.T) {
	g, err := LoadFile(testdataPath("full_graph.yaml"))
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Without guards, semantic-search is guarded — unreachable via longer path
	path := ShortestPath(g, "workspace-list", "semantic-search", NewGuardProfile())
	if path != nil {
		t.Errorf("Expected no path to semantic-search without guards, got %v", path)
	}
}

// --- Guard profile tests ---

func TestGuardProfileToggle(t *testing.T) {
	p := NewGuardProfile()
	p.ToggleGuard("admin")
	if !p.Guards["admin"] {
		t.Error("Expected admin guard to be enabled")
	}
	p.ToggleGuard("admin")
	if p.Guards["admin"] {
		t.Error("Expected admin guard to be disabled after toggle")
	}

	p.ToggleGuardGroup("semantic-engine")
	if !p.GuardGroups["semantic-engine"] {
		t.Error("Expected semantic-engine group to be enabled")
	}
}

func TestGuardProfileSatisfies(t *testing.T) {
	p := NewGuardProfile()
	p.Guards["admin-role"] = true
	p.GuardGroups["premium"] = true

	// Direct guard match
	guard := &Guard{ID: "admin-role", Description: "test"}
	if !p.Satisfies(guard) {
		t.Error("Expected admin-role to be satisfied")
	}

	// Guard group match
	groupGuard := &Guard{ID: "pro-feature", Description: "test", GuardGroup: "premium"}
	if !p.Satisfies(groupGuard) {
		t.Error("Expected pro-feature to be satisfied via premium group")
	}

	// Unsatisfied guard
	otherGuard := &Guard{ID: "super-admin", Description: "test"}
	if p.Satisfies(otherGuard) {
		t.Error("Expected super-admin to NOT be satisfied")
	}

	// Nil guard always passes
	if !p.Satisfies(nil) {
		t.Error("Expected nil guard to always be satisfied")
	}
}

// --- Emergent Strategy Platform navigation graph (dogfooding) ---

func emergentStrategyGraphPath() string {
	_, filename, _, _ := runtime.Caller(0)
	// Navigate from internal/navigation/ up to repo root, then to the EPF instance
	repoRoot := filepath.Join(filepath.Dir(filename), "..", "..", "..", "..")
	return filepath.Join(repoRoot, "docs", "EPF", "_instances", "emergent", "FIRE", "navigation_graph.yaml")
}

func TestEmergentStrategyGraphLoads(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	if g.Name != "emergent-strategy-platform" {
		t.Errorf("Name = %q, want %q", g.Name, "emergent-strategy-platform")
	}
	if len(g.Contexts) < 20 {
		t.Errorf("Contexts = %d, want >= 20", len(g.Contexts))
	}
	if len(g.Transitions) < 30 {
		t.Errorf("Transitions = %d, want >= 30", len(g.Transitions))
	}
	if len(g.Guards) < 4 {
		t.Errorf("Guards = %d, want >= 4", len(g.Guards))
	}
	if len(g.Groups) < 6 {
		t.Errorf("Groups = %d, want >= 6", len(g.Groups))
	}
}

func TestEmergentStrategyGraphValidates(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	errs := Validate(g)
	if len(errs) != 0 {
		t.Errorf("Validate emergent-strategy graph: got %d errors, want 0:", len(errs))
		for _, e := range errs {
			t.Logf("  %s", e)
		}
	}
}

func TestEmergentStrategyScenarioOnboard(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Onboard → create workspace → import instance → view dashboard
	scenario := JourneyScenario{
		Name:        "onboard-to-dashboard",
		Description: "New user creates a workspace, imports an instance, reaches the dashboard",
		Steps: []string{
			"list-to-create-workspace",   // workspace-list → create-workspace
			// After POST, redirects back to workspace-list, then to workspace-detail
		},
		ExpectedEnd: "create-workspace",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioUpdateVision(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Navigate to vision, edit, review staging, commit
	scenario := JourneyScenario{
		Name:        "update-vision-flow",
		Description: "Strategist navigates to vision, edits it, reviews staged change, commits",
		Steps: []string{
			"list-to-workspace",          // workspace-list → workspace-detail
			"workspace-to-instance",      // workspace-detail → instance-dashboard
			"dashboard-to-vision",        // instance-dashboard → vision
			"vision-to-edit",             // vision → edit-vision
			"edit-vision-to-staging",     // edit-vision → staging-review
			"staging-commit-to-dashboard", // staging-review → instance-dashboard
		},
		Guards:      []string{"authenticated", "instance-active", "can-write"},
		ExpectedEnd: "instance-dashboard",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioCreateFeature(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Navigate to features, create new, review staging, commit
	scenario := JourneyScenario{
		Name:        "create-feature-flow",
		Description: "Operator creates a new feature, reviews staged change, commits",
		Steps: []string{
			"list-to-workspace",
			"workspace-to-instance",
			"dashboard-to-features",
			"features-to-create",
			"create-feature-to-staging",
			"staging-commit-to-dashboard",
		},
		Guards:      []string{"authenticated", "instance-active", "can-write"},
		ExpectedEnd: "instance-dashboard",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioSemanticSearch(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Navigate to search, drill into neighborhood
	scenario := JourneyScenario{
		Name:        "semantic-search-flow",
		Description: "User searches strategy, drills into graph neighborhood",
		Steps: []string{
			"list-to-workspace",
			"workspace-to-instance",
			"dashboard-to-search",
			"search-to-neighborhood",
		},
		Guards:      []string{"authenticated", "instance-active", "memory-connected"},
		GuardGroups: []string{"semantic-engine"},
		ExpectedEnd: "graph-neighborhood",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioContradictionFix(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Find contradiction, fix it via feature edit, commit
	scenario := JourneyScenario{
		Name:        "contradiction-fix-flow",
		Description: "User finds contradiction, navigates to fix via feature edit, stages and commits",
		Steps: []string{
			"list-to-workspace",
			"workspace-to-instance",
			"dashboard-to-contradictions",
			"contradictions-to-edit-feature",
			"edit-feature-to-staging",
			"staging-commit-to-dashboard",
		},
		Guards:      []string{"authenticated", "instance-active", "can-write", "memory-connected"},
		GuardGroups: []string{"semantic-engine"},
		ExpectedEnd: "instance-dashboard",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioWhatIf(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Create a what-if scenario, review, commit to staging
	scenario := JourneyScenario{
		Name:        "what-if-flow",
		Description: "User creates a what-if scenario, evaluates it, commits to staging",
		Steps: []string{
			"list-to-workspace",
			"workspace-to-instance",
			"dashboard-to-scenarios",
			"scenarios-to-create",
		},
		Guards:      []string{"authenticated", "instance-active", "can-write", "memory-connected"},
		GuardGroups: []string{"semantic-engine"},
		ExpectedEnd: "create-scenario",
	}

	result := RunScenario(g, scenario)
	if !result.Passed {
		t.Errorf("Scenario failed: %s (at step %d)", result.FailReason, result.FailedAt)
	}
}

func TestEmergentStrategyScenarioObserverReadOnly(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Scenario: Observer (no can-write) can view strategy but NOT edit
	scenario := JourneyScenario{
		Name:        "observer-blocked-from-editing",
		Description: "Observer can view vision but is blocked from editing (no can-write guard)",
		Steps: []string{
			"list-to-workspace",
			"workspace-to-instance",
			"dashboard-to-vision",
			"vision-to-edit", // Should FAIL — guarded by can-write
		},
		Guards: []string{"authenticated", "instance-active"},
		// Deliberately NOT including "can-write"
	}

	result := RunScenario(g, scenario)
	if result.Passed {
		t.Error("Expected observer to be blocked from editing vision")
	}
	if result.FailedAt != 3 {
		t.Errorf("FailedAt = %d, want 3 (vision-to-edit)", result.FailedAt)
	}
}

func TestEmergentStrategyReachabilityByPersona(t *testing.T) {
	path := emergentStrategyGraphPath()
	if _, err := os.Stat(path); os.IsNotExist(err) {
		t.Skipf("Emergent strategy graph not found at %s", path)
	}

	g, err := LoadFile(path)
	if err != nil {
		t.Fatalf("LoadFile: %v", err)
	}

	// Strategist: full access
	strategist := NewGuardProfile()
	strategist.Guards["authenticated"] = true
	strategist.Guards["instance-active"] = true
	strategist.Guards["can-write"] = true
	strategist.Guards["memory-connected"] = true
	strategist.GuardGroups["semantic-engine"] = true
	strategistReach := Reachable(g, "workspace-list", strategist)

	// Observer: read-only, no memory
	observer := NewGuardProfile()
	observer.Guards["authenticated"] = true
	observer.Guards["instance-active"] = true
	observerReach := Reachable(g, "workspace-list", observer)

	// Unauthenticated: nothing beyond workspace-list
	unauth := NewGuardProfile()
	unauthReach := Reachable(g, "workspace-list", unauth)

	t.Logf("Strategist reaches %d contexts", len(strategistReach))
	t.Logf("Observer reaches %d contexts", len(observerReach))
	t.Logf("Unauthenticated reaches %d contexts", len(unauthReach))

	// Strategist should reach more than observer
	if len(strategistReach) <= len(observerReach) {
		t.Errorf("Strategist (%d) should reach more than observer (%d)", len(strategistReach), len(observerReach))
	}

	// Observer should reach more than unauthenticated
	if len(observerReach) <= len(unauthReach) {
		t.Errorf("Observer (%d) should reach more than unauthenticated (%d)", len(observerReach), len(unauthReach))
	}

	// Strategist should reach edit-vision, observer should not
	if _, ok := strategistReach["edit-vision"]; !ok {
		t.Error("Strategist should reach edit-vision")
	}
	if _, ok := observerReach["edit-vision"]; ok {
		t.Error("Observer should NOT reach edit-vision")
	}

	// Strategist should reach semantic-search, observer should not (no memory-connected)
	if _, ok := strategistReach["semantic-search"]; !ok {
		t.Error("Strategist should reach semantic-search")
	}
	if _, ok := observerReach["semantic-search"]; ok {
		t.Error("Observer should NOT reach semantic-search (no memory guard)")
	}
}

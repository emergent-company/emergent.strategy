package propagation

import (
	"testing"
	"time"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/reasoning"
)

// mockReasoner returns a fixed verdict for testing.
type mockReasoner struct {
	verdict       reasoning.Verdict
	confidence    float64
	changes       map[string]any
	tokensPerEval int
	evalCount     int // tracks how many times Evaluate was called
}

func (m *mockReasoner) Evaluate(req reasoning.EvaluationRequest) (*reasoning.Assessment, error) {
	m.evalCount++
	return &reasoning.Assessment{
		Verdict:         m.verdict,
		Confidence:      m.confidence,
		Reasoning:       "mock reasoning",
		ProposedChanges: m.changes,
		Classification:  reasoning.ClassMechanical,
		ModelUsed:       "mock-model",
		TokensUsed:      reasoning.TokenUsage{InputTokens: m.tokensPerEval / 2, OutputTokens: m.tokensPerEval / 2},
	}, nil
}

// buildTestGraph creates a simple test graph:
//
//	Belief:A (tier 1)
//	  ├── contains → Positioning:B (tier 3)
//	  │     └── contributes_to → Feature:C (tier 6)
//	  │           └── contains → Capability:D (tier 7)
//	  └── contains → OKR:E (tier 4)
func buildTestGraph() *GraphSnapshot {
	objects := []memory.Object{
		{ID: "id-a", Key: "Belief:A", Type: "Belief", Properties: map[string]any{"name": "Market belief", "inertia_tier": "1"}},
		{ID: "id-b", Key: "Positioning:B", Type: "Positioning", Properties: map[string]any{"name": "Positioning", "inertia_tier": "3"}},
		{ID: "id-c", Key: "Feature:C", Type: "Feature", Properties: map[string]any{"name": "Feature X", "inertia_tier": "6"}},
		{ID: "id-d", Key: "Capability:D", Type: "Capability", Properties: map[string]any{"name": "Cap 1", "inertia_tier": "7"}},
		{ID: "id-e", Key: "OKR:E", Type: "OKR", Properties: map[string]any{"name": "Ship MVP", "inertia_tier": "4"}},
	}
	relationships := []memory.Relationship{
		{ID: "r1", Type: "contains", FromID: "id-a", ToID: "id-b", Properties: map[string]any{"weight": "1.0", "edge_source": "structural"}},
		{ID: "r2", Type: "contributes_to", FromID: "id-c", ToID: "id-b", Properties: map[string]any{"weight": "1.0", "edge_source": "structural"}},
		{ID: "r3", Type: "contains", FromID: "id-c", ToID: "id-d", Properties: map[string]any{"weight": "1.0", "edge_source": "structural"}},
		{ID: "r4", Type: "contains", FromID: "id-a", ToID: "id-e", Properties: map[string]any{"weight": "1.0", "edge_source": "structural"}},
	}
	return NewGraphSnapshotFromData(objects, relationships)
}

func TestDownwardCascade(t *testing.T) {
	graph := buildTestGraph()
	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictModified,
		confidence:    0.9,
		changes:       map[string]any{"description": "updated"},
		tokensPerEval: 200,
	}

	config := DefaultConfig()
	config.DryRun = true
	config.DampingInterval = 0 // disable damping for test speed

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Belief:A",
		SourceNodeType: "Belief",
		ChangeType:     "content_modified",
		Description:    "Belief changed",
		Strength:       1.0,
	})

	// Should have evaluated multiple nodes in the cascade
	if len(result.Trace) == 0 {
		t.Error("Expected at least one evaluation in the cascade")
	}

	// All modifications should be proposed (dry-run)
	if len(result.ProposedChanges) == 0 {
		t.Error("Expected proposed changes from modified verdicts")
	}
	for _, pc := range result.ProposedChanges {
		if pc.Applied {
			t.Errorf("Changes should not be applied in dry-run: %s", pc.NodeKey)
		}
	}

	t.Logf("Trace: %d evaluations, %d proposed changes, %d waves",
		len(result.Trace), len(result.ProposedChanges), result.Waves)
	for _, e := range result.Trace {
		t.Logf("  Wave %d: %s (tier %d, strength %.2f) → %s",
			e.Wave, e.NodeKey, e.InertiaTier, e.SignalStrength, e.Assessment.Verdict)
	}
}

func TestSignalDecay(t *testing.T) {
	graph := buildTestGraph()

	// Reasoner that always says "unchanged" — we're testing which nodes get evaluated
	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictUnchanged,
		confidence:    0.9,
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DecayFactor = 0.5 // aggressive decay
	config.MinSignalStrength = 0.1
	config.DampingInterval = 0

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Belief:A",
		SourceNodeType: "Belief",
		ChangeType:     "content_modified",
		Strength:       1.0,
	})

	// With 0.5 decay: hop 1 = 0.5, hop 2 = 0.25, hop 3 = 0.125, hop 4 = 0.0625
	// Min strength 0.1, so hops 1-3 should be evaluated, hop 4 might be skipped

	// Count skipped-for-threshold
	belowThreshold := 0
	for _, s := range result.SkippedNodes {
		if s.Reason == "below_threshold" {
			belowThreshold++
		}
	}

	t.Logf("Evaluated: %d, Skipped (threshold): %d", len(result.Trace), belowThreshold)

	// Should have at least skipped something due to decay
	// (the deep chain is Belief → Positioning → Feature → Capability, 3 hops)
	if len(result.Trace)+belowThreshold < 2 {
		t.Error("Expected at least 2 nodes considered (evaluated or skipped)")
	}
}

func TestOscillationDetection(t *testing.T) {
	// Create a graph with a cycle: A → B → A
	// Use low inertia (tier 1 → threshold 0.1) so signals survive the round trip
	objects := []memory.Object{
		{ID: "id-a", Key: "Feature:A", Type: "Feature", Properties: map[string]any{"name": "A", "inertia_tier": "1"}},
		{ID: "id-b", Key: "Feature:B", Type: "Feature", Properties: map[string]any{"name": "B", "inertia_tier": "1"}},
	}
	relationships := []memory.Relationship{
		{ID: "r1", Type: "depends_on", FromID: "id-a", ToID: "id-b", Properties: map[string]any{"weight": "1.0"}},
		{ID: "r2", Type: "depends_on", FromID: "id-b", ToID: "id-a", Properties: map[string]any{"weight": "1.0"}},
	}
	graph := NewGraphSnapshotFromData(objects, relationships)

	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictModified,
		confidence:    0.9,
		changes:       map[string]any{"x": "y"},
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DryRun = true
	config.DampingInterval = 0
	config.MaxEvaluationsPerNode = 3
	config.DecayFactor = 0.95 // slow decay so signals survive many hops
	config.MinSignalStrength = 0.01

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Feature:A",
		SourceNodeType: "Feature",
		ChangeType:     "content_modified",
		Strength:       1.0,
	})

	// Should detect oscillation and freeze nodes
	if len(result.FrozenNodes) == 0 {
		t.Error("Expected oscillation detection to freeze nodes")
	}

	t.Logf("Evaluations: %d, Frozen: %d, Proposed: %d",
		len(result.Trace), len(result.FrozenNodes), len(result.ProposedChanges))

	// Should have stopped around MaxEvaluationsPerNode * 2 (both nodes)
	maxExpected := 2*config.MaxEvaluationsPerNode + 2 // some slack for queue ordering
	if reasoner.evalCount > maxExpected {
		t.Errorf("Too many evaluations (%d) — oscillation detection should have limited to ~%d",
			reasoner.evalCount, 2*config.MaxEvaluationsPerNode)
	}
}

func TestTokenBudgetExhaustion(t *testing.T) {
	graph := buildTestGraph()

	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictModified,
		confidence:    0.9,
		changes:       map[string]any{"x": "y"},
		tokensPerEval: 1000, // 1000 tokens per eval
	}

	config := DefaultConfig()
	config.DryRun = true
	config.DampingInterval = 0
	config.TokenBudget = 2500 // only enough for ~2 evaluations

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Belief:A",
		SourceNodeType: "Belief",
		ChangeType:     "content_modified",
		Strength:       1.0,
	})

	if !result.BudgetExhausted {
		t.Error("Expected budget exhaustion")
	}

	budgetSkipped := 0
	for _, s := range result.SkippedNodes {
		if s.Reason == "budget_exhausted" {
			budgetSkipped++
		}
	}
	if budgetSkipped == 0 {
		t.Error("Expected some nodes skipped due to budget")
	}

	t.Logf("Evaluated: %d, Budget skipped: %d, Total tokens: %d/%d",
		len(result.Trace), budgetSkipped, result.TotalTokensUsed, config.TokenBudget)
}

func TestUnchangedStopsPropagation(t *testing.T) {
	graph := buildTestGraph()

	// Reasoner says "unchanged" — cascade should stop
	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictUnchanged,
		confidence:    0.95,
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DryRun = true
	config.DampingInterval = 0

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Belief:A",
		SourceNodeType: "Belief",
		ChangeType:     "content_modified",
		Strength:       1.0,
	})

	// Direct neighbors of A should be evaluated (Positioning:B and OKR:E)
	// But they return "unchanged" so no further propagation
	if result.Waves > 1 {
		t.Errorf("Expected 1 wave (no propagation past unchanged), got %d", result.Waves)
	}
	if len(result.ProposedChanges) != 0 {
		t.Errorf("Expected 0 proposed changes for all-unchanged, got %d", len(result.ProposedChanges))
	}
}

func TestGraphSnapshotFromData(t *testing.T) {
	graph := buildTestGraph()

	// Verify nodes loaded
	if len(graph.Nodes) != 5 {
		t.Errorf("Expected 5 nodes, got %d", len(graph.Nodes))
	}

	// Verify edges
	belief := graph.Nodes["Belief:A"]
	if belief == nil {
		t.Fatal("Belief:A not found")
	}
	if len(belief.Outgoing) != 2 {
		t.Errorf("Belief:A should have 2 outgoing edges (to B and E), got %d", len(belief.Outgoing))
	}

	// Verify inertia tier parsing
	if belief.InertiaTier != 1 {
		t.Errorf("Belief:A should have inertia tier 1, got %d", belief.InertiaTier)
	}
	feature := graph.Nodes["Feature:C"]
	if feature.InertiaTier != 6 {
		t.Errorf("Feature:C should have inertia tier 6, got %d", feature.InertiaTier)
	}

	// Verify neighbors
	neighbors := belief.Neighbors(graph)
	if len(neighbors) != 2 {
		t.Errorf("Belief:A should have 2 neighbors, got %d", len(neighbors))
	}
}

func TestInertiaThreshold(t *testing.T) {
	// Weak signal should not reach high-inertia nodes
	graph := buildTestGraph()

	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictModified,
		confidence:    0.9,
		changes:       map[string]any{"x": "y"},
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DryRun = true
	config.DampingInterval = 0
	config.DecayFactor = 0.3 // very aggressive decay

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Feature:C",
		SourceNodeType: "Feature",
		ChangeType:     "content_modified",
		Strength:       0.5, // moderate signal
	})

	// Feature:C → Capability:D (tier 7, threshold 0.7, signal 0.5*0.3 = 0.15 → too weak)
	// Feature:C → Positioning:B (tier 3, threshold 0.3, signal 0.5*0.3 = 0.15 → too weak)
	// Most nodes should be skipped due to threshold

	belowThreshold := 0
	for _, s := range result.SkippedNodes {
		if s.Reason == "below_threshold" {
			belowThreshold++
		}
	}

	t.Logf("Evaluated: %d, Below threshold: %d", len(result.Trace), belowThreshold)

	if belowThreshold == 0 {
		t.Error("Expected some nodes below inertia threshold with weak signal + aggressive decay")
	}
}

func TestTemporalDamping(t *testing.T) {
	// Two nodes: A → B, evaluate B twice quickly — second should be damped
	objects := []memory.Object{
		{ID: "id-a", Key: "Feature:A", Type: "Feature", Properties: map[string]any{"inertia_tier": "6"}},
		{ID: "id-b", Key: "Feature:B", Type: "Feature", Properties: map[string]any{"inertia_tier": "6"}},
	}
	relationships := []memory.Relationship{
		{ID: "r1", Type: "depends_on", FromID: "id-a", ToID: "id-b", Properties: map[string]any{"weight": "1.0"}},
	}
	graph := NewGraphSnapshotFromData(objects, relationships)

	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictUnchanged,
		confidence:    0.9,
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DampingInterval = 1 * time.Hour // effectively infinite for this test

	// First cascade — B gets evaluated
	circuit := NewCircuit(graph, reasoner, config)
	r1 := circuit.Propagate(reasoning.Signal{
		SourceNodeKey: "Feature:A", SourceNodeType: "Feature",
		ChangeType: "content_modified", Strength: 1.0,
	})

	// Second cascade immediately — B should be damped
	r2 := circuit.Propagate(reasoning.Signal{
		SourceNodeKey: "Feature:A", SourceNodeType: "Feature",
		ChangeType: "content_modified", Strength: 1.0,
	})

	if len(r1.Trace) != 1 {
		t.Errorf("First cascade should evaluate B once, got %d evals", len(r1.Trace))
	}

	dampedCount := 0
	for _, s := range r2.SkippedNodes {
		if s.Reason == "damping" {
			dampedCount++
		}
	}
	if dampedCount == 0 {
		t.Error("Second cascade should have B damped")
	}
}

func TestMechanicalChangesAppliedInNonDryRun(t *testing.T) {
	graph := buildTestGraph()
	reasoner := &mockReasoner{
		verdict:       reasoning.VerdictModified,
		confidence:    0.95,
		changes:       map[string]any{"path": "renamed"},
		tokensPerEval: 100,
	}

	config := DefaultConfig()
	config.DryRun = false
	config.DampingInterval = 0

	circuit := NewCircuit(graph, reasoner, config)
	result := circuit.Propagate(reasoning.Signal{
		SourceNodeKey:  "Belief:A",
		SourceNodeType: "Belief",
		ChangeType:     "content_modified",
		Strength:       1.0,
	})

	// Mechanical changes should be applied (not just proposed)
	if len(result.AppliedChanges) == 0 {
		t.Error("Expected mechanical changes to be applied in non-dry-run mode")
	}

	for _, ac := range result.AppliedChanges {
		if !ac.Applied {
			t.Errorf("AppliedChange should have Applied=true: %s", ac.NodeKey)
		}
	}

	t.Logf("Applied: %d, Proposed: %d", len(result.AppliedChanges), len(result.ProposedChanges))
}

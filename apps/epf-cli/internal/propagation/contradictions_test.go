package propagation

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/memory"
)

func TestDetectOrphanedReferences(t *testing.T) {
	// Feature has contributes_to edge to VM, but VM node doesn't exist in graph.
	// Since the graph loader skips relationships with missing endpoints,
	// we simulate this by keeping the edge but NOT having the target node.
	// In practice, orphaned references are detected at ingestion time
	// (as skipped relationships). This test verifies the graph-level detection
	// for edges that somehow make it into the graph.
	graph := NewGraphSnapshotFromData(
		[]memory.Object{
			{ID: "id-f", Key: "Feature:feature:fd-001", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
			{ID: "id-vm", Key: "ValueModelComponent:value_model:Product.X", Type: "ValueModelComponent",
				Properties: map[string]any{"inertia_tier": "5"}},
		},
		[]memory.Relationship{
			{ID: "r1", Type: "contributes_to", FromID: "id-f", ToID: "id-vm",
				Properties: map[string]any{"weight": "1.0"}},
		},
	)

	// Remove the VM node to simulate orphaned reference
	delete(graph.Nodes, "ValueModelComponent:value_model:Product.X")

	results := DetectContradictions(graph)

	orphaned := filterByType(results, ContradictionOrphanedRef)
	if len(orphaned) != 1 {
		t.Errorf("Expected 1 orphaned reference, got %d", len(orphaned))
	}
}

func TestDetectStatusConflict(t *testing.T) {
	graph := NewGraphSnapshotFromData(
		[]memory.Object{
			{ID: "id-f", Key: "Feature:feature:fd-001", Type: "Feature",
				Properties: map[string]any{"status": "delivered", "inertia_tier": "6"}},
			{ID: "id-c", Key: "Capability:feature:fd-001:cap-001", Type: "Capability",
				Properties: map[string]any{"maturity": "hypothetical", "inertia_tier": "7"}},
		},
		[]memory.Relationship{
			{ID: "r1", Type: "contains", FromID: "id-f", ToID: "id-c",
				Properties: map[string]any{"weight": "1.0"}},
		},
	)

	results := DetectContradictions(graph)

	conflicts := filterByType(results, ContradictionStatusConflict)
	if len(conflicts) != 1 {
		t.Errorf("Expected 1 status conflict, got %d", len(conflicts))
	}
	if len(conflicts) > 0 && conflicts[0].Severity != "critical" {
		t.Errorf("Expected severity=critical, got %s", conflicts[0].Severity)
	}
}

func TestDetectBrokenDependency(t *testing.T) {
	// Same approach — build the graph with both nodes, then remove the target
	graph := NewGraphSnapshotFromData(
		[]memory.Object{
			{ID: "id-f1", Key: "Feature:feature:fd-001", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
			{ID: "id-f2", Key: "Feature:feature:fd-002", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
		},
		[]memory.Relationship{
			{ID: "r1", Type: "depends_on", FromID: "id-f1", ToID: "id-f2",
				Properties: map[string]any{"weight": "1.0"}},
		},
	)

	// Remove the dependency target to simulate broken dep
	delete(graph.Nodes, "Feature:feature:fd-002")

	results := DetectContradictions(graph)

	broken := filterByType(results, ContradictionBrokenDep)
	if len(broken) != 1 {
		t.Errorf("Expected 1 broken dependency, got %d", len(broken))
	}
}

func TestDetectDisconnectedNodes(t *testing.T) {
	graph := NewGraphSnapshotFromData(
		[]memory.Object{
			{ID: "id-a", Key: "Feature:feature:fd-001", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
			{ID: "id-b", Key: "Feature:feature:fd-002", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
			// fd-002 has no edges
		},
		[]memory.Relationship{
			{ID: "r1", Type: "depends_on", FromID: "id-a", ToID: "id-b",
				Properties: map[string]any{"weight": "1.0"}},
		},
	)

	results := DetectContradictions(graph)

	disconnected := filterByType(results, ContradictionDisconnected)
	// fd-001 has outgoing, fd-002 has incoming — neither is disconnected
	if len(disconnected) != 0 {
		t.Errorf("Expected 0 disconnected (both have edges), got %d", len(disconnected))
		for _, d := range disconnected {
			t.Logf("  disconnected: %s", d.NodeAKey)
		}
	}
}

func TestDetectDisconnectedNodesActual(t *testing.T) {
	graph := NewGraphSnapshotFromData(
		[]memory.Object{
			{ID: "id-a", Key: "Feature:feature:fd-001", Type: "Feature",
				Properties: map[string]any{"inertia_tier": "6"}},
			{ID: "id-b", Key: "Belief:orphan", Type: "Belief",
				Properties: map[string]any{"inertia_tier": "1"}},
			// Belief has no edges at all
		},
		[]memory.Relationship{
			{ID: "r1", Type: "contains", FromID: "id-a", ToID: "id-a", // self-ref for test
				Properties: map[string]any{"weight": "1.0"}},
		},
	)

	results := DetectContradictions(graph)

	disconnected := filterByType(results, ContradictionDisconnected)
	if len(disconnected) != 1 {
		t.Errorf("Expected 1 disconnected node (orphan belief), got %d", len(disconnected))
	}
}

func TestNoContradictionsInCleanGraph(t *testing.T) {
	graph := buildTestGraph() // from circuit_test.go

	results := DetectContradictions(graph)

	// The test graph has no orphaned refs or status conflicts
	critical := 0
	for _, r := range results {
		if r.Severity == "critical" {
			critical++
			t.Logf("Unexpected critical: %s - %s", r.Type, r.Description)
		}
	}
	if critical > 0 {
		t.Errorf("Expected 0 critical contradictions in clean graph, got %d", critical)
	}
}

func filterByType(results []Contradiction, t ContradictionType) []Contradiction {
	var filtered []Contradiction
	for _, r := range results {
		if r.Type == t {
			filtered = append(filtered, r)
		}
	}
	return filtered
}

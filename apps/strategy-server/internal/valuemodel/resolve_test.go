package valuemodel_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

// realShapes mirrors the two path conventions found in the emergent-epf
// instance, which is the only reason this package is not a map lookup.
func realShapes() valuemodel.Model {
	return valuemodel.Model{
		Track: "Product",
		Layers: []valuemodel.Layer{{
			ID: "memory-reasoning", Name: "Memory Reasoning Engine", PathSegment: "MemoryReasoningEngine",
			Components: []valuemodel.Component{
				{ID: "knowledge-graph", Name: "Knowledge Graph", PathSegment: "KnowledgeGraph",
					Subs: []valuemodel.Sub{{ID: "graph-queries", Name: "Graph Queries"}}},
				{ID: "vector-search", Name: "Vector Search", PathSegment: "VectorSearch"},
			},
		}},
	}
}

func orgOpsShape() valuemodel.Model {
	return valuemodel.Model{
		Track: "OrgOps",
		Layers: []valuemodel.Layer{{
			ID: "talent-management", Name: "TALENT MANAGEMENT", PathSegment: "TalentManagement",
			Components: []valuemodel.Component{{
				ID: "feedback-performance", Name: "Feedback & Performance", PathSegment: "FeedbackPerformance",
				Subs: []valuemodel.Sub{{ID: "performance-reviews", Name: "Performance Reviews"}},
			}},
		}},
	}
}

// TestLayerComponentPathResolves is the Product convention.
//
// This is the case the previous implementation could not do: it read the LAYER
// segment and looked it up in a map keyed by component NAMES, so
// "MemoryReasoningEngine" was compared against "knowledge graph" and nothing
// was ever placed.
func TestLayerComponentPathResolves(t *testing.T) {
	got, err := realShapes().Resolve("Product.MemoryReasoningEngine.KnowledgeGraph")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.ComponentID != "knowledge-graph" {
		t.Errorf("ComponentID = %q, want knowledge-graph", got.ComponentID)
	}
	if got.LayerID != "memory-reasoning" {
		t.Errorf("LayerID = %q, want memory-reasoning", got.LayerID)
	}
}

// TestComponentSubPathResolves is the OrgOps/Commercial convention, where the
// layer is omitted. 139 of the 189 paths in the emergent-epf instance are this
// shape, and a strictly positional resolver rejects all of them.
func TestComponentSubPathResolves(t *testing.T) {
	got, err := orgOpsShape().Resolve("OrgOps.Feedback & Performance.performance-reviews")
	if err != nil {
		t.Fatalf("Resolve: %v", err)
	}
	if got.ComponentID != "feedback-performance" {
		t.Errorf("ComponentID = %q, want feedback-performance", got.ComponentID)
	}
	if got.SubID != "performance-reviews" {
		t.Errorf("SubID = %q, want performance-reviews", got.SubID)
	}
}

// TestSegmentsMatchByAnyWrittenForm. Instances write the same component three
// ways; refusing two of them would reject correct data.
func TestSegmentsMatchByAnyWrittenForm(t *testing.T) {
	m := orgOpsShape()
	for _, p := range []string{
		"OrgOps.FeedbackPerformance.performance-reviews",    // path_segment
		"OrgOps.feedback-performance.performance-reviews",   // id
		"OrgOps.Feedback & Performance.performance-reviews", // name
		"OrgOps.FEEDBACKPERFORMANCE.Performance Reviews",    // case and sub by name
	} {
		if _, err := m.Resolve(p); err != nil {
			t.Errorf("Resolve(%q) = %v, want a match", p, err)
		}
	}
}

// TestAPathToNowhereIsAnError is the control. A resolver that matches
// everything would place definitions against components nobody chose, which is
// worse than placing none.
func TestAPathToNowhereIsAnError(t *testing.T) {
	m := realShapes()
	for _, p := range []string{
		"Product.MemoryReasoningEngine.NoSuchComponent",
		"Product.NoSuchLayer.KnowledgeGraph",
		"Product.KnowledgeGraph.no-such-sub",
		"Product",
		"",
	} {
		if got, err := m.Resolve(p); err == nil {
			t.Errorf("Resolve(%q) = %+v, want an error", p, got)
		}
	}
}

// TestAPathFromAnotherTrackIsRefused. Component names repeat across tracks, so
// resolving without checking the track would place a Commercial definition on a
// Product component.
func TestAPathFromAnotherTrackIsRefused(t *testing.T) {
	if _, err := realShapes().Resolve("Commercial.MemoryReasoningEngine.KnowledgeGraph"); err == nil {
		t.Error("a Commercial path resolved against the Product model")
	}
}

// TestAnAmbiguousPathIsRefusedNotGuessed. Both readings of a three-segment path
// can land on different components. Choosing one silently would attribute work
// to a value generator nobody selected.
func TestAnAmbiguousPathIsRefusedNotGuessed(t *testing.T) {
	m := valuemodel.Model{
		Track: "Product",
		Layers: []valuemodel.Layer{{
			ID: "alpha", PathSegment: "Alpha",
			Components: []valuemodel.Component{
				{ID: "beta", PathSegment: "Beta"},
				// "Alpha" also names a component, whose sub is "Beta" — so
				// "Product.Alpha.Beta" reads both ways.
				{ID: "alpha-comp", PathSegment: "Alpha", Subs: []valuemodel.Sub{{ID: "beta-sub", PathSegment: "Beta"}}},
			},
		}},
	}
	_, err := m.Resolve("Product.Alpha.Beta")
	if err == nil {
		t.Fatal("an ambiguous path resolved instead of being reported")
	}
	if !contains(err.Error(), "ambiguous") {
		t.Errorf("error should name the ambiguity, got: %v", err)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}

// TestParseModelReadsAPayload pins the decode the handler depends on.
func TestParseModelReadsAPayload(t *testing.T) {
	payload := map[string]any{
		"track_name": "Product",
		"layers": []any{map[string]any{
			"id": "memory-reasoning", "name": "Memory Reasoning Engine", "path_segment": "MemoryReasoningEngine",
			"components": []any{map[string]any{
				"id": "knowledge-graph", "name": "Knowledge Graph", "path_segment": "KnowledgeGraph",
				"subs": []any{map[string]any{"id": "graph-queries", "name": "Graph Queries"}},
			}},
		}},
	}
	m := valuemodel.ParseModel(payload)
	got, err := m.Resolve("Product.MemoryReasoningEngine.KnowledgeGraph")
	if err != nil {
		t.Fatalf("Resolve after ParseModel: %v", err)
	}
	if got.ComponentID != "knowledge-graph" {
		t.Errorf("ComponentID = %q", got.ComponentID)
	}
}

// TestParseModelSurvivesMalformedPayload. Payloads come from the database and
// a bad one must not panic a page render.
func TestParseModelSurvivesMalformedPayload(t *testing.T) {
	for _, p := range []map[string]any{
		nil,
		{"layers": "not a list"},
		{"layers": []any{"not a map", map[string]any{"components": []any{42}}}},
	} {
		_ = valuemodel.ParseModel(p)
	}
}

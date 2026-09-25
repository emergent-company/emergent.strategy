package handler

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

// TestContributesToIsReadFromBothSchemaLocations pins the function that
// produces the paths, not a caller that consumes them.
//
// The EPF schemas disagree on where the list lives: features nest it under
// strategic_context, while strategy/org_ops/commercial definitions put it at
// the top level. In the emergent instance that is 63 paths nested against 135
// top-level. Reading only the top level produced no error and no empty result
// worth noticing — the product value model simply rendered as though nothing
// contributed to it.
func TestContributesToIsReadFromBothSchemaLocations(t *testing.T) {
	cases := []struct {
		name    string
		payload string
	}{
		{
			name:    "feature nests it under strategic_context",
			payload: `{"strategic_context":{"contributes_to":["Product.MemoryReasoningEngine.KnowledgeGraph"]}}`,
		},
		{
			name:    "definition puts it at the top level",
			payload: `{"contributes_to":["Product.MemoryReasoningEngine.KnowledgeGraph"]}`,
		},
		{
			name: "both at once are combined, not chosen between",
			payload: `{"contributes_to":["Product.MemoryReasoningEngine.KnowledgeGraph"],` +
				`"strategic_context":{"contributes_to":["Product.MemoryReasoningEngine.Retrieval"]}}`,
		},
	}
	want := map[string]int{
		"feature nests it under strategic_context":      1,
		"definition puts it at the top level":           1,
		"both at once are combined, not chosen between": 2,
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, paths := buildVMComponentDefinition("fd-001", "Engine", "delivered", tc.payload,
				func(k string) string { return "/" + k })
			if len(paths) != want[tc.name] {
				t.Fatalf("read %d paths %v, want %d", len(paths), paths, want[tc.name])
			}
		})
	}
}

// TestAFeatureReachesItsComponent states the outcome the bug destroyed: a
// feature declaring a path is placed against the component that path names.
// The path-count test above can be satisfied by a producer that returns paths
// nobody uses; this fails unless placement actually happens.
func TestAFeatureReachesItsComponent(t *testing.T) {
	model := valuemodel.ParseModel(map[string]any{
		"track_name": "Product",
		"layers": []any{map[string]any{
			"id": "l1", "path_segment": "MemoryReasoningEngine",
			"components": []any{map[string]any{"id": "c-kg", "path_segment": "KnowledgeGraph"}},
		}},
	})

	d, paths := buildVMComponentDefinition("fd-001", "Engine", "delivered",
		`{"strategic_context":{"contributes_to":["Product.MemoryReasoningEngine.KnowledgeGraph"]}}`,
		func(k string) string { return "/" + k })

	result := map[string][]ui.VMComponentDefinition{}
	placeVMDefinition(result, map[string]bool{}, d, paths, model)

	if got := result["c-kg"]; len(got) != 1 || got[0].Key != "fd-001" {
		t.Fatalf("component c-kg holds %v; the feature never reached the component it serves", got)
	}
}

// TestGarbageInThePathListIsNotAPath is the empty-subject control: a reader
// that returns something for every input cannot report that a definition
// contributes nowhere.
func TestGarbageInThePathListIsNotAPath(t *testing.T) {
	for _, payload := range []string{
		`{}`,
		`{"contributes_to":[]}`,
		`{"contributes_to":null}`,
		`{"contributes_to":[""]}`,
		`{"contributes_to":"not-a-list"}`,
		`{"strategic_context":"not-a-map"}`,
	} {
		if _, paths := buildVMComponentDefinition("k", "n", "s", payload,
			func(k string) string { return k }); len(paths) != 0 {
			t.Errorf("payload %s yielded paths %v, want none", payload, paths)
		}
	}
}

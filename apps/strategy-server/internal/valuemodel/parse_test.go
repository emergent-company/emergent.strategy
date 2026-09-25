package valuemodel_test

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/valuemodel"
)

func model(compKey string) map[string]any {
	return map[string]any{
		"track_name": "Product",
		"layers": []any{map[string]any{
			"id": "l1", "path_segment": "MemoryReasoningEngine",
			"components": []any{map[string]any{
				"id": "c1", "path_segment": "KnowledgeGraph",
				compKey: []any{map[string]any{"id": "s1", "path_segment": "Ingestion"}},
			}},
		}},
	}
}

// TestBothSubKeysAreRead pins the parser, not a caller. The emergent instance
// writes L3 sub-components under "subs" in nine components of
// product.epf-runtime and under "sub_components" in five others — one file,
// both spellings — so a parser that knows one key reports the other's paths as
// naming nothing that exists.
func TestBothSubKeysAreRead(t *testing.T) {
	for _, key := range []string{"subs", "sub_components"} {
		t.Run(key, func(t *testing.T) {
			m := valuemodel.ParseModel(model(key))
			if n := len(m.Layers[0].Components[0].Subs); n != 1 {
				t.Fatalf("%s: parsed %d subs, want 1 — this key is invisible to the parser", key, n)
			}
			// The consequence, stated as the caller sees it: a Component.Sub
			// path is resolvable only if the sub was parsed.
			if _, err := m.Resolve("Product.KnowledgeGraph.Ingestion"); err != nil {
				t.Errorf("%s: Component.Sub path did not resolve: %v", key, err)
			}
		})
	}
}

// TestSubsFromBothKeysCoexist is the case the real data actually presents and
// the one a per-key fallback would get wrong: both spellings on one component.
func TestSubsFromBothKeysCoexist(t *testing.T) {
	p := model("subs")
	comp := p["layers"].([]any)[0].(map[string]any)["components"].([]any)[0].(map[string]any)
	comp["sub_components"] = []any{map[string]any{"id": "s2", "path_segment": "Retrieval"}}

	m := valuemodel.ParseModel(p)
	if n := len(m.Layers[0].Components[0].Subs); n != 2 {
		t.Fatalf("parsed %d subs, want 2 — a fallback that stops at the first populated key drops the other", n)
	}
	for _, path := range []string{"Product.KnowledgeGraph.Ingestion", "Product.KnowledgeGraph.Retrieval"} {
		if _, err := m.Resolve(path); err != nil {
			t.Errorf("%s did not resolve: %v", path, err)
		}
	}
}

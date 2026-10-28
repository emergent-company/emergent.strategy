package integrity

import (
	"strings"
	"testing"
)

func TestHashYAML_IgnoresCommentsOrderAndFormatting(t *testing.T) {
	a := "# a comment\nid: pd-001\nname: Example\nitems:\n  - one\n  - two\nscore: 1.0\n"
	b := "name: \"Example\"\nscore: 1\nitems: [one, two]\nid: pd-001\n"

	ha, err := HashYAML([]byte(a))
	if err != nil {
		t.Fatalf("HashYAML a: %v", err)
	}
	hb, err := HashYAML([]byte(b))
	if err != nil {
		t.Fatalf("HashYAML b: %v", err)
	}
	if ha != hb {
		t.Errorf("equivalent documents hash differently:\n a=%s\n b=%s", ha, hb)
	}
}

func TestHashYAML_DetectsContentChange(t *testing.T) {
	tests := []struct {
		name string
		a, b string
	}{
		{"value changed", "id: pd-001\nname: A\n", "id: pd-001\nname: B\n"},
		{"list order changed", "items: [a, b]\n", "items: [b, a]\n"},
		{"key added", "id: x\n", "id: x\nextra: 1\n"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			ha, _ := HashYAML([]byte(tt.a))
			hb, _ := HashYAML([]byte(tt.b))
			if ha == hb {
				t.Errorf("different documents hash the same: %s", ha)
			}
		})
	}
}

// A payload stored in a jsonb column and read back must hash like the YAML it
// came from, including dates (yaml.v3 decodes them as timestamps).
func TestHashJSON_MatchesHashYAMLForStoredPayload(t *testing.T) {
	y := "id: pd-001\nlast_updated: 2026-01-02\nscore: 1.0\nnested:\n  b: 2\n  a: 1\n"
	stored := `{"nested":{"a":1,"b":2},"score":1,"id":"pd-001","last_updated":"2026-01-02T00:00:00Z"}`

	hy, err := HashYAML([]byte(y))
	if err != nil {
		t.Fatalf("HashYAML: %v", err)
	}
	hj, err := HashJSON([]byte(stored))
	if err != nil {
		t.Fatalf("HashJSON: %v", err)
	}
	if hy != hj {
		t.Errorf("stored payload hashes differently from its source YAML:\n yaml=%s\n json=%s", hy, hj)
	}
}

func TestHashYAML_NonStringKeys(t *testing.T) {
	if _, err := HashYAML([]byte("1: a\n2: b\n")); err != nil {
		t.Fatalf("non-string keys must hash, got %v", err)
	}
}

func TestHashYAML_InvalidInput(t *testing.T) {
	if _, err := HashYAML([]byte("a: [unclosed\n")); err == nil {
		t.Error("expected an error for invalid YAML")
	}
	if _, err := HashYAML([]byte("   \n")); err == nil || !strings.Contains(err.Error(), "empty") {
		t.Errorf("expected an empty-document error, got %v", err)
	}
}

package embedded

import (
	"encoding/json"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

// Canonical v2.35.0 put three roadmap shapes in the schema that real instances
// already use: suffixed Key Result ids, future_okrs_* groups, and parked Key
// Results. Each is checked here by the findings it does and does not produce, on
// top of the embedded roadmap template, so the test follows the schema we ship.
func roadmapWithShapes(t *testing.T, edit func(product map[string]any)) []byte {
	t.Helper()
	raw, err := GetTemplate("READY/05_roadmap_recipe.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var doc map[string]any
	if err := yaml.Unmarshal(raw, &doc); err != nil {
		t.Fatal(err)
	}
	product := doc["roadmap"].(map[string]any)["tracks"].(map[string]any)["product"].(map[string]any)
	edit(product)
	out, err := json.Marshal(doc)
	if err != nil {
		t.Fatal(err)
	}
	return out
}

func findingsUnder(t *testing.T, payload []byte, prefix string) []string {
	t.Helper()
	var got []string
	for _, f := range ValidateArtifact("roadmap_recipe", payload).Findings {
		if strings.HasPrefix(f.Path, prefix) {
			got = append(got, f.Rule+" "+f.Path)
		}
	}
	return got
}

func firstKRs(product map[string]any) []any {
	return product["okrs"].([]any)[0].(map[string]any)["key_results"].([]any)
}

func TestRoadmapSchema_AcceptsASuffixedKeyResultID(t *testing.T) {
	payload := roadmapWithShapes(t, func(p map[string]any) {
		firstKRs(p)[0].(map[string]any)["id"] = "kr-p-api-001"
	})
	if got := findingsUnder(t, payload, "/roadmap/tracks/product/okrs/0/key_results/0/id"); len(got) != 0 {
		t.Errorf("a suffixed id is rejected: %v", got)
	}
}

func TestRoadmapSchema_ChecksKeyResultsInAFutureGroup(t *testing.T) {
	group := func(krID string) func(map[string]any) {
		return func(p map[string]any) {
			p["future_okrs_q3_2026"] = []any{map[string]any{
				"id": "okr-p-security", "objective": "A later objective",
				"key_results": []any{map[string]any{"id": krID, "description": "d", "target": "t"}},
			}}
		}
	}
	const kr = "/roadmap/tracks/product/future_okrs_q3_2026/0/key_results/0"

	if got := findingsUnder(t, roadmapWithShapes(t, group("kr-p-ct-001")), "/roadmap/tracks/product/future_okrs_q3_2026"); len(got) != 0 {
		t.Errorf("a valid future group is rejected: %v", got)
	}
	if got := findingsUnder(t, roadmapWithShapes(t, group("kr-x-1")), kr+"/id"); len(got) == 0 {
		t.Error("a Key Result with a bad id inside future_okrs_* is not checked: the group is still free-form")
	}
}

func TestRoadmapSchema_AParkedKeyResultNeedsItsReason(t *testing.T) {
	parked := func(reason string) func(map[string]any) {
		return func(p map[string]any) {
			kr := firstKRs(p)[0].(map[string]any)
			kr["status"] = "parked"
			if reason != "" {
				kr["parked_reason"] = reason
			}
		}
	}
	const krPath = "/roadmap/tracks/product/okrs/0/key_results/0"
	exact := func(payload []byte) []string {
		var got []string
		for _, f := range ValidateArtifact("roadmap_recipe", payload).Findings {
			if f.Path == krPath {
				got = append(got, f.Rule)
			}
		}
		return got
	}

	if got := exact(roadmapWithShapes(t, parked("Set aside until the platform decision is made"))); len(got) != 0 {
		t.Errorf("a parked Key Result with a reason is rejected: %v", got)
	}
	if got := exact(roadmapWithShapes(t, parked(""))); len(got) != 1 || got[0] != "schema.required" {
		t.Errorf("a parked Key Result without a reason gives %v, want one schema.required on the Key Result", got)
	}
}

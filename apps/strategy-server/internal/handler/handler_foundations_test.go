package handler

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func renderFoundations(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).strategyFoundationsContent(ui.NavContext{}, "strategy_foundations", "Strategy Foundations", "draft", payload)
	if c == nil {
		t.Fatal("no view was built")
	}
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

// Every property of the strategy_foundations schema has a dedicated view. Two
// failures are reported: a property the view does not declare as shown (it would
// only reach the page through the generic fallback), and one it declares but does
// not render.
func TestStrategyFoundationsViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := sampleOfSchema(t, "strategy_foundations_schema.json", 0, 60)

	if left := foundationsUnshown(payload); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}

	page := renderFoundations(t, payload)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// The canonical template does not follow the schema in every field: it writes
// plain strings where the schema has objects (success indicators, proof points,
// design principles), objects where the schema has strings (jobs to be done,
// feelings, pains), and has fields the schema lacks (information discovery as an
// object, the validated-against list, the triggered updates). Both validate.
func TestStrategyFoundationsViewShowsEveryStringOfTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("READY/02_strategy_foundations.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	want := leafStrings(payload)
	if len(want) < 60 {
		t.Fatalf("collected only %d strings from the template; it changed shape", len(want))
	}
	page := renderFoundations(t, payload)
	if missing := missingFromPage(page, want, true); len(missing) > 0 {
		t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Errorf("the template follows what the view reads and must not get the notice")
	}
}

// The consistency validation and the change log sit beside the root block in a
// wrapped payload and inside it in an unwrapped one.
func TestStrategyFoundationsViewTakesAPayloadWithoutItsRootKey(t *testing.T) {
	wrapped, markers := sampleOfSchema(t, "strategy_foundations_schema.json", 0, 60)
	flat, _ := wrapped["strategy_foundations"].(map[string]any)
	flat["consistency_validation"] = wrapped["consistency_validation"]
	flat["change_log"] = wrapped["change_log"]

	page := renderFoundations(t, flat)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d fields are not on the page of an unwrapped payload:\n  %s", len(missing), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("an unwrapped payload got the notice")
	}
}

func TestStrategyFoundationsViewShowsUnknownKeysInsideAndBesideTheRoot(t *testing.T) {
	payload, _ := sampleOfSchema(t, "strategy_foundations_schema.json", 0, 60)
	root := payload["strategy_foundations"].(map[string]any)
	root["foo_analysis"] = map[string]any{"finding": "A finding under a key nobody has a view for."}
	root["product_vision"].(map[string]any)["extra_note"] = "A field inside a known section."
	payload["extra_block"] = map[string]any{"note": "A note beside the root."}

	page := renderFoundations(t, payload)
	for _, s := range []string{"A finding under a key nobody has a view for.", "A field inside a known section.", "A note beside the root."} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if !strings.Contains(page, "3 sections are stored but have no dedicated view") {
		t.Error("the notice should count the three sections with no dedicated view")
	}
}

// The jobs, feelings, pains and benefits used to be read from directly under
// value_proposition, which is where no schema or template puts them. An instance
// written that way still shows them.
func TestStrategyFoundationsViewKeepsReadingTheNamesItAlwaysRead(t *testing.T) {
	payload := map[string]any{"strategy_foundations": map[string]any{
		"product_vision": map[string]any{"statement": "A vision.", "timeframe": "Five years"},
		"value_proposition": map[string]any{
			"headline":           "A headline.",
			"jobs_to_be_done":    []any{"Find the right data"},
			"key_benefits":       []any{"Saves an hour a day"},
			"pains_we_eliminate": []any{"Copying between tools"},
			"feelings_we_create": []any{"In control"},
		},
		"strategic_sequencing": map[string]any{"principle": "Land, then expand."},
		"design_principles":    []any{map[string]any{"principle": "Show less", "manifestation": "One screen per task"}},
	}}
	page := renderFoundations(t, payload)
	for _, s := range []string{"A vision.", "Five years", "A headline.", "Find the right data", "Saves an hour a day",
		"Copying between tools", "In control", "Land, then expand.", "Show less", "One screen per task"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("these names have a place in the dedicated view and must not be reported as unshown")
	}
}

// A section shows when any of its content is stored, and a phase number, which
// is a number in the schema, reaches the page as text.
func TestStrategyFoundationsViewShowsASectionWhoseGateFieldIsAbsent(t *testing.T) {
	payload := map[string]any{"strategy_foundations": map[string]any{
		"product_vision":    map[string]any{"vision_alignment": map[string]any{"differentiator": "Only we do it offline."}},
		"value_proposition": map[string]any{"consistency_check": map[string]any{"solves_problem": "Scattered data."}},
		"strategic_sequencing": map[string]any{
			"sequencing_constraints": map[string]any{"alternative_considered": "Horizontal first."},
			"phases": []any{map[string]any{
				"phase": float64(2), "name": "Expand", "target_problem": "Reporting by hand",
				"success_criteria": []any{map[string]any{"metric": "Weekly reports", "target": "200"}},
			}},
		},
		"information_architecture": map[string]any{"architecture_philosophy": "Task first."},
	}}
	page := renderFoundations(t, payload)
	for _, s := range []string{"Only we do it offline.", "Scattered data.", "Horizontal first.", "Reporting by hand",
		"Weekly reports", "200", "Task first.", "Phase 2"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

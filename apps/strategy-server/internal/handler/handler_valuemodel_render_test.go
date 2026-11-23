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

func renderValueModel(t *testing.T, payload map[string]any) string {
	t.Helper()
	data := valueModelData(ui.NavContext{}, "value-model", "Value Model", "active", payload, nil)
	var buf bytes.Buffer
	if err := ui.ValueModelContent(data).Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

// Every property of the value_model schema has a dedicated view. Two failures are
// reported: a property the view does not declare as shown (it would only reach the
// page through the generic fallback), and one it declares but does not render.
func TestValueModelViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := sampleOfSchema(t, "value_model_schema.json", 0, 60)

	if left := valueModelUnshown(payload); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}

	page := renderValueModel(t, payload)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// The four canonical value model templates write the sub-components under "subs"
// and mark layers and components active. Everything they carry reaches the page.
func TestValueModelViewShowsEveryStringOfTheCanonicalTemplates(t *testing.T) {
	for _, file := range []string{"strategy", "commercial", "org_ops", "product"} {
		t.Run(file, func(t *testing.T) {
			raw, err := embedded.GetTemplate("FIRE/value_models/" + file + ".value_model.yaml")
			if err != nil {
				t.Fatal(err)
			}
			var payload map[string]any
			if err := yaml.Unmarshal(raw, &payload); err != nil {
				t.Fatal(err)
			}
			want := leafStrings(payload)
			if len(want) < 8 {
				t.Fatalf("collected only %d strings from the template; it changed shape", len(want))
			}
			page := renderValueModel(t, payload)
			if missing := missingFromPage(page, want, true); len(missing) > 0 {
				t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
			}
			if strings.Contains(page, "no dedicated view") {
				t.Error("the template follows what the view reads and must not get the notice")
			}
		})
	}
}

// The sub-components of one component may sit under "subs" and "sub_components" at
// once, as they do inside a single model of the emergent instance. The page used to
// show whichever it met first.
func TestValueModelViewShowsSubComponentsFromBothKeys(t *testing.T) {
	payload := map[string]any{"layers": []any{map[string]any{
		"id": "l1", "name": "Layer",
		"components": []any{map[string]any{
			"id": "c1", "name": "Component",
			"sub_components": []any{map[string]any{"id": "s1", "name": "Under sub_components", "active": true}},
			"subs":           []any{map[string]any{"id": "s2", "name": "Under subs", "active": false}},
		}},
	}}}
	page := renderValueModel(t, payload)
	for _, s := range []string{"Under sub_components", "Under subs"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
}

// The schema makes a sub-component's maturity an object; earlier models wrote the
// stage as a string. Both give the badge, and the object's detail is shown.
func TestValueModelViewShowsMaturityAsAStringAndAsAnObject(t *testing.T) {
	payload := map[string]any{"layers": []any{map[string]any{
		"id": "l1", "name": "Layer",
		"components": []any{map[string]any{
			"id": "c1", "name": "Component",
			"sub_components": []any{
				map[string]any{"id": "s1", "name": "Old style", "active": true, "maturity": "proven"},
				map[string]any{"id": "s2", "name": "Schema style", "active": true, "maturity": map[string]any{
					"stage": "emerging", "milestone_achieved": "problem_approach_fit", "milestone_notes": "Two pilots ran.",
					"evidence": []any{map[string]any{"type": "usage_metric", "description": "Weekly use doubled.", "date": "2026-10-01", "source": "Analytics"}},
				}},
			},
		}},
	}}}
	page := renderValueModel(t, payload)
	for _, s := range []string{">proven<", ">emerging<", "problem_approach_fit", "Two pilots ran.", "Weekly use doubled.", "2026-10-01", "Analytics"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
}

// Content that no dedicated view has is shown as stored, under a notice, wherever
// it sits: at the top, inside the free-form high-level model, inside a layer.
func TestValueModelViewShowsUnknownKeysAtEveryLevel(t *testing.T) {
	payload, _ := sampleOfSchema(t, "value_model_schema.json", 0, 60)
	payload["foo_analysis"] = map[string]any{"finding": "A finding under a key nobody has a view for."}
	payload["high_level_model"] = map[string]any{
		"product_mission": "A mission.",
		"journeys":        map[string]any{"first": "A free-form entry in the high-level model."},
	}
	layers := payload["layers"].([]any)
	layers[0].(map[string]any)["extra_note"] = "A field inside a layer."
	comp := layers[0].(map[string]any)["components"].([]any)[0].(map[string]any)
	comp["sub_components"].([]any)[0].(map[string]any)["extra_flag"] = "A field inside a sub-component."

	page := renderValueModel(t, payload)
	for _, s := range []string{
		"A finding under a key nobody has a view for.", "A free-form entry in the high-level model.",
		"A field inside a layer.", "A field inside a sub-component.", "A mission.",
	} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if !strings.Contains(page, "3 sections are stored but have no dedicated view") {
		t.Error("the notice should count the top-level key, the high-level model and the layers")
	}
}

// A model with a track maturity and nothing else still shows it: the section is
// not gated on there being layers.
func TestValueModelViewShowsTheTrackMaturityOnItsOwn(t *testing.T) {
	payload := map[string]any{
		"track_name": "Strategy",
		"track_maturity": map[string]any{
			"overall_stage": "emerging", "value_domain": "Competitive landscape", "current_milestone": "problem_approach_fit",
			"next_milestone_criteria": []any{map[string]any{"description": "Show a repeatable result.", "status": "not_met"}},
			"l1_distribution":         map[string]any{"emerging": float64(2), "proven": float64(1)},
		},
		"activation_notes": "Flip active on as you invest.",
	}
	page := renderValueModel(t, payload)
	for _, s := range []string{"Competitive landscape", "problem_approach_fit", "Show a repeatable result.", "not_met", "Flip active on as you invest."} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

// A main goal without a mission or product goals is still shown; the section used
// to need one of the other two.
func TestValueModelViewShowsAMainGoalOnItsOwn(t *testing.T) {
	page := renderValueModel(t, map[string]any{"high_level_model": map[string]any{"main_goal": "Make the first report in a day."}})
	if !strings.Contains(page, "Make the first report in a day.") {
		t.Error("the main goal is not on the page")
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

// Enums, numbers and booleans carry no marker in the schema test, so they are
// pinned here: the maturity summaries of a layer and a component, the stage
// counts, and a premium sub-component.
func TestValueModelViewShowsMaturitySummariesAndThePremiumFlag(t *testing.T) {
	payload := map[string]any{"layers": []any{map[string]any{
		"id": "l1", "name": "Layer",
		"maturity_summary": map[string]any{
			"calculated_stage": "emerging", "stage_override": true,
			"l2_distribution": map[string]any{"emerging": float64(3), "proven": float64(1)},
		},
		"components": []any{map[string]any{
			"id": "c1", "name": "Component",
			"maturity_summary": map[string]any{
				"calculated_stage": "proven",
				"l3_distribution":  map[string]any{"scaled": float64(4)},
			},
			"sub_components": []any{map[string]any{"id": "s1", "name": "Paid thing", "active": true, "premium": true}},
		}},
	}}}
	page := renderValueModel(t, payload)
	for _, s := range []string{"Calculated stage: emerging", "Stage override: true", "Emerging: 3", "Proven: 1",
		"Calculated stage: proven", "Scaled: 4", ">premium<"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

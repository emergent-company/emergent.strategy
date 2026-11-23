package handler

import (
	"bytes"
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func renderFeature(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).featureViewContent(ui.NavContext{}, "fd-001", "Feature", "draft", payload)
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

// Every string property of the feature_definition schema has a dedicated view:
// it is declared as shown and it is on the page.
func TestFeatureViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := sampleOfSchema(t, "feature_definition_schema.json", 0, 80)

	if left := featureUnshown(payload); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}
	page := renderFeature(t, payload)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// Numbers, enums and lifecycle values carry no marker in the schema sample, so
// they are checked here with values that can be told apart on the page.
func TestFeatureViewShowsNumbersAndEnums(t *testing.T) {
	payload := map[string]any{
		"id": "fd-042", "name": "Stored Name", "status": "in-progress",
		"feature_maturity": map[string]any{
			"overall_stage":       "emerging",
			"capability_maturity": []any{map[string]any{"capability_id": "cap-007", "stage": "proven"}},
		},
		"implementation": map[string]any{
			"scenarios": []any{map[string]any{"name": "s", "jtbd_category": "discover-things"}},
		},
		"implementation_references": map[string]any{
			"coverage_summary": map[string]any{"capabilities_covered": float64(3), "capabilities_total": float64(11), "scenarios_tested": float64(5), "scenarios_total": float64(13)},
			"specs":            []any{map[string]any{"id": "spec-9", "status": "implemented"}},
		},
	}
	page := (&Server{}).featureViewContent(ui.NavContext{}, "fd-042", "Artifact Name", "draft", payload)
	var buf bytes.Buffer
	if err := page.Render(context.Background(), &buf); err != nil {
		t.Fatal(err)
	}
	out := buf.String()
	for _, want := range []string{"fd-042", "Stored name: Stored Name", "in-progress", "emerging", "cap-007", "proven", "discover-things",
		"Capabilities covered:</span> 3", "Capabilities total:</span> 11", "Scenarios tested:</span> 5", "Scenarios total:</span> 13", "spec-9", "implemented"} {
		if !strings.Contains(out, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(out, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// A key the schema does not define is shown as stored, at every level, under the
// notice, and a field the schema calls a list may arrive as a lone string.
func TestFeatureViewShowsUnknownKeysUnderTheNotice(t *testing.T) {
	payload := map[string]any{
		"unknown_top":       "top-level-extra-text",
		"strategic_context": map[string]any{"tracks": "product", "unknown_mid": "mid-level-extra-text"},
		"definition": map[string]any{
			"capabilities": []any{map[string]any{"name": "cap", "unknown_leaf": "list-item-extra-text"}},
			"personas":     []any{map[string]any{"name": "p", "demographics": map[string]any{"unknown_demo": "demographics-extra-text", "industry": "lone-industry"}}},
		},
	}
	page := renderFeature(t, payload)
	for _, want := range []string{"top-level-extra-text", "mid-level-extra-text", "list-item-extra-text", "demographics-extra-text", "lone-industry"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if !strings.Contains(page, "no dedicated view") {
		t.Error("stored content with no view got no notice")
	}
}

// A persona's demographics and psychographics are on the page.
func TestFeatureViewShowsPersonaProfileAlone(t *testing.T) {
	payload := map[string]any{"definition": map[string]any{"personas": []any{map[string]any{
		"name": "p", "psychographics": map[string]any{"fears": []any{"fear-of-x"}, "decision_style": "decides-fast"},
	}}}}
	page := renderFeature(t, payload)
	if !strings.Contains(page, "fear-of-x") || !strings.Contains(page, "decides-fast") {
		t.Error("the persona profile is not on the page")
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the persona profile got the notice")
	}
}

// A payload may hold scenarios in the schema location and in the older one; both
// are shown.
func TestFeatureViewShowsScenariosFromBothLocations(t *testing.T) {
	payload := map[string]any{
		"implementation": map[string]any{"scenarios": []any{map[string]any{"name": "schema-scenario", "outcome": "schema-outcome"}}},
		"definition":     map[string]any{"scenarios": []any{map[string]any{"name": "legacy-scenario", "outcome": "legacy-outcome"}}},
	}
	page := renderFeature(t, payload)
	for _, want := range []string{"schema-scenario", "schema-outcome", "legacy-scenario", "legacy-outcome"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("scenarios in a known location got the notice")
	}
}

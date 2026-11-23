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

func renderLRA(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).lraContent(ui.NavContext{}, "living_reality_assessment", "Living Reality Assessment", "draft", payload)
	if c == nil {
		t.Fatal("no view was built")
	}
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

// Every string property of the living_reality_assessment schema has a dedicated
// view: it is declared as shown and it is on the page.
func TestLRAViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := sampleOfSchema(t, "living_reality_assessment_schema.json", 0, 40)

	if left := lraUnshown(payload); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}

	page := renderLRA(t, payload)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// Numbers, booleans and enums carry no marker in the schema sample, so they are
// checked here with values that can be told apart on the page.
func TestLRAViewShowsNumbersBooleansAndEnums(t *testing.T) {
	payload := map[string]any{
		"metadata":         map[string]any{"adoption_level": float64(3), "cycles_completed": float64(4), "lifecycle_stage": "scaling", "bootstrap_type": "migration"},
		"adoption_context": map[string]any{"team_size": float64(17), "runway_months": 18.5, "funding_stage": "seed"},
		"current_focus":    map[string]any{"attention_allocation": map[string]any{"product": float64(55), "strategy": float64(45)}},
		"existing_assets": map[string]any{
			"code_assets":     map[string]any{"exists": true, "maturity": "prototype"},
			"customer_assets": map[string]any{"has_users": false, "user_count_estimate": "10-100"},
		},
		"constraints_and_assumptions": map[string]any{
			"capability_gaps": []any{map[string]any{"gap": "no designer", "track": "product", "mitigation_status": "planned"}},
		},
		"evolution_log": []any{map[string]any{
			"summary": "first", "trigger": "manual_update",
			"changes":          []any{map[string]any{"section": "metadata", "field": "cycles_completed", "change_type": "modified", "previous_value": float64(3), "new_value": float64(4)}},
			"signals_snapshot": map[string]any{"org_ops": map[string]any{"velocity": "slow", "quality": "medium"}},
		}},
	}
	page := renderLRA(t, payload)
	for _, want := range []string{"Level 3", "4 cycles completed", "scaling", "migration", "17", "18.5", "seed", "55", "45",
		"Exists:</span> true", "Has users:</span> false", "10-100", "no designer", "planned",
		"Before: 3", "After: 4", "org_ops: slow / medium"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// The canonical template follows what the view reads. Fields the schema lacks
// (such as created_by) are allowed to reach the notice, never to vanish.
func TestLRAViewShowsEveryStringOfTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("AIM/living_reality_assessment.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	want := leafStrings(payload)
	if len(want) < 20 {
		t.Fatalf("collected only %d strings from the template; it changed shape", len(want))
	}
	page := renderLRA(t, payload)
	if missing := missingFromPage(page, want, true); len(missing) > 0 {
		t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
	}
}

// A layout the schema does not define is not read as an alias; it is shown as
// stored, under the notice.
func TestLRAViewShowsOlderLayoutsUnderTheNotice(t *testing.T) {
	payload := map[string]any{
		"adoption_context": map[string]any{"org_type": "legacy-org-label", "ai_capability": "legacy-ai-label"},
		"constraints":      []any{map[string]any{"constraint": "legacy-constraint-text"}},
		"current_focus":    map[string]any{"cycle_ref": "legacy-cycle-ref"},
	}
	page := renderLRA(t, payload)
	for _, want := range []string{"legacy-org-label", "legacy-ai-label", "legacy-constraint-text", "legacy-cycle-ref"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if !strings.Contains(page, "no dedicated view") && !strings.Contains(page, "have no dedicated view") {
		t.Error("stored content with no view got no notice")
	}
}

// Track baselines are shown in the order of the tracks, not in map order.
func TestLRAViewOrdersTrackBaselines(t *testing.T) {
	bl := map[string]any{}
	for _, tr := range []string{"commercial", "org_ops", "strategy", "product"} {
		bl[tr] = map[string]any{"description": "desc-of-" + tr}
	}
	for i := 0; i < 20; i++ {
		page := renderLRA(t, map[string]any{"track_baselines": bl})
		prev := -1
		for _, tr := range []string{"product", "strategy", "org_ops", "commercial"} {
			at := strings.Index(page, "desc-of-"+tr)
			if at < prev {
				t.Fatalf("track %s is out of order", tr)
			}
			prev = at
		}
	}
}

// An older layout lists the baselines and names the track in each.
func TestLRAViewShowsListedTrackBaselines(t *testing.T) {
	page := renderLRA(t, map[string]any{"track_baselines": []any{map[string]any{"track": "product", "description": "listed-baseline-text"}}})
	if !strings.Contains(page, "listed-baseline-text") || !strings.Contains(page, "Product") {
		t.Error("a listed baseline is not on the page")
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a listed baseline got the notice")
	}
}

// A section shows when any of its content is stored, so the organisation context
// is on the page when only the runway is.
func TestLRAViewShowsOrganisationContextForRunwayAlone(t *testing.T) {
	page := renderLRA(t, map[string]any{"adoption_context": map[string]any{"runway_months": float64(14)}})
	if !strings.Contains(page, "Runway (months)") || !strings.Contains(page, ">14<") {
		t.Error("the runway is not on the page")
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the runway got the notice")
	}
}

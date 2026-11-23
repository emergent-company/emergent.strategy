package handler

import (
	"bytes"
	"context"
	"html"
	"sort"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

func renderFormula(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).strategyFormulaContent(ui.NavContext{}, "strategy_formula", "Strategy Formula", "draft", payload)
	if c == nil {
		t.Fatal("no view was built")
	}
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

func missingFromPage(page string, want []string, fold bool) []string {
	if fold {
		page = strings.ToLower(page)
	}
	var missing []string
	for _, s := range want {
		needle := html.EscapeString(s)
		if fold {
			needle = strings.ToLower(needle)
		}
		if !strings.Contains(page, needle) {
			missing = append(missing, s)
		}
	}
	return missing
}

// Every property of the strategy_formula schema has a dedicated view, in both
// shapes of every field the schema lets be a string or an object. Two failures
// are reported: a property the view does not declare as shown (it would only
// reach the page through the generic fallback), and one it declares but does not
// render.
func TestStrategyFormulaViewShowsEveryFieldOfTheSchema(t *testing.T) {
	for pick := 0; pick < 2; pick++ {
		payload, markers := sampleOfSchema(t, "strategy_formula_schema.json", pick, 60)

		if left := formulaUnshown(payload); left != nil {
			var keys []string
			for k := range left {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			t.Errorf("variant %d: schema properties with no dedicated view, under: %s", pick, strings.Join(keys, ", "))
		}

		page := renderFormula(t, payload)
		if missing := missingFromPage(page, markers, false); len(missing) > 0 {
			t.Errorf("variant %d: %d of %d schema fields are not on the page:\n  %s", pick, len(missing), len(markers), strings.Join(missing, "\n  "))
		}
		if strings.Contains(page, "no dedicated view") {
			t.Errorf("variant %d: a payload that follows the schema got the 'stored but not shown' notice", pick)
		}
	}
}

// The canonical template writes plain strings where the schema also allows
// objects (advantages, capabilities, drivers, constraints, growth engines). The
// page used to skip every one of them.
func TestStrategyFormulaViewShowsEveryStringOfTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("READY/04_strategy_formula.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	want := leafStrings(payload)
	if len(want) < 15 {
		t.Fatalf("collected only %d strings from the template; it changed shape", len(want))
	}
	page := renderFormula(t, payload)
	if missing := missingFromPage(page, want, true); len(missing) > 0 {
		t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the template follows what the view reads and must not get the notice")
	}
}

// A payload is stored either wrapped in its strategy root key or already
// unwrapped; both must give the same page.
func TestStrategyFormulaViewTakesAPayloadWithoutItsRootKey(t *testing.T) {
	wrapped, markers := sampleOfSchema(t, "strategy_formula_schema.json", 0, 60)
	flat, _ := wrapped["strategy"].(map[string]any)
	flat["change_log"] = wrapped["change_log"]

	page := renderFormula(t, flat)
	if missing := missingFromPage(page, markers, false); len(missing) > 0 {
		t.Errorf("%d fields are not on the page of an unwrapped payload:\n  %s", len(missing), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("an unwrapped payload got the notice")
	}
}

// Content that no dedicated view has is shown as stored, under a notice, whether
// it sits inside the strategy or beside it.
func TestStrategyFormulaViewShowsUnknownKeysInsideAndBesideTheStrategy(t *testing.T) {
	payload, _ := sampleOfSchema(t, "strategy_formula_schema.json", 0, 60)
	strategy := payload["strategy"].(map[string]any)
	strategy["foo_analysis"] = map[string]any{"finding": "A finding under a key nobody has a view for."}
	payload["extra_block"] = map[string]any{"note": "A note beside the strategy."}

	page := renderFormula(t, payload)
	for _, s := range []string{"A finding under a key nobody has a view for.", "A note beside the strategy."} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if !strings.Contains(page, "2 sections are stored but have no dedicated view") {
		t.Error("the notice should count the two sections with no dedicated view")
	}
}

// key_differences and a unit economics object are free-form in the schema. What
// they hold is shown, as scalars where the view has a place for them and through
// the fallback where it does not.
func TestStrategyFormulaViewShowsFreeFormFields(t *testing.T) {
	payload := map[string]any{"strategy": map[string]any{
		"competitive_moat": map[string]any{"vs_competitors": []any{map[string]any{
			"competitor": "Rival", "their_strength": "Reach", "our_angle": "Depth", "wedge": "Niche",
			"key_differences": []any{map[string]any{"feature": "Offline mode", "us": "Yes", "them": "No"}},
		}}},
		"business_model": map[string]any{"unit_economics": map[string]any{
			"payback_months": "9",
			"by_tier":        map[string]any{"small": "Break-even in a year"},
		}},
	}}
	page := renderFormula(t, payload)
	dedicated, fallback, found := strings.Cut(page, `id="stored-not-shown"`)
	if !found {
		t.Fatal("nested free-form content has no dedicated view and needs the notice")
	}
	// A scalar one level down has a place in the unit economics card; anything
	// nested deeper, and the key differences, come through the fallback.
	for _, s := range []string{"payback_months", ">9<"} {
		if !strings.Contains(dedicated, s) {
			t.Errorf("the dedicated view is missing %q", s)
		}
		if strings.Contains(fallback, s) {
			t.Errorf("%q is shown twice: the fallback repeats the dedicated view", s)
		}
	}
	for _, s := range []string{"Offline mode", "Break-even in a year"} {
		if !strings.Contains(fallback, s) {
			t.Errorf("the fallback is missing %q", s)
		}
	}
	if !strings.Contains(page, "2 sections are stored but have no dedicated view") {
		t.Error("the notice should count the competitive moat and the business model")
	}
}

// A page written to field names the schema does not list but earlier versions of
// this view read (and instances in use carry) still shows them, without a notice.
func TestStrategyFormulaViewKeepsReadingTheNamesItAlwaysRead(t *testing.T) {
	payload := map[string]any{"strategy": map[string]any{
		"positioning":    map[string]any{"positioning_statement": "A statement.", "category_position": "A position."},
		"business_model": map[string]any{"pricing_philosophy": "Value based.", "pricing_tiers": []any{map[string]any{"tier": "Team", "purpose": "Small groups", "limits": "Ten seats"}}},
		"success_metrics": map[string]any{
			"north_star_metric":  "Weekly active teams",
			"supporting_metrics": []any{map[string]any{"metric": "Activation", "target_phase_1": "40%", "why": "Shows early value"}},
		},
		"trade_offs": []any{map[string]any{"decision": "Focus", "rationale": "Depth first", "what_we_gain": "Speed", "what_we_give_up": "Breadth"}},
		"ecosystem_differentiation": map[string]any{
			"summary":              "One system.",
			"ecosystem_components": []any{map[string]any{"component": "Core", "metaphor": "The hub"}},
		},
	}}
	page := renderFormula(t, payload)
	for _, s := range []string{"A statement.", "A position.", "Value based.", "Small groups", "Ten seats", "Weekly active teams",
		"Activation", "40%", "Shows early value", "Speed", "Breadth", "One system.", "The hub"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("these names have a place in the dedicated view and must not be reported as unshown")
	}
}

// A section shows when any of its content is stored, not only when one chosen
// field is. These sections used to be gated on a single field.
func TestStrategyFormulaViewShowsASectionWhoseGateFieldIsAbsent(t *testing.T) {
	payload := map[string]any{"strategy": map[string]any{
		"competitive_moat":          map[string]any{"differentiation": "Different in kind.", "barriers_to_entry": "Years of data."},
		"value_creation":            map[string]any{"value_drivers": []any{"Network effects"}, "key_capabilities": []any{"Fast ingest"}},
		"business_model":            map[string]any{"growth_engines": []any{"Partner channel"}, "unit_economics": "Low CAC."},
		"ecosystem_differentiation": map[string]any{"vs_point_solutions": "Point tools stop at one step."},
		"constraints":               []any{"Small team"},
		"success_metrics":           map[string]any{"leading_indicators": []any{map[string]any{"metric": "Trials started"}}},
	}}
	page := renderFormula(t, payload)
	for _, s := range []string{"Different in kind.", "Years of data.", "Network effects", "Fast ingest", "Partner channel",
		"Low CAC.", "Point tools stop at one step.", "Small team", "Trials started"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

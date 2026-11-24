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

func renderInsightAnalyses(t *testing.T, payload map[string]any) string {
	t.Helper()
	c := (&Server{}).insightAnalysesContent(ui.NavContext{}, "insight_analyses", "Insight Analyses", "draft", payload)
	if c == nil {
		t.Fatal("no view was built")
	}
	var buf bytes.Buffer
	if err := c.Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

func insightSchemaSample(t *testing.T) (map[string]any, []string) {
	t.Helper()
	return sampleOfSchema(t, "insight_analyses_schema.json", 0, 80)
}

// leafStrings returns the first line of every non-empty string in v, at any depth.
func leafStrings(v any) []string {
	var out []string
	switch t := v.(type) {
	case map[string]any:
		for _, e := range t {
			out = append(out, leafStrings(e)...)
		}
	case []any:
		for _, e := range t {
			out = append(out, leafStrings(e)...)
		}
	default:
		out = strs(v)
	}
	return out
}

// Every property of the insight_analyses schema has a dedicated view. Two
// failures are possible and both are reported: a property the view does not
// declare as shown (it would only reach the page through the generic fallback),
// and one it declares but does not render.
func TestInsightAnalysesViewShowsEveryFieldOfTheSchema(t *testing.T) {
	payload, markers := insightSchemaSample(t)

	if left := unshownContent(payload, insightShownPaths); left != nil {
		var keys []string
		for k := range left {
			keys = append(keys, k)
		}
		sort.Strings(keys)
		t.Errorf("schema properties with no dedicated view, under: %s", strings.Join(keys, ", "))
	}

	page := renderInsightAnalyses(t, payload)
	var missing []string
	for _, m := range markers {
		if !strings.Contains(page, html.EscapeString(m)) {
			missing = append(missing, m)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%d of %d schema fields are not on the page:\n  %s", len(missing), len(markers), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a payload that follows the schema got the 'stored but not shown' notice")
	}
}

// Since canonical 2.37.0 the template follows the schema, so every string of it
// has a dedicated view and the page carries no notice. (Before, strengths carried
// "description" where the schema has "strength", and the fallback had to show it.)
func TestInsightAnalysesViewShowsEveryStringOfTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("READY/01_insight_analyses.yaml")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := yaml.Unmarshal(raw, &payload); err != nil {
		t.Fatal(err)
	}
	want := leafStrings(payload)
	if len(want) < 100 {
		t.Fatalf("collected only %d strings from the template; it changed shape", len(want))
	}

	// The page may capitalise a value (a market stage becomes "Growing market").
	page := strings.ToLower(renderInsightAnalyses(t, payload))
	var missing []string
	for _, s := range want {
		if !strings.Contains(page, strings.ToLower(html.EscapeString(s))) {
			missing = append(missing, s)
		}
	}
	if len(missing) > 0 {
		t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the canonical template got the 'stored but not shown' notice")
	}
}

// A file written to an older layout validates, because the schema allows extra
// properties. The page used to show only the competitors.
func TestInsightAnalysesViewShowsALegacyLayout(t *testing.T) {
	payload := map[string]any{
		"last_updated":     "2026-11-19",
		"confidence_level": "medium",
		"swot_analysis": map[string]any{"strengths": []any{
			map[string]any{"id": "s1", "area": "Technology", "description": "A strength that is stored but never rendered."},
		}},
		"trend_analysis": map[string]any{"macro_trends": []any{
			map[string]any{"trend": "A trend that is stored but never rendered."},
		}},
		"competitive_landscape": map[string]any{"direct_competitors": []any{
			map[string]any{"name": "Rendered", "positioning": "This is the only block that shows."},
		}},
	}
	page := renderInsightAnalyses(t, payload)
	for _, s := range []string{
		"A strength that is stored but never rendered.", "Technology",
		"A trend that is stored but never rendered.", "This is the only block that shows.",
	} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if !strings.Contains(page, "2 sections are stored but have no dedicated view") {
		t.Errorf("the notice should count the two sections with no dedicated view")
	}

	// The completeness check counts the legacy keys as present, and the page now
	// shows them, so the two agree: nothing is reported present that is not shown.
	present := map[string]bool{}
	for _, g := range checkInsightGaps(payload) {
		present[g.Label] = g.Present
	}
	if !present["Trends"] || !present["SWOT"] {
		t.Errorf("legacy trend_analysis and swot_analysis should count as present, got %v", present)
	}
}

func TestInsightAnalysesViewShowsAnUnknownTopLevelKey(t *testing.T) {
	payload, _ := insightSchemaSample(t)
	payload["foo_analysis"] = map[string]any{"finding": "A finding under a key nobody has a view for."}

	page := renderInsightAnalyses(t, payload)
	if !strings.Contains(page, "A finding under a key nobody has a view for.") {
		t.Error("an unknown top-level key was dropped")
	}
	if !strings.Contains(page, "1 section is stored but has no dedicated view") {
		t.Error("the notice for one unknown key is missing")
	}
}

// A field the schema defines as text, stored as an object, is not read by the
// dedicated view, so it must come back through the fallback.
func TestInsightAnalysesViewShowsAFieldStoredInAnotherShape(t *testing.T) {
	payload := map[string]any{
		"market_definition": map[string]any{
			"tam": map[string]any{"size": "10", "calculation_method": "Bottom up from pilot accounts"},
			"sam": map[string]any{"size": "4", "definition": map[string]any{"scope": "Two regions only"}},
		},
	}
	page := renderInsightAnalyses(t, payload)
	for _, s := range []string{"Bottom up from pilot accounts", "Two regions only"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
}

// The schema names five trend categories and allows others. A category the page
// does not know is shown after the known ones, not skipped.
func TestInsightAnalysesViewShowsATrendCategoryTheSchemaDoesNotName(t *testing.T) {
	payload := map[string]any{"trends": map[string]any{
		"technology":    []any{map[string]any{"trend": "A known category."}},
		"environmental": []any{map[string]any{"trend": "A category the schema does not name."}},
	}}
	page := renderInsightAnalyses(t, payload)
	for _, s := range []string{"A known category.", "A category the schema does not name.", "Environmental"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("a trend category is shown by the dedicated view and must not be reported as unshown")
	}
}

// The canonical template gives a competitor a market share, target segment and
// business model, and a trend its implications for us, though the schema does
// not list them. They belong in the competitor card and the trend, not in the
// list of content with no view.
func TestInsightAnalysesViewShowsTheFieldsOnlyTheTemplateHas(t *testing.T) {
	payload := map[string]any{
		"trends": map[string]any{"market": []any{map[string]any{
			"trend": "A trend.", "implications_for_us": "It tells us to move early.",
		}}},
		"competitive_landscape": map[string]any{"direct_competitors": []any{map[string]any{
			"name": "A competitor", "market_share": "About a tenth",
			"target_segment": "Mid-size operators", "business_model": "Licence plus services",
		}}},
	}
	page := renderInsightAnalyses(t, payload)
	for _, s := range []string{"It tells us to move early.", "About a tenth", "Mid-size operators", "Licence plus services"} {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("these fields have a place in the dedicated view and must not be reported as unshown")
	}
}

// The integer rank of a prioritised problem carries no marker in the schema
// sample, so it is checked with a value that can be told apart on the page.
func TestInsightAnalysesViewShowsTheProblemRank(t *testing.T) {
	page := renderInsightAnalyses(t, map[string]any{"product_problem_fit_analysis": map[string]any{
		"problem_prioritization": []any{map[string]any{"rank": float64(7), "problem": "ranked-problem", "rationale": "ranked-rationale"}},
	}})
	for _, want := range []string{"ranked-problem", "Rank:</span> 7", "ranked-rationale"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the prioritised problems got the notice")
	}
}

// An entry whose only stored field is one the schema added in 1.14.0 is still on
// the page: it is not skipped as empty.
func TestInsightAnalysesViewShowsEntriesHoldingOnlyANewField(t *testing.T) {
	payload := map[string]any{
		"strengths":     []any{map[string]any{"defensibility": "only-defensibility"}},
		"weaknesses":    []any{map[string]any{"urgency": "only-urgency"}},
		"opportunities": []any{map[string]any{"timing": "only-timing"}},
		"threats":       []any{map[string]any{"monitoring": "only-monitoring"}},
		"competitive_landscape": map[string]any{
			"indirect_competitors": []any{map[string]any{"switching_cost": "only-switching-cost"}},
		},
		"market_structure": map[string]any{"segments": []any{map[string]any{"accessibility": "only-accessibility"}}},
		"target_users": []any{map[string]any{"persona": "p", "jobs_to_be_done": []any{
			map[string]any{"social_job": "only-social-job"}}}},
	}
	page := renderInsightAnalyses(t, payload)
	for _, want := range []string{"only-defensibility", "only-urgency", "only-timing", "only-monitoring", "only-switching-cost", "only-accessibility", "only-social-job"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("fields the schema defines got the notice")
	}
}

// Barriers to entry are stored at the top level in the schema and, in older files,
// under competitive_landscape; both are shown, in one section.
func TestInsightAnalysesViewShowsBarriersFromBothLocations(t *testing.T) {
	page := renderInsightAnalyses(t, map[string]any{
		"barriers_to_entry": []any{map[string]any{"barrier": "top-barrier", "our_position": "top-position"}},
		"competitive_landscape": map[string]any{
			"barriers_to_entry": []any{map[string]any{"barrier": "nested-barrier", "height": "nested-height"}},
		},
	})
	for _, want := range []string{"top-barrier", "top-position", "nested-barrier", "nested-height"} {
		if !strings.Contains(page, want) {
			t.Errorf("the page does not show %q", want)
		}
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("barriers to entry got the notice")
	}
}

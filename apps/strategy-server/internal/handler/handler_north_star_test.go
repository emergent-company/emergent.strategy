package handler

import (
	"bytes"
	"context"
	"html"
	"strings"
	"testing"

	"gopkg.in/yaml.v3"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// canonicalNorthStar returns the pinned canonical North Star template with a
// strategic_maturity_context added (the template leaves it out), as a payload
// wrapped in its north_star root key, and the same content unwrapped.
func canonicalNorthStar(t *testing.T) (wrapped, flat map[string]any) {
	t.Helper()
	raw, err := embedded.GetTemplate("READY/00_north_star.yaml")
	if err != nil {
		t.Fatal(err)
	}
	if err := yaml.Unmarshal(raw, &wrapped); err != nil {
		t.Fatal(err)
	}
	flat, _ = wrapped["north_star"].(map[string]any)
	if flat == nil {
		t.Fatal("the canonical template has no north_star root key")
	}
	flat["strategic_maturity_context"] = map[string]any{
		"last_maturity_review": "2026-11-01",
		"portfolio_summary": []any{map[string]any{
			"product_line": "Core Platform", "overall_position": "validation",
			"current_milestone":    "problem_approach_fit",
			"track_maturity":       map[string]any{"product": "emerging", "commercial": "hypothetical"},
			"milestone_notes":      "Pilots confirmed the problem and the approach",
			"focus_recommendation": "Commercial track next",
		}},
		"maturity_themes": []any{map[string]any{"theme": "Commercial lags product", "implication": "Fund sales before features"}},
	}
	return wrapped, flat
}

func strs(v any) []string {
	var out []string
	switch t := v.(type) {
	case string:
		if line := strings.TrimSpace(strings.SplitN(strings.TrimSpace(t), "\n", 2)[0]); line != "" {
			out = append(out, line)
		}
	case []any:
		for _, e := range t {
			out = append(out, strs(e)...)
		}
	}
	return out
}

func field(m map[string]any, keys ...string) any {
	var cur any = m
	for _, k := range keys {
		mm, _ := cur.(map[string]any)
		cur = mm[k]
	}
	return cur
}

// Everything the schema gives the North Star that is not a belief must reach the
// page, whichever way the payload arrives: wrapped in its north_star root key, as
// the schema and template have it, or already unwrapped.
func TestNorthStarPageShowsEveryFieldOfTheCanonicalTemplate(t *testing.T) {
	wrapped, flat := canonicalNorthStar(t)

	var want []string
	for _, v := range field(flat, "values").([]any) {
		vm := v.(map[string]any)
		for _, k := range []string{"value", "definition", "example_decision", "behaviors_we_expect", "behaviors_we_reject"} {
			want = append(want, strs(vm[k])...)
		}
	}
	for _, c := range field(flat, "value_conflicts").([]any) {
		cm := c.(map[string]any)
		want = append(want, strs(cm["tension"])...)
		want = append(want, strs(cm["resolution_principle"])...)
	}
	want = append(want, strs(field(flat, "mission", "boundaries", "we_dont_do"))...)
	want = append(want, strs(field(flat, "mission", "boundaries", "why_not"))...)
	want = append(want, strs(field(flat, "vision", "success_looks_like"))...)
	want = append(want, strs(field(flat, "vision", "not_the_vision"))...)
	for _, k := range []string{"purpose_vision_alignment", "mission_purpose_alignment", "values_mission_alignment", "beliefs_inform_strategy"} {
		want = append(want, strs(field(flat, "alignment_checks", k))...)
	}
	want = append(want, strs(field(flat, "next_review_triggers", "scheduled"))...)
	want = append(want, strs(field(flat, "next_review_triggers", "event_based"))...)
	want = append(want, "Core Platform", "validation", "Pilots confirmed the problem and the approach",
		"Commercial track next", "Commercial lags product", "Fund sales before features", "2026-11-01")
	if len(want) < 30 {
		t.Fatalf("collected only %d strings to look for; the template changed shape", len(want))
	}

	for name, payload := range map[string]map[string]any{"wrapped in north_star": wrapped, "unwrapped": flat} {
		data, err := buildNorthStarData(ui.NavContext{}, "north_star", "North Star", "draft", payload)
		if err != nil {
			t.Fatalf("%s: %v", name, err)
		}
		var buf bytes.Buffer
		if err := ui.NorthStarContent(data).Render(context.Background(), &buf); err != nil {
			t.Fatalf("%s: render: %v", name, err)
		}
		page := buf.String()
		for _, s := range want {
			if !strings.Contains(page, html.EscapeString(s)) {
				t.Errorf("%s: the page is missing %q", name, s)
			}
		}
		if len(data.Values) == 0 || len(data.ValueConflicts) == 0 || len(data.WeDontDo) == 0 {
			t.Errorf("%s: values=%d conflicts=%d boundaries=%d, want all present", name, len(data.Values), len(data.ValueConflicts), len(data.WeDontDo))
		}
		if data.Purpose.Statement == "" || len(data.Beliefs) == 0 {
			t.Errorf("%s: the decomposed purpose and core beliefs must still show", name)
		}
	}
}

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

func renderRoadmap(t *testing.T, payload map[string]any) string {
	t.Helper()
	var buf bytes.Buffer
	if err := (&Server{}).roadmapRecipeContent(ui.NavContext{}, "roadmap", "Roadmap", "active", payload).Render(context.Background(), &buf); err != nil {
		t.Fatalf("render: %v", err)
	}
	return buf.String()
}

func mustContain(t *testing.T, page string, wants ...string) {
	t.Helper()
	for _, s := range wants {
		if !strings.Contains(page, s) {
			t.Errorf("the page is missing %q", s)
		}
	}
}

// Every property of the roadmap_recipe schema has a dedicated view: the tracks
// with their objectives, Key Results and scaffolds, the committed okrs and a
// future_okrs_* group, the execution plan and the dependencies. A failure names
// a field the view does not declare as shown, or one it declares and does not
// render.
func TestRoadmapViewShowsEveryFieldOfTheSchema(t *testing.T) {
	for _, wrapped := range []bool{true, false} {
		payload, markers := sampleOfSchema(t, "roadmap_recipe_schema.json", 0, 100)
		if !wrapped {
			payload = payload["roadmap"].(map[string]any)
		}
		if left := roadmapUnshown(payload); left != nil {
			var keys []string
			for k := range left {
				keys = append(keys, k)
			}
			sort.Strings(keys)
			t.Errorf("wrapped=%v: schema properties with no dedicated view, under: %s", wrapped, strings.Join(keys, ", "))
		}
		page := renderRoadmap(t, payload)
		if missing := missingFromPage(page, markers, false); len(missing) > 0 {
			t.Errorf("wrapped=%v: %d of %d schema fields are not on the page:\n  %s", wrapped, len(missing), len(markers), strings.Join(missing, "\n  "))
		}
		if strings.Contains(page, "no dedicated view") {
			t.Errorf("wrapped=%v: a payload that follows the schema got the 'stored but not shown' notice", wrapped)
		}
	}
}

func TestRoadmapViewShowsEveryStringOfTheCanonicalTemplate(t *testing.T) {
	raw, err := embedded.GetTemplate("READY/05_roadmap_recipe.yaml")
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
	page := renderRoadmap(t, payload)
	if missing := missingFromPage(page, want, true); len(missing) > 0 {
		t.Errorf("%d of %d template strings are not on the page:\n  %s", len(missing), len(want), strings.Join(missing, "\n  "))
	}
	if strings.Contains(page, "no dedicated view") {
		t.Error("the template follows what the view reads and must not get the notice")
	}
}

// Numbers, enums and nullable strings carry no marker in the schema test.
func TestRoadmapViewShowsTheHeaderFields(t *testing.T) {
	page := renderRoadmap(t, map[string]any{"roadmap": map[string]any{
		"id": "roadmap-77", "strategy_id": "strat-9", "template_version": "1.9.6",
		"cycle": float64(4), "timeframe": "Q4 2026", "status": "approved",
		"approved_by": "Pat Doe", "approval_date": "2026-09-30",
		"start_date": "2026-10-01", "target_completion_date": "2026-12-31",
	}})
	mustContain(t, page, "roadmap-77", "strat-9", "1.9.6", "Cycle 4", "Q4 2026", "approved", "Pat Doe", "2026-09-30", "2026-10-01", "2026-12-31")
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

const roadmapKRDetail = `{
  "tracks": {
    "product": {
      "track_objective": "Ship the core",
      "okrs": [{"id": "okr-p-001", "objective": "Faster import", "key_results": [
        {"id": "kr-p-001", "description": "Import in a minute", "status": "in_progress", "trl_start": 3, "trl_target": 6,
         "trl_progression": "3 to 6 over the cycle",
         "value_model_target": {"track": "product", "component_path": "Product.Core.Import", "target_maturity": "proven", "maturity_rationale": "Two customers rely on it"}}]}],
      "future_okrs_q3_2026": [{"id": "okr-p-010", "objective": "Bulk export", "key_results": [
        {"id": "kr-p-010", "description": "Export a thousand rows", "status": "not_started",
         "value_model_target": {"track": "product", "component_path": "Product.Core.Export", "target_maturity": "emerging"}}]}]
    }
  }}`

func TestRoadmapViewShowsKeyResultStatusTRLAndValueModelTarget(t *testing.T) {
	page := renderRoadmap(t, decodePayload(t, roadmapKRDetail))
	mustContain(t, page, "in_progress", "not_started", "TRL 3", "TRL 6", "3 to 6 over the cycle",
		"Product.Core.Import", "proven", "Two customers rely on it", "Product.Core.Export", "emerging")
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

// The badge on a track counted objectives under the label "KRs". It now counts
// both, parked Key Results and those in a future group included.
func TestRoadmapTrackBadgeCountsObjectivesAndKeyResults(t *testing.T) {
	page := renderRoadmap(t, decodePayload(t, roadmapWithParkedAndFuture))
	mustContain(t, page, "2 objectives, 4 key results")
}

func TestRoadmapViewShowsTracksBeyondTheFourNamedOnes(t *testing.T) {
	page := renderRoadmap(t, decodePayload(t, `{"roadmap": {"tracks": {
	  "commercial": {"track_objective": "Sell"},
	  "legal": {"track_objective": "Stay compliant", "okrs": [{"id": "okr-l-001", "objective": "Pass the audit"}]}}}}`))
	mustContain(t, page, "Sell", "Stay compliant", "Pass the audit")
}

func TestRoadmapViewShowsMilestonesInBothLayouts(t *testing.T) {
	page := renderRoadmap(t, decodePayload(t, `{"roadmap": {"execution_plan": {
	  "key_milestones": [{"date": "2026-11-01", "milestone": "Beta opens", "key_results": ["kr-p-001", "kr-c-002"]}],
	  "milestones": [{"date": "2026-12-01", "milestone": "General release", "description": "Open to everyone", "status": "planned"}]}}}`))
	mustContain(t, page, "Beta opens", "kr-p-001", "kr-c-002", "General release", "Open to everyone", "planned")
	if strings.Contains(page, "no dedicated view") {
		t.Error("a field the view reads got the notice")
	}
}

func TestRoadmapViewShowsParallelTracksAndTheSequencingRationale(t *testing.T) {
	page := renderRoadmap(t, decodePayload(t, `{"roadmap": {"execution_plan": {
	  "sequencing_rationale": "Import first because export depends on it.",
	  "parallel_tracks": [{"name": "Platform", "timeframe": "Weeks 1-4", "key_results": ["kr-p-001"], "depends_on": ["kr-s-001"]}]}}}`))
	mustContain(t, page, "Import first because export depends on it.", "Platform", "Weeks 1-4", "kr-p-001", "kr-s-001")
}

// Content that no dedicated view has is shown as stored, wherever it sits.
func TestRoadmapViewShowsUnknownKeysAtEveryLevel(t *testing.T) {
	payload, _ := sampleOfSchema(t, "roadmap_recipe_schema.json", 0, 100)
	root := payload["roadmap"].(map[string]any)
	root["integration_points"] = []any{"A point nobody has a view for."}
	payload["change_log"] = []any{map[string]any{"note": "A sibling of the roadmap block."}}
	product := root["tracks"].(map[string]any)["product"].(map[string]any)
	product["capacity"] = "A track field."
	kr := product["okrs"].([]any)[0].(map[string]any)["key_results"].([]any)[0].(map[string]any)
	kr["platform"] = "A Key Result field."
	product["solution_scaffold"].(map[string]any)["key_components"].([]any)[0].(map[string]any)["owner"] = "A scaffold field."
	future := product["future_okrs_q3"].([]any)[0].(map[string]any)
	future["confidence"] = "A future group field."

	page := renderRoadmap(t, payload)
	mustContain(t, page, "A point nobody has a view for.", "A sibling of the roadmap block.", "A track field.",
		"A Key Result field.", "A scaffold field.", "A future group field.")
	if !strings.Contains(page, "no dedicated view") {
		t.Error("the notice is missing")
	}
}

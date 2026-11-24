package handler

import (
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// A roadmap track with Key Results in the current list and in a later cycle's list,
// the second of which is named by the instance.
func okrTrack() map[string]any {
	return map[string]any{
		"okrs": []any{
			map[string]any{"id": "okr-1", "objective": "current objective", "key_results": []any{
				map[string]any{"id": "kr-1", "description": "current kr"},
				map[string]any{"id": "kr-2", "description": "second current kr"},
			}},
		},
		"future_okrs_q3_2026": []any{
			map[string]any{"id": "okr-2", "objective": "later objective", "key_results": []any{
				map[string]any{"id": "kr-3", "description": "later kr"},
			}},
			"a plain string is not an objective",
		},
	}
}

func TestRoadmapTrackOKRsListsEveryGroupWithItsName(t *testing.T) {
	got := roadmapTrackOKRs(okrTrack())
	if len(got) != 2 {
		t.Fatalf("got %d objectives, want 2: %+v", len(got), got)
	}
	if got[0].Group != "" || got[0].Objective["id"] != "okr-1" {
		t.Errorf("the current objective comes first with no group, got %+v", got[0])
	}
	if got[1].Group != "future_okrs_q3_2026" || got[1].Objective["id"] != "okr-2" {
		t.Errorf("the later objective carries its group, got %+v", got[1])
	}
	if roadmapTrackOKRs(map[string]any{"track_objective": "x"}) != nil {
		t.Error("a track with no objective list has no objectives")
	}
}

func TestFireObjectivesIncludeLaterGroups(t *testing.T) {
	roadmap := map[string]any{"tracks": map[string]any{
		"product": okrTrack(),
		"strategy": map[string]any{"future_okrs_2027": []any{
			map[string]any{"objective": "only later", "key_results": []any{map[string]any{"description": "kr only later"}}},
		}},
		"org_ops": map[string]any{"track_objective": "no objectives at all"},
	}}
	got := fireObjectivesByTrack(roadmap)

	prod := got["product"]
	if len(prod) != 2 || prod[0].Objective != "current objective" || prod[0].Group != "" ||
		prod[1].Objective != "later objective" || prod[1].Group != "future_okrs_q3_2026" || len(prod[1].KeyResults) != 1 {
		t.Errorf("product objectives: %+v", prod)
	}
	if s := got["strategy"]; len(s) != 1 || s[0].Group != "future_okrs_2027" || s[0].KeyResults[0].Description != "kr only later" {
		t.Errorf("a track with only a later list shows it: %+v", s)
	}
	if _, ok := got["org_ops"]; ok {
		t.Error("a track with no objectives has no entry")
	}
}

func TestTrackOKRSummariesCountEveryGroup(t *testing.T) {
	tracks := map[string]any{
		"product":    okrTrack(),
		"commercial": map[string]any{"future_okrs_x": []any{map[string]any{"key_results": []any{map[string]any{}, map[string]any{}}}}},
		"org_ops":    map[string]any{"track_objective": "a track with no objective list"},
	}
	got := trackOKRSummaries(tracks)
	byTrack := map[string]ui.TrackOKRSummary{}
	for _, s := range got {
		byTrack[s.Track] = s
	}
	if p := byTrack["Product"]; p.Objectives != 2 || p.KeyResults != 3 {
		t.Errorf("product: %+v, want 2 objectives and 3 key results", p)
	}
	if c := byTrack["Commercial"]; c.Objectives != 1 || c.KeyResults != 2 {
		t.Errorf("a track with only a later list: %+v, want 1 objective and 2 key results", c)
	}
	if len(got) != 2 {
		t.Errorf("tracks without objectives are left out, got %d summaries", len(got))
	}
}

func TestRoadmapGapsSeeObjectivesInALaterList(t *testing.T) {
	gaps := checkRoadmapGaps(map[string]any{"roadmap": map[string]any{"tracks": map[string]any{
		"strategy": map[string]any{"future_okrs_q3_2026": []any{map[string]any{"objective": "o"}}},
		"product":  map[string]any{"okrs": []any{map[string]any{"objective": "o"}}},
	}}})
	present := map[string]bool{}
	for _, g := range gaps {
		present[g.Label] = g.Present
	}
	if !present["Strategy OKRs"] || !present["Product OKRs"] || present["Org & Ops OKRs"] || present["Commercial OKRs"] {
		t.Errorf("gaps: %v", present)
	}
}

func TestExecutionTracksIncludeLaterGroups(t *testing.T) {
	defs := map[string][]ui.ExecutionDefinition{"product": {{}}}
	got := executionTracks(map[string]any{
		"product":    okrTrack(),
		"strategy":   map[string]any{"okrs": []any{map[string]any{"id": "okr-s", "objective": "strategy objective"}}},
		"commercial": map[string]any{"future_okrs_2027": []any{map[string]any{"id": "okr-9", "objective": "only later"}}},
		"org_ops":    map[string]any{"track_objective": "no objectives"},
	}, defs, func(om map[string]any) ui.ExecutionOKR {
		return ui.ExecutionOKR{ID: strVal(om, "id"), Objective: strVal(om, "objective")}
	})
	if len(got) != 3 {
		t.Fatalf("got %d tracks, want 3 (a track with no objectives is left out): %+v", len(got), got)
	}
	// Tracks keep the page's order: strategy, org & ops, product, commercial.
	if got[0].Name != "Strategy" || got[1].Name != "Product" || got[2].Name != "Commercial" {
		t.Errorf("tracks: %s, %s, %s", got[0].Name, got[1].Name, got[2].Name)
	}
	if len(got[1].Definitions) != 1 {
		t.Errorf("the track's definitions are kept: %+v", got[1].Definitions)
	}
	okrs := got[1].OKRs
	if len(okrs) != 2 || okrs[0].Group != "" || okrs[0].ID != "okr-1" ||
		okrs[1].Group != "future_okrs_q3_2026" || okrs[1].ID != "okr-2" || okrs[1].Objective != "later objective" {
		t.Fatalf("objectives: %+v", okrs)
	}
	if o := got[2].OKRs; len(o) != 1 || o[0].Group != "future_okrs_2027" {
		t.Errorf("a track with only a later list shows it: %+v", o)
	}
}

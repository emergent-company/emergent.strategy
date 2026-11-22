package strategyread_test

import (
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
)

const roadmapWithAssumptions = `{"roadmap":{"id":"rm-1",
 "tracks":{
  "commercial":{"track_objective":"Win first customers","okrs":[
    {"id":"okr-c-001","objective":"Land three pilots","key_results":[
      {"id":"kr-c-001","description":"Three signed pilots","target":"3","baseline":"0"},
      {"id":"kr-c-002","description":"Pilot NPS above 40","target":"40"}]}],
   "riskiest_assumptions":[
     {"id":"asm-c-001","description":"Buyers have budget","linked_to_kr":["kr-c-001"]},
     {"id":"asm-c-002","description":"Unrelated","linked_to_kr":["kr-c-002"]}]},
  "product":{"track_objective":"Ship the core","okrs":[
    {"id":"okr-p-001","objective":"Offline sync works","key_results":[
      {"id":"kr-p-001","description":"Sync success above 99 percent"}]}]}},
 "cross_track_dependencies":[
   {"from":"kr-p-001","to":"kr-c-001","note":"Pilots need sync"},
   {"from":"kr-x","to":"kr-y","note":"elsewhere"}]}}`

func TestObjectives_ListsTracksObjectivesAndKeyResults(t *testing.T) {
	roadmap := decode(t, roadmapWithAssumptions)

	all := strategyread.Objectives(roadmap, "")
	if len(all) != 2 || all[0].Track != "commercial" || all[1].Track != "product" {
		t.Fatalf("tracks = %+v, want commercial then product", all)
	}
	c := all[0]
	if c.TrackObjective != "Win first customers" || len(c.Objectives) != 1 {
		t.Fatalf("commercial = %+v", c)
	}
	o := c.Objectives[0]
	if o.ID != "okr-c-001" || o.Objective != "Land three pilots" || len(o.KeyResults) != 2 {
		t.Errorf("objective = %+v", o)
	}
	if o.KeyResults[1].ID != "kr-c-002" || o.KeyResults[1].Description != "Pilot NPS above 40" {
		t.Errorf("key result = %+v", o.KeyResults[1])
	}

	only := strategyread.Objectives(roadmap, "product")
	if len(only) != 1 || only[0].Track != "product" {
		t.Errorf("track filter = %+v", only)
	}
	if got := strategyread.Objectives(roadmap, "nope"); len(got) != 0 {
		t.Errorf("unknown track = %+v", got)
	}
}

func TestKeyResult_ReturnsItWithObjectiveAssumptionsAndDependencies(t *testing.T) {
	roadmap := decode(t, roadmapWithAssumptions)

	kr, ok := strategyread.KeyResult(roadmap, "kr-c-001")
	if !ok {
		t.Fatal("key result not found")
	}
	if kr.Track != "commercial" || kr.Objective.ID != "okr-c-001" || kr.Objective.Objective != "Land three pilots" {
		t.Errorf("context = %+v", kr)
	}
	if !strings.Contains(mustJSON(t, kr.KeyResult), "Three signed pilots") {
		t.Errorf("key result = %s", mustJSON(t, kr.KeyResult))
	}
	if len(kr.Assumptions) != 1 || !strings.Contains(mustJSON(t, kr.Assumptions[0]), "Buyers have budget") {
		t.Errorf("assumptions = %s, want only the one linked to this key result", mustJSON(t, kr.Assumptions))
	}
	if len(kr.Dependencies) != 1 || !strings.Contains(mustJSON(t, kr.Dependencies[0]), "Pilots need sync") {
		t.Errorf("dependencies = %s", mustJSON(t, kr.Dependencies))
	}

	if _, ok := strategyread.KeyResult(roadmap, "kr-nope"); ok {
		t.Error("an unknown key result must not be found")
	}
}

const roadmapWithFutureOKRs = `{"roadmap":{"id":"rm-1","tracks":{
  "product":{"track_objective":"Ship the core",
   "okrs":[{"id":"okr-p-001","objective":"Now","key_results":[{"id":"kr-p-001","description":"Current KR"}],
     "riskiest_assumptions":[{"id":"asm-p-099","linked_to_kr":["kr-p-001"]}]}],
   "future_okrs_q3_2026":[{"id":"okr-p-010","objective":"Later","key_results":[
     {"id":"kr-p-010","description":"Future KR"},{"id":"kr-p-011","description":"Another future KR"}]}],
   "future_okrs_note":"not a list of objectives",
   "riskiest_assumptions":[{"id":"asm-p-001","description":"Track level","linked_to_kr":["kr-p-010"]}]}}}}`

func TestOKRGroups_CurrentFirstThenFutureInNameOrder_IgnoringNonLists(t *testing.T) {
	track := map[string]any{
		"future_okrs_q4_2026":  []any{},
		"okrs":                 []any{},
		"future_okrs_q3_2026":  []any{},
		"future_okrs_note":     "text, not a list",
		"riskiest_assumptions": []any{},
	}
	var names []string
	for _, g := range strategyread.OKRGroups(track) {
		names = append(names, g.Name)
	}
	if got, want := strings.Join(names, ","), "okrs,future_okrs_q3_2026,future_okrs_q4_2026"; got != want {
		t.Errorf("groups = %s, want %s", got, want)
	}
}

func TestObjectives_WalksFutureOKRGroupsAndNamesTheGroup(t *testing.T) {
	roadmap := decode(t, roadmapWithFutureOKRs)

	tracks := strategyread.Objectives(roadmap, "")
	if len(tracks) != 1 || len(tracks[0].Objectives) != 2 {
		t.Fatalf("objectives = %+v, want the current and the future objective", tracks)
	}
	krs := 0
	groups := map[string]string{}
	for _, o := range tracks[0].Objectives {
		groups[o.ID] = o.Group
		krs += len(o.KeyResults)
	}
	if krs != 3 {
		t.Errorf("key results = %d, want all 3 (1 current + 2 future)", krs)
	}
	if groups["okr-p-001"] != "okrs" || groups["okr-p-010"] != "future_okrs_q3_2026" {
		t.Errorf("groups = %v", groups)
	}
}

func TestKeyResult_FindsAKeyResultInAFutureGroup(t *testing.T) {
	roadmap := decode(t, roadmapWithFutureOKRs)

	kr, ok := strategyread.KeyResult(roadmap, "kr-p-010")
	if !ok {
		t.Fatal("a key result under future_okrs_q3_2026 must be found")
	}
	if kr.Group != "future_okrs_q3_2026" || kr.Objective.ID != "okr-p-010" || kr.Track != "product" {
		t.Errorf("detail = %+v", kr)
	}
	if len(kr.Assumptions) != 1 || !strings.Contains(mustJSON(t, kr.Assumptions[0]), "asm-p-001") {
		t.Errorf("assumptions = %s, want the track-level one linked to this key result", mustJSON(t, kr.Assumptions))
	}

	current, ok := strategyread.KeyResult(roadmap, "kr-p-001")
	if !ok || current.Group != "okrs" {
		t.Errorf("current key result = %+v ok=%v, want group okrs", current, ok)
	}
}

func TestRoadmapIDs_CoversEveryGroupAndBothAssumptionLocations(t *testing.T) {
	ids := strategyread.RoadmapIDs(decode(t, roadmapWithFutureOKRs))
	for _, want := range []string{"kr-p-001", "kr-p-010", "kr-p-011", "asm-p-001", "asm-p-099"} {
		if !ids[want] {
			t.Errorf("id %s missing from %v", want, ids)
		}
	}
	if ids["okr-p-010"] || ids["kr-nope"] {
		t.Errorf("ids = %v, objectives and unknown ids must not be included", ids)
	}
}

func TestKeyResultTargets_ListsEveryKeyResultWithItsTarget(t *testing.T) {
	roadmap := decode(t, `{"roadmap":{"tracks":{
	  "product":{
	    "okrs":[{"id":"okr-p-1","key_results":[
	      {"id":"kr-1","description":"has target","value_model_target":{"track":"Product","component_path":"Product.Core.Search"}},
	      {"id":"kr-2","description":"no target"},
	      {"id":"kr-3","description":"target without path","value_model_target":{"track":"product"}}]}],
	    "future_okrs_q3_2026":[{"id":"okr-p-2","key_results":[
	      {"id":"kr-4","description":"future","value_model_target":{"component_path":"Product.Edge.Api"}}]}]},
	  "commercial":{"okrs":[{"id":"okr-c-1","key_results":[{"id":"kr-5"}]}]}}}}`)

	got := strategyread.KeyResultTargets(roadmap)
	if len(got) != 5 {
		t.Fatalf("got %d key results, want all 5, including the one without a target and the one in a future group: %+v", len(got), got)
	}
	// Track-name order (commercial, product), then OKR group order within a track.
	var ids []string
	for _, k := range got {
		ids = append(ids, k.ID)
	}
	if want := "kr-5,kr-1,kr-2,kr-3,kr-4"; strings.Join(ids, ",") != want {
		t.Errorf("order = %v, want %s", ids, want)
	}

	byID := map[string]strategyread.KRTarget{}
	for _, k := range got {
		byID[k.ID] = k
	}
	if k := byID["kr-1"]; k.ComponentPath != "Product.Core.Search" || k.TargetTrack != "Product" || k.Group != "okrs" || k.ObjectiveID != "okr-p-1" {
		t.Errorf("kr-1 = %+v", k)
	}
	if k := byID["kr-2"]; k.ComponentPath != "" || k.TargetTrack != "product" {
		t.Errorf("a key result with no target falls back to its roadmap track: %+v", k)
	}
	if k := byID["kr-3"]; k.ComponentPath != "" {
		t.Errorf("a target without a component_path declares no path: %+v", k)
	}
	if k := byID["kr-4"]; k.Group != "future_okrs_q3_2026" || k.TargetTrack != "product" || k.ComponentPath != "Product.Edge.Api" {
		t.Errorf("kr-4 = %+v: a target naming no track falls back to the roadmap track", k)
	}
}

const roadmapWithParkedKeyResults = `{"roadmap":{"id":"rm-1","tracks":{"commercial":{
 "okrs":[{"id":"okr-c-001","objective":"Land three pilots","key_results":[
   {"id":"kr-c-001","description":"Three signed pilots","status":"active"},
   {"id":"kr-c-002","description":"Pilot NPS above 40","status":"parked","parked_reason":"Waiting for the first pilot to go live"},
   {"id":"kr-c-003","description":"Reference call with each pilot","status":"in_progress"},
   {"id":"kr-c-004","description":"Case study published"}]}],
 "future_okrs_q3_2026":[{"id":"okr-c-010","objective":"Expand to ten accounts","key_results":[
   {"id":"kr-c-010","description":"Ten paying accounts","status":"parked","parked_reason":"Deferred until the pilots report"}]}]}}}}`

func TestObjectives_ListsParkedKeyResultsApartWithTheirReason(t *testing.T) {
	got := strategyread.Objectives(decode(t, roadmapWithParkedKeyResults), "")
	if len(got) != 1 || len(got[0].Objectives) != 2 {
		t.Fatalf("objectives = %+v, want the okrs objective and the future_okrs_q3_2026 one", got)
	}

	current := got[0].Objectives[0]
	var active []string
	for _, kr := range current.KeyResults {
		active = append(active, kr.ID)
	}
	if strings.Join(active, ",") != "kr-c-001,kr-c-003,kr-c-004" {
		t.Errorf("active key results = %v, want every key result that is not parked, in order", active)
	}
	if len(current.ParkedKeyResults) != 1 {
		t.Fatalf("parked key results = %+v, want exactly kr-c-002", current.ParkedKeyResults)
	}
	parked := current.ParkedKeyResults[0]
	if parked.ID != "kr-c-002" || parked.Description != "Pilot NPS above 40" ||
		parked.Status != "parked" || parked.ParkedReason != "Waiting for the first pilot to go live" {
		t.Errorf("parked key result = %+v", parked)
	}
	if current.KeyResults[1].Status != "in_progress" {
		t.Errorf("a key result's own status is reported: %+v", current.KeyResults[1])
	}

	future := got[0].Objectives[1]
	if future.Group != "future_okrs_q3_2026" || len(future.KeyResults) != 0 ||
		len(future.ParkedKeyResults) != 1 || future.ParkedKeyResults[0].ParkedReason != "Deferred until the pilots report" {
		t.Errorf("an objective whose only key result is parked is still listed, with that key result apart: %+v", future)
	}
}

func TestObjectives_OmitsTheParkedListWhenNothingIsParked(t *testing.T) {
	got := strategyread.Objectives(decode(t, roadmapWithAssumptions), "")
	raw := mustJSON(t, got)
	if strings.Contains(raw, "parked") {
		t.Errorf("a roadmap with no parked key results must not mention parking: %s", raw)
	}
}

func TestIsParked(t *testing.T) {
	for status, want := range map[string]bool{"parked": true, "active": false, "not_started": false, "": false} {
		if got := strategyread.IsParked(map[string]any{"status": status}); got != want {
			t.Errorf("IsParked(status=%q) = %v, want %v", status, got, want)
		}
	}
	if strategyread.IsParked(nil) {
		t.Error("IsParked(nil) must be false")
	}
}

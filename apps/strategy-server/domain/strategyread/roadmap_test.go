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

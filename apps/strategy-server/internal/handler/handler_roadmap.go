package handler

import (
	"sort"
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// roadmapRecipeContent extracts rich data from a roadmap_recipe payload
// and returns a bespoke RoadmapRecipeContent component.
//
// The page never drops stored content. Whatever the readers below do not show,
// as listed in roadmapShownPaths, is handed to the generic renderer under a
// notice (data.Unshown).
func (s *Server) roadmapRecipeContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// The roadmap data may be wrapped in a "roadmap" top-level key.
	root, _ := rootOf(payload, "roadmap")

	data := ui.RoadmapRecipeData{
		NavContext:       navCtx,
		ArtifactKey:      artifactKey,
		Name:             name,
		Status:           status,
		Cycle:            tolStr(root, "cycle"),
		Timeframe:        tolStr(root, "timeframe"),
		StartDate:        tolStr(root, "start_date"),
		TargetCompletion: firstText(root, "target_completion_date", "target_completion"),
		LastUpdated:      tolStr(root, "last_updated"),
	}
	if rs := tolStr(root, "status"); rs != status {
		data.RoadmapStatus = rs
	}
	for _, ref := range []recordField{
		{"id", "Roadmap"}, {"roadmap_id", "Roadmap"}, {"strategy_id", "Strategy"}, {"template_version", "Template version"},
		{"approved_by", "Approved by"}, {"approval_date", "Approved on"},
	} {
		if v := tolStr(root, ref.key); v != "" {
			data.References = append(data.References, ui.RecordFact{Label: ref.label, Value: v})
		}
	}

	// ── Tracks ──
	// Tracks can be an object with named sub-keys (product, strategy, commercial, org_ops)
	// or an array. Support both. Keys beyond the four named ones are tracks too.
	if tracksObj, ok := root["tracks"].(map[string]any); ok {
		for _, tn := range roadmapTrackNames(tracksObj) {
			if tm, ok := tracksObj[tn].(map[string]any); ok {
				data.Tracks = append(data.Tracks, extractRoadmapTrack(tn, tm))
			}
		}
	}
	if tracksArr, ok := root["tracks"].([]any); ok {
		for _, item := range tracksArr {
			tm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Tracks = append(data.Tracks, extractRoadmapTrack(firstText(tm, "name", "track"), tm))
		}
	}

	// Build KR lookup: "kr-id" → RoadmapKR (for critical path resolution).
	krByID := make(map[string]ui.RoadmapKR)
	for _, track := range data.Tracks {
		for _, okr := range track.OKRs {
			for _, kr := range append(append([]ui.RoadmapKR{}, okr.KeyResults...), okr.ParkedKeyResults...) {
				if kr.ID != "" {
					krByID[kr.ID] = kr
				}
			}
		}
	}

	// ── Execution Plan ──
	if ep := tolMap(root, "execution_plan"); ep != nil {
		data.SequencingRationale = tolStr(ep, "sequencing_rationale")
		data.ParallelTracks = recordsOf(ep, roadmapParallelTrackSpec)

		// Resolve critical path: entries are "track:kr-id" or bare "kr-id".
		for _, raw := range tolStrs(ep, "critical_path") {
			step := ui.RoadmapCriticalPathStep{RawID: raw}
			// Strip "track:" prefix to get the bare KR id.
			krID := raw
			if idx := strings.LastIndex(raw, ":"); idx >= 0 {
				krID = raw[idx+1:]
			}
			if kr, ok := krByID[krID]; ok {
				step.KRDescription = kr.Description
				step.Target = kr.Target
				step.AnchorID = krID
			}
			data.CriticalPath = append(data.CriticalPath, step)
		}

		// The schema calls the list key_milestones; earlier roadmaps wrote milestones.
		for _, key := range []string{"key_milestones", "milestones"} {
			for _, mm := range tolItems(ep[key], "milestone") {
				m := ui.RoadmapMilestone{
					Date:        tolStr(mm, "date"),
					Milestone:   tolStr(mm, "milestone"),
					Description: tolStr(mm, "description"),
					Status:      tolStr(mm, "status"),
					KeyResults:  tolStrs(mm, "key_results"),
				}
				if m.Date != "" || m.Milestone != "" || m.Description != "" || m.Status != "" || len(m.KeyResults) > 0 {
					data.Milestones = append(data.Milestones, m)
				}
			}
		}
	}

	// ── Cross-Track Dependencies ──
	for _, dm := range tolItems(root["cross_track_dependencies"], "description") {
		d := ui.RoadmapDependency{
			FromKR:         tolStr(dm, "from_kr"),
			ToKR:           tolStr(dm, "to_kr"),
			Description:    tolStr(dm, "description"),
			DependencyType: tolStr(dm, "dependency_type"),
		}
		if d != (ui.RoadmapDependency{}) {
			data.Dependencies = append(data.Dependencies, d)
		}
	}

	data.Unshown = roadmapUnshown(payload)
	data.Gaps = checkRoadmapGaps(payload)
	return ui.RoadmapRecipeContent(data)
}

// roadmapTrackNames lists the keys of a tracks object: the four the framework
// names first, in that order, then any other, by name.
func roadmapTrackNames(tracks map[string]any) []string {
	named := []string{"strategy", "org_ops", "product", "commercial"}
	var out []string
	seen := map[string]bool{}
	for _, tn := range named {
		if _, ok := tracks[tn]; ok {
			out = append(out, tn)
			seen[tn] = true
		}
	}
	var rest []string
	for tn := range tracks {
		if !seen[tn] {
			rest = append(rest, tn)
		}
	}
	sort.Strings(rest)
	return append(out, rest...)
}

// firstText is the first of the keys that holds text.
func firstText(m map[string]any, keys ...string) string {
	for _, k := range keys {
		if v := tolStr(m, k); v != "" {
			return v
		}
	}
	return ""
}

// extractRoadmapTrack builds a RoadmapTrack from a track map.
func extractRoadmapTrack(trackName string, tm map[string]any) ui.RoadmapTrack {
	track := ui.RoadmapTrack{
		Name:      trackName,
		Objective: firstText(tm, "track_objective", "objective"),
	}

	// OKRs: the current "okrs" list, then every "future_okrs_*" list.
	for _, group := range strategyread.OKRGroups(tm) {
		for _, om := range tolItems(group.Items, "objective") {
			okr := ui.RoadmapOKR{
				ID:        tolStr(om, "id"),
				Objective: tolStr(om, "objective"),
			}
			if group.Name != "okrs" {
				okr.Group = group.Name
			}

			for _, km := range tolItems(om["key_results"], "description") {
				kr := readRoadmapKR(km)
				if strategyread.IsParked(km) {
					okr.ParkedKeyResults = append(okr.ParkedKeyResults, kr)
				} else {
					okr.KeyResults = append(okr.KeyResults, kr)
				}
			}

			track.OKRs = append(track.OKRs, okr)
		}
	}

	for _, am := range tolItems(tm["riskiest_assumptions"], "description") {
		a := ui.RoadmapAssumption{
			ID:               tolStr(am, "id"),
			Description:      tolStr(am, "description"),
			Type:             tolStr(am, "type"),
			Criticality:      tolStr(am, "criticality"),
			Confidence:       tolStr(am, "confidence"),
			EvidenceRequired: tolStr(am, "evidence_required"),
			LinkedKRs:        tolStrs(am, "linked_to_kr"),
		}
		if a.ID != "" || a.Description != "" || a.Type != "" || a.Criticality != "" || a.Confidence != "" ||
			a.EvidenceRequired != "" || len(a.LinkedKRs) > 0 {
			track.Assumptions = append(track.Assumptions, a)
		}
	}

	if sc := tolMap(tm, "solution_scaffold"); sc != nil {
		track.Scaffold = ui.RoadmapScaffold{
			Description: tolStr(sc, "description"),
			Components:  recordsOf(sc, roadmapScaffoldComponentSpec),
			Principles:  tolStrs(sc, "architecture_principles"),
			Constraints: tolStrs(sc, "technical_constraints"),
		}
	}

	return track
}

// roadmapKRFacts are the labelled values of a Key Result beyond its baseline,
// target and TRL, which the row shows in its own way.
var roadmapKRFacts = []recordField{
	{"status", "Status"}, {"measurement_method", "How it is measured"}, {"trl_progression", "TRL progression"},
	{"technical_hypothesis", "Technical hypothesis"}, {"experiment_design", "Experiment design"},
	{"success_criteria", "Success criteria"}, {"uncertainty_addressed", "Uncertainty addressed"},
}

// roadmapKRValueModelTarget is what a Key Result aims at in the value model.
var roadmapKRValueModelTarget = []recordField{
	{"track", "Value model track"}, {"component_path", "Component path"},
	{"target_maturity", "Target maturity"}, {"maturity_rationale", "Maturity rationale"},
}

func readRoadmapKR(km map[string]any) ui.RoadmapKR {
	kr := ui.RoadmapKR{
		ID:           tolStr(km, "id"),
		Description:  tolStr(km, "description"),
		Baseline:     tolStr(km, "baseline"),
		Target:       tolStr(km, "target"),
		TRLStart:     tolStr(km, "trl_start"),
		TRLTarget:    tolStr(km, "trl_target"),
		ParkedReason: tolStr(km, "parked_reason"),
	}
	for _, f := range roadmapKRFacts {
		if v := tolStr(km, f.key); v != "" {
			kr.Facts = append(kr.Facts, ui.RecordFact{Label: f.label, Value: v})
		}
	}
	if vmt := tolMap(km, "value_model_target"); vmt != nil {
		for _, f := range roadmapKRValueModelTarget {
			if v := tolStr(vmt, f.key); v != "" {
				kr.Facts = append(kr.Facts, ui.RecordFact{Label: f.label, Value: v})
			}
		}
	}
	return kr
}

// ── record lists ──

var roadmapScaffoldComponentSpec = recordSpec{
	path: []string{"key_components"}, head: "name",
	facts: []recordField{{"id", "ID"}, {"purpose", "Purpose"}, {"priority", "Priority"}, {"maps_to_value_model", "Maps to value model"}},
}

var roadmapParallelTrackSpec = recordSpec{
	path: []string{"parallel_tracks"}, head: "name",
	facts: []recordField{{"timeframe", "Timeframe"}},
	lists: []recordField{{"key_results", "Key results"}, {"depends_on", "Depends on"}},
}

// recordsOf reads the records of one spec.
func recordsOf(payload map[string]any, spec recordSpec) []ui.Record {
	spec.kind = "list"
	if secs := readRecords(payload, []recordSpec{spec}); len(secs) > 0 {
		return secs[0].Records
	}
	return nil
}

// ── shown paths ──

// roadmapUnshown returns the stored content the page has no dedicated view for.
// The schema wraps the roadmap in a "roadmap" key, so anything beside it is
// checked on its own and is never shown.
func roadmapUnshown(payload map[string]any) map[string]any {
	root, _ := rootOf(payload, "roadmap")
	return unshownInRoot(payload, "roadmap", roadmapShownPaths(root), nil)
}

// roadmapShownPaths lists every path of the roadmap block the page renders. See
// unshownContent for the syntax. It is built from the payload because a track
// can hold any number of future_okrs_* groups, named by the instance. Anything
// not listed reaches the page through the generic fallback, so the list must
// hold only what the readers really show: TestRoadmapViewShowsEveryFieldOfTheSchema
// renders a payload built from the embedded schema and checks each field.
func roadmapShownPaths(root map[string]any) []string {
	var paths []string
	add := func(p ...string) { paths = append(paths, p...) }

	add("id", "roadmap_id", "strategy_id", "template_version", "cycle", "timeframe", "status",
		"approved_by", "approval_date", "start_date", "target_completion_date", "target_completion", "last_updated")

	add("execution_plan.sequencing_rationale", "execution_plan.critical_path")
	add(recordPaths([]recordSpec{prefixSpec(roadmapParallelTrackSpec, "execution_plan")})...)
	for _, key := range []string{"key_milestones", "milestones"} {
		add(entryPaths("execution_plan."+key, "date", "milestone", "description", "status", "key_results")...)
	}
	add(entryPaths("cross_track_dependencies", "from_kr", "to_kr", "description", "dependency_type")...)

	groups := map[string]bool{"okrs": true}
	for _, tm := range roadmapTrackMaps(root) {
		for _, g := range strategyread.OKRGroups(tm) {
			groups[g.Name] = true
		}
	}

	add("tracks.*.name", "tracks.*.track", "tracks.*.track_objective", "tracks.*.objective")
	add(entryPaths("tracks.*.riskiest_assumptions", "id", "description", "type", "criticality", "confidence", "evidence_required", "linked_to_kr")...)
	add("tracks.*.solution_scaffold.description", "tracks.*.solution_scaffold.architecture_principles", "tracks.*.solution_scaffold.technical_constraints")
	add(recordPaths([]recordSpec{prefixSpec(roadmapScaffoldComponentSpec, "tracks.*.solution_scaffold")})...)

	krFields := []string{"id", "description", "baseline", "target", "trl_start", "trl_target", "parked_reason"}
	for _, f := range roadmapKRFacts {
		krFields = append(krFields, f.key)
	}
	for group := range groups {
		okrs := "tracks.*." + group
		add(entryPaths(okrs, "id", "objective")...)
		add(entryPaths(okrs+".*.key_results", krFields...)...)
		for _, f := range roadmapKRValueModelTarget {
			add(okrs + ".*.key_results.*.value_model_target." + f.key)
		}
	}
	return paths
}

// prefixSpec moves a spec under a path.
func prefixSpec(spec recordSpec, prefix string) recordSpec {
	spec.path = append(strings.Split(prefix, "."), spec.path...)
	return spec
}

// roadmapTrackMaps returns the track blocks of a roadmap, in either layout.
func roadmapTrackMaps(root map[string]any) []map[string]any {
	var out []map[string]any
	switch tracks := root["tracks"].(type) {
	case map[string]any:
		for _, tm := range tracks {
			if m, ok := tm.(map[string]any); ok {
				out = append(out, m)
			}
		}
	case []any:
		for _, tm := range tracks {
			if m, ok := tm.(map[string]any); ok {
				out = append(out, m)
			}
		}
	}
	return out
}

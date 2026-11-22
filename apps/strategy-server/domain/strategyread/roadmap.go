package strategyread

import (
	"encoding/json"
	"sort"
	"strings"
)

// StatusParked is the Key Result status that marks one as deliberately not
// being worked on; the schema requires a parked_reason with it.
const StatusParked = "parked"

// KeyResultSummary is a key result reduced to what identifies it. Status and
// ParkedReason are as the roadmap states them and are omitted when it states none.
type KeyResultSummary struct {
	ID           string `json:"id"`
	Description  string `json:"description,omitempty"`
	Status       string `json:"status,omitempty"`
	ParkedReason string `json:"parked_reason,omitempty"`
}

// ObjectiveSummary is an objective with its key results. Group names the list
// it was found in: "okrs" or a "future_okrs_*" group. Key results with status
// "parked" are listed apart in ParkedKeyResults, so a reader of KeyResults sees
// only what is being worked on.
type ObjectiveSummary struct {
	ID               string             `json:"id"`
	Group            string             `json:"group"`
	Objective        string             `json:"objective"`
	KeyResults       []KeyResultSummary `json:"key_results"`
	ParkedKeyResults []KeyResultSummary `json:"parked_key_results,omitempty"`
}

// IsParked reports whether a key result's status is "parked".
func IsParked(keyResult map[string]any) bool {
	return str(keyResult, "status") == StatusParked
}

const (
	currentOKRGroup = "okrs"
	futureOKRPrefix = "future_okrs_"
)

// OKRGroup is one list of objectives on a roadmap track.
type OKRGroup struct {
	Name  string
	Items []any
}

// OKRGroups returns the objective lists of a roadmap track: "okrs" first, then
// every "future_okrs_*" list in name order. Every reader of objectives and key
// results goes through it, so none can see only part of a roadmap.
func OKRGroups(track map[string]any) []OKRGroup {
	var groups []OKRGroup
	if items, ok := track[currentOKRGroup].([]any); ok {
		groups = append(groups, OKRGroup{Name: currentOKRGroup, Items: items})
	}
	future := make(map[string][]any)
	var names []string
	for name, v := range track {
		if items, ok := v.([]any); ok && strings.HasPrefix(name, futureOKRPrefix) {
			future[name] = items
			names = append(names, name)
		}
	}
	sort.Strings(names)
	for _, name := range names {
		groups = append(groups, OKRGroup{Name: name, Items: future[name]})
	}
	return groups
}

// TrackObjectives is one roadmap track reduced to its objectives.
type TrackObjectives struct {
	Track          string             `json:"track"`
	TrackObjective string             `json:"track_objective,omitempty"`
	Objectives     []ObjectiveSummary `json:"objectives"`
}

func roadmapTracks(roadmap any) map[string]any {
	v, _ := view("roadmap_recipe", roadmap).(map[string]any)
	tracks, _ := v["tracks"].(map[string]any)
	return tracks
}

func str(m map[string]any, key string) string {
	s, _ := m[key].(string)
	return s
}

// Objectives lists the objectives and key results of a roadmap by track, in
// track-name order. A non-empty track restricts the result to that track.
func Objectives(roadmap any, track string) []TrackObjectives {
	tracks := roadmapTracks(roadmap)
	names := make([]string, 0, len(tracks))
	for name := range tracks {
		if track == "" || strings.EqualFold(name, track) {
			names = append(names, name)
		}
	}
	sort.Strings(names)

	out := make([]TrackObjectives, 0, len(names))
	for _, name := range names {
		tm, _ := tracks[name].(map[string]any)
		to := TrackObjectives{Track: name, TrackObjective: str(tm, "track_objective"), Objectives: []ObjectiveSummary{}}
		for _, g := range OKRGroups(tm) {
			for _, o := range g.Items {
				om, _ := o.(map[string]any)
				os := ObjectiveSummary{ID: str(om, "id"), Group: g.Name, Objective: str(om, "objective"), KeyResults: []KeyResultSummary{}}
				krs, _ := om["key_results"].([]any)
				for _, k := range krs {
					km, _ := k.(map[string]any)
					summary := KeyResultSummary{
						ID: str(km, "id"), Description: str(km, "description"),
						Status: str(km, "status"), ParkedReason: str(km, "parked_reason"),
					}
					if IsParked(km) {
						os.ParkedKeyResults = append(os.ParkedKeyResults, summary)
					} else {
						os.KeyResults = append(os.KeyResults, summary)
					}
				}
				to.Objectives = append(to.Objectives, os)
			}
		}
		out = append(out, to)
	}
	return out
}

// KeyResultDetail is one key result with the context needed to answer a
// question about it.
type KeyResultDetail struct {
	Track     string `json:"track"`
	Group     string `json:"group"`
	Objective struct {
		ID        string `json:"id"`
		Objective string `json:"objective"`
	} `json:"objective"`
	KeyResult    any   `json:"key_result"`
	Assumptions  []any `json:"assumptions"`
	Dependencies []any `json:"dependencies"`
}

// KeyResult finds a key result by id and returns it with its objective, the
// riskiest assumptions linked to it, and the cross-track dependencies that
// mention it.
func KeyResult(roadmap any, id string) (KeyResultDetail, bool) {
	tracks := roadmapTracks(roadmap)
	names := make([]string, 0, len(tracks))
	for name := range tracks {
		names = append(names, name)
	}
	sort.Strings(names)

	for _, name := range names {
		tm, _ := tracks[name].(map[string]any)
		for _, g := range OKRGroups(tm) {
			for _, o := range g.Items {
				om, _ := o.(map[string]any)
				krs, _ := om["key_results"].([]any)
				for _, k := range krs {
					km, _ := k.(map[string]any)
					if str(km, "id") != id {
						continue
					}
					d := KeyResultDetail{Track: name, Group: g.Name, KeyResult: km, Assumptions: []any{}, Dependencies: []any{}}
					d.Objective.ID = str(om, "id")
					d.Objective.Objective = str(om, "objective")

					assumptions, _ := tm["riskiest_assumptions"].([]any)
					for _, a := range assumptions {
						am, _ := a.(map[string]any)
						if linked, _ := am["linked_to_kr"].([]any); containsString(linked, id) {
							d.Assumptions = append(d.Assumptions, a)
						}
					}
					rm, _ := view("roadmap_recipe", roadmap).(map[string]any)
					deps, _ := rm["cross_track_dependencies"].([]any)
					for _, dep := range deps {
						if raw, err := json.Marshal(dep); err == nil && strings.Contains(string(raw), `"`+id+`"`) {
							d.Dependencies = append(d.Dependencies, dep)
						}
					}
					return d, true
				}
			}
		}
	}
	return KeyResultDetail{}, false
}

// KRTarget is one key result with the value model target it declares, if any.
// Track and TargetTrack are as written in the roadmap; the caller normalises.
type KRTarget struct {
	Track       string // roadmap track the key result sits under
	Group       string // OKR group: "okrs" or a "future_okrs_*" list
	ObjectiveID string
	ID          string
	Description string
	// TargetTrack is value_model_target.track, or Track when it names none.
	TargetTrack string
	// ComponentPath is value_model_target.component_path; empty when the key
	// result declares no target or no path.
	ComponentPath string
}

// KeyResultTargets lists every key result of a roadmap, whichever OKR group
// holds it, with its value model target. Key results without a target are
// included: a coverage check needs them in its denominator.
func KeyResultTargets(roadmap any) []KRTarget {
	tracks := roadmapTracks(roadmap)
	names := make([]string, 0, len(tracks))
	for name := range tracks {
		names = append(names, name)
	}
	sort.Strings(names)

	var out []KRTarget
	for _, name := range names {
		tm, _ := tracks[name].(map[string]any)
		for _, g := range OKRGroups(tm) {
			for _, o := range g.Items {
				om, _ := o.(map[string]any)
				for _, k := range listOf(om, "key_results") {
					km, _ := k.(map[string]any)
					if km == nil {
						continue
					}
					t := KRTarget{
						Track: name, Group: g.Name, ObjectiveID: str(om, "id"),
						ID: str(km, "id"), Description: str(km, "description"), TargetTrack: name,
					}
					if vmt, ok := km["value_model_target"].(map[string]any); ok {
						t.ComponentPath = str(vmt, "component_path")
						if tt := str(vmt, "track"); tt != "" {
							t.TargetTrack = tt
						}
					}
					out = append(out, t)
				}
			}
		}
	}
	return out
}

// RoadmapIDs returns the id of every key result and riskiest assumption in a
// roadmap, whichever OKR group or track list holds it. They are objects inside
// the roadmap rather than artifacts of their own, so this is how a reference to
// one is resolved.
func RoadmapIDs(roadmap any) map[string]bool {
	ids := make(map[string]bool)
	add := func(list []any) {
		for _, v := range list {
			if m, ok := v.(map[string]any); ok {
				if id := str(m, "id"); id != "" {
					ids[id] = true
				}
			}
		}
	}
	for _, tv := range roadmapTracks(roadmap) {
		tm, _ := tv.(map[string]any)
		add(listOf(tm, "riskiest_assumptions"))
		for _, g := range OKRGroups(tm) {
			for _, o := range g.Items {
				om, _ := o.(map[string]any)
				add(listOf(om, "key_results"))
				add(listOf(om, "riskiest_assumptions"))
			}
		}
	}
	return ids
}

func listOf(m map[string]any, key string) []any {
	l, _ := m[key].([]any)
	return l
}

func containsString(list []any, s string) bool {
	for _, v := range list {
		if str, ok := v.(string); ok && str == s {
			return true
		}
	}
	return false
}

package strategyread

import (
	"encoding/json"
	"sort"
	"strings"
)

// KeyResultSummary is a key result reduced to what identifies it.
type KeyResultSummary struct {
	ID          string `json:"id"`
	Description string `json:"description,omitempty"`
}

// ObjectiveSummary is an objective with its key results.
type ObjectiveSummary struct {
	ID         string             `json:"id"`
	Objective  string             `json:"objective"`
	KeyResults []KeyResultSummary `json:"key_results"`
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
		okrs, _ := tm["okrs"].([]any)
		for _, o := range okrs {
			om, _ := o.(map[string]any)
			os := ObjectiveSummary{ID: str(om, "id"), Objective: str(om, "objective"), KeyResults: []KeyResultSummary{}}
			krs, _ := om["key_results"].([]any)
			for _, k := range krs {
				km, _ := k.(map[string]any)
				os.KeyResults = append(os.KeyResults, KeyResultSummary{ID: str(km, "id"), Description: str(km, "description")})
			}
			to.Objectives = append(to.Objectives, os)
		}
		out = append(out, to)
	}
	return out
}

// KeyResultDetail is one key result with the context needed to answer a
// question about it.
type KeyResultDetail struct {
	Track     string `json:"track"`
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
		okrs, _ := tm["okrs"].([]any)
		for _, o := range okrs {
			om, _ := o.(map[string]any)
			krs, _ := om["key_results"].([]any)
			for _, k := range krs {
				km, _ := k.(map[string]any)
				if str(km, "id") != id {
					continue
				}
				d := KeyResultDetail{Track: name, KeyResult: km, Assumptions: []any{}, Dependencies: []any{}}
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
	return KeyResultDetail{}, false
}

func containsString(list []any, s string) bool {
	for _, v := range list {
		if str, ok := v.(string); ok && str == s {
			return true
		}
	}
	return false
}

package handler

import (
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategyread"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// okrEntry is one objective of a roadmap track and the list it is stored in.
type okrEntry struct {
	// Group is empty for the current "okrs" list, and otherwise the name of the
	// "future_okrs_*" list, which an instance names itself.
	Group     string
	Objective map[string]any
}

// roadmapTrackOKRs lists every objective of a roadmap track: the current list
// first, then each later list in name order. Every page that reads objectives
// goes through it, so none sees only part of a roadmap.
func roadmapTrackOKRs(track map[string]any) []okrEntry {
	var out []okrEntry
	for _, g := range strategyread.OKRGroups(track) {
		group := g.Name
		if group == "okrs" {
			group = ""
		}
		for _, item := range g.Items {
			if om, ok := item.(map[string]any); ok {
				out = append(out, okrEntry{Group: group, Objective: om})
			}
		}
	}
	return out
}

// roadmapTrackMeta names the four tracks in the order the pages list them.
var roadmapTrackMeta = []struct{ key, name, icon string }{
	{"strategy", "Strategy", "lucide--navigation"},
	{"org_ops", "Org & Ops", "lucide--container"},
	{"product", "Product", "lucide--code-2"},
	{"commercial", "Commercial", "lucide--briefcase"},
}

// fireObjectivesByTrack reads the objectives and Key Results of each track for the
// FIRE page, from every list a track holds.
func fireObjectivesByTrack(roadmap map[string]any) map[string][]ui.FireOKRObjective {
	tracks, _ := roadmap["tracks"].(map[string]any)
	result := make(map[string][]ui.FireOKRObjective)
	for trackKey, trackVal := range tracks {
		trackMap, ok := trackVal.(map[string]any)
		if !ok {
			continue
		}
		var objectives []ui.FireOKRObjective
		for _, entry := range roadmapTrackOKRs(trackMap) {
			okrMap := entry.Objective
			obj, _ := okrMap["objective"].(string)
			if obj == "" {
				continue
			}
			var krs []ui.FireOKRKeyResult
			if krList, ok := okrMap["key_results"].([]any); ok {
				for _, kr := range krList {
					krMap, ok := kr.(map[string]any)
					if !ok {
						continue
					}
					desc, _ := krMap["description"].(string)
					if desc == "" {
						desc, _ = krMap["target"].(string)
					}
					if desc == "" {
						continue
					}
					k := ui.FireOKRKeyResult{Description: desc}
					if v, ok := krMap["trl_start"].(float64); ok {
						k.TRLStart = int(v)
					}
					if v, ok := krMap["trl_target"].(float64); ok {
						k.TRLTarget = int(v)
					}
					k.TRLProgression, _ = krMap["trl_progression"].(string)
					krs = append(krs, k)
				}
			}
			objectives = append(objectives, ui.FireOKRObjective{Objective: obj, Group: entry.Group, KeyResults: krs})
		}
		if len(objectives) > 0 {
			result[trackKey] = objectives
		}
	}
	return result
}

// trackOKRSummaries counts the objectives and Key Results of each track, in every
// list the track holds. A track with no objective list is left out.
func trackOKRSummaries(tracks map[string]any) []ui.TrackOKRSummary {
	var summaries []ui.TrackOKRSummary
	for _, tm := range roadmapTrackMeta {
		t, ok := tracks[tm.key].(map[string]any)
		if !ok || len(strategyread.OKRGroups(t)) == 0 {
			continue
		}
		s := ui.TrackOKRSummary{Track: tm.name, Icon: tm.icon}
		for _, entry := range roadmapTrackOKRs(t) {
			s.Objectives++
			if krs, ok := entry.Objective["key_results"].([]any); ok {
				s.KeyResults += len(krs)
			}
		}
		summaries = append(summaries, s)
	}
	return summaries
}

// executionTracks assembles the tracks of the execution page, each with the
// objectives of every list it holds, with build making one objective. A track with
// no objectives is left out.
func executionTracks(tracks map[string]any, defs map[string][]ui.ExecutionDefinition, build func(map[string]any) ui.ExecutionOKR) []ui.ExecutionTrack {
	var out []ui.ExecutionTrack
	for _, tm := range roadmapTrackMeta {
		trackData, ok := tracks[tm.key].(map[string]any)
		if !ok {
			continue
		}
		var okrs []ui.ExecutionOKR
		for _, entry := range roadmapTrackOKRs(trackData) {
			okr := build(entry.Objective)
			okr.Group = entry.Group
			okrs = append(okrs, okr)
		}
		if len(okrs) == 0 {
			continue
		}
		out = append(out, ui.ExecutionTrack{Name: tm.name, Icon: tm.icon, Definitions: defs[tm.key], OKRs: okrs})
	}
	return out
}

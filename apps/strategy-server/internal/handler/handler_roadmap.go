package handler

import (
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// roadmapRecipeContent extracts rich data from a roadmap_recipe payload
// and returns a bespoke RoadmapRecipeContent component.
func (s *Server) roadmapRecipeContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// The roadmap data may be wrapped in a "roadmap" top-level key.
	root, ok := payload["roadmap"].(map[string]any)
	if !ok {
		root = payload
	}

	data := ui.RoadmapRecipeData{
		NavContext:       navCtx,
		ArtifactKey:      artifactKey,
		Name:             name,
		Status:           status,
		RoadmapID:        payloadStr(root, "roadmap_id"),
		Cycle:            payloadStr(root, "cycle"),
		Timeframe:        payloadStr(root, "timeframe"),
		StartDate:        payloadStr(root, "start_date"),
		TargetCompletion: payloadStr(root, "target_completion"),
		LastUpdated:      payloadStr(root, "last_updated"),
	}

	// ── Tracks ──
	// Tracks can be an object with named sub-keys (product, strategy, commercial, org_ops)
	// or an array. Support both.
	if tracksObj, ok := root["tracks"].(map[string]any); ok {
		trackNames := []string{"strategy", "org_ops", "product", "commercial"}
		for _, tn := range trackNames {
			tm, ok := tracksObj[tn].(map[string]any)
			if !ok {
				continue
			}
			data.Tracks = append(data.Tracks, extractRoadmapTrack(tn, tm))
		}
	}
	if tracksArr, ok := root["tracks"].([]any); ok {
		for _, item := range tracksArr {
			tm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			trackName := payloadStr(tm, "name")
			if trackName == "" {
				trackName = payloadStr(tm, "track")
			}
			data.Tracks = append(data.Tracks, extractRoadmapTrack(trackName, tm))
		}
	}

	// Build KR lookup: "kr-id" → RoadmapKR (for critical path resolution).
	krByID := make(map[string]ui.RoadmapKR)
	for _, track := range data.Tracks {
		for _, okr := range track.OKRs {
			for _, kr := range okr.KeyResults {
				if kr.ID != "" {
					krByID[kr.ID] = kr
				}
			}
		}
	}

	// ── Execution Plan ──
	if ep, ok := root["execution_plan"].(map[string]any); ok {
		// Resolve critical path: entries are "track:kr-id" or bare "kr-id".
		for _, raw := range payloadStrSlice(ep, "critical_path") {
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

		if milestones, ok := ep["milestones"].([]any); ok {
			for _, item := range milestones {
				mm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Milestones = append(data.Milestones, ui.RoadmapMilestone{
					Date:        payloadStr(mm, "date"),
					Milestone:   payloadStr(mm, "milestone"),
					Description: payloadStr(mm, "description"),
					Status:      payloadStr(mm, "status"),
				})
			}
		}
	}

	// ── Cross-Track Dependencies ──
	if deps, ok := root["cross_track_dependencies"].([]any); ok {
		for _, item := range deps {
			dm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Dependencies = append(data.Dependencies, ui.RoadmapDependency{
				FromKR:         payloadStr(dm, "from_kr"),
				ToKR:           payloadStr(dm, "to_kr"),
				Description:    payloadStr(dm, "description"),
				DependencyType: payloadStr(dm, "dependency_type"),
			})
		}
	}

	data.Gaps = checkRoadmapGaps(payload)
	return ui.RoadmapRecipeContent(data)
}

// extractRoadmapTrack builds a RoadmapTrack from a track map.
func extractRoadmapTrack(trackName string, tm map[string]any) ui.RoadmapTrack {
	track := ui.RoadmapTrack{
		Name:      trackName,
		Objective: payloadStr(tm, "objective"),
	}

	// OKRs
	if okrs, ok := tm["okrs"].([]any); ok {
		for _, item := range okrs {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			okr := ui.RoadmapOKR{
				ID:        payloadStr(om, "id"),
				Objective: payloadStr(om, "objective"),
			}

			if krs, ok := om["key_results"].([]any); ok {
				for _, krItem := range krs {
					km, ok := krItem.(map[string]any)
					if !ok {
						continue
					}
					okr.KeyResults = append(okr.KeyResults, ui.RoadmapKR{
						ID:          payloadStr(km, "id"),
						Description: payloadStr(km, "description"),
						Baseline:    payloadStr(km, "baseline"),
						Target:      payloadStr(km, "target"),
						TRLStart:    payloadIntAsStr(km, "trl_start"),
						TRLTarget:   payloadIntAsStr(km, "trl_target"),
					})
				}
			}

			track.OKRs = append(track.OKRs, okr)
		}
	}

	// Riskiest assumptions
	if assumptions, ok := tm["riskiest_assumptions"].([]any); ok {
		for _, item := range assumptions {
			am, ok := item.(map[string]any)
			if !ok {
				continue
			}
			track.Assumptions = append(track.Assumptions, ui.RoadmapAssumption{
				ID:          payloadStr(am, "id"),
				Description: payloadStr(am, "description"),
				Criticality: payloadStr(am, "criticality"),
				Confidence:  payloadStr(am, "confidence"),
			})
		}
	}

	return track
}

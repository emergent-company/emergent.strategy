package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// assessmentContent extracts rich data from an assessment_report payload
// and returns a bespoke AssessmentContent component.
func (s *Server) assessmentContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.AssessmentViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		Cycle:       payloadInt(payload, "cycle"),
		RoadmapID:   payloadStr(payload, "roadmap_id"),
		LastUpdated: payloadStr(payload, "last_updated"),
	}

	// Also check nested "meta" for last_updated.
	if meta, ok := payload["meta"].(map[string]any); ok {
		if data.LastUpdated == "" {
			data.LastUpdated = payloadStr(meta, "last_updated")
		}
		if data.RoadmapID == "" {
			data.RoadmapID = payloadStr(meta, "roadmap_id")
		}
	}

	// ── OKR Assessments ──
	if okrs, ok := payload["okr_assessments"].([]any); ok {
		for _, item := range okrs {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			okr := ui.AssessmentOKR{
				OKRID:      payloadStr(om, "okr_id"),
				Assessment: payloadStr(om, "assessment"),
			}

			if krs, ok := om["key_results"].([]any); ok {
				for _, krItem := range krs {
					km, ok := krItem.(map[string]any)
					if !ok {
						continue
					}
					okr.KeyResults = append(okr.KeyResults, ui.AssessmentKR{
						KRID:      payloadStr(km, "kr_id"),
						Status:    payloadStr(km, "status"),
						Target:    payloadStr(km, "target"),
						Actual:    payloadStr(km, "actual"),
						Learnings: payloadStrSlice(km, "learnings"),
					})
				}
			}

			data.OKRAssessments = append(data.OKRAssessments, okr)
		}
	}

	// ── Assumption Validations ──
	if assumptions, ok := payload["assumption_validations"].([]any); ok {
		for _, item := range assumptions {
			am, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.AssumptionValidations = append(data.AssumptionValidations, ui.AssessmentAssumption{
				ID:               payloadStr(am, "id"),
				Status:           payloadStr(am, "status"),
				Evidence:         payloadStr(am, "evidence"),
				ConfidenceChange: payloadStr(am, "confidence_change"),
			})
		}
	}

	// ── Strategic Insights ──
	data.StrategicInsights = payloadStrSlice(payload, "strategic_insights")

	// ── Recommendations ──
	data.Recommendations = payloadStrSlice(payload, "next_cycle_recommendations")
	if len(data.Recommendations) == 0 {
		data.Recommendations = payloadStrSlice(payload, "recommendations")
	}

	return ui.AssessmentContent(data)
}

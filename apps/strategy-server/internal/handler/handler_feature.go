package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// featureViewContent extracts rich data from a feature_definition payload
// and returns a bespoke FeatureViewContent component.
func (s *Server) featureViewContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.FeatureViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		Slug:        payloadStr(payload, "slug"),
	}
	if data.Name == "" {
		data.Name = payloadStr(payload, "name")
	}

	// ── Definition ──
	if def, ok := payload["definition"].(map[string]any); ok {
		data.JobToBeDone = payloadStr(def, "job_to_be_done")
		data.SolutionApproach = payloadStr(def, "solution_approach")

		// Capabilities
		if caps, ok := def["capabilities"].([]any); ok {
			for _, item := range caps {
				cm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Capabilities = append(data.Capabilities, ui.FeatureCapability{
					ID:           payloadStr(cm, "id"),
					Name:         payloadStr(cm, "name"),
					Description:  payloadStr(cm, "description"),
					ValueOutcome: payloadStr(cm, "value_outcome"),
				})
			}
		}

		// Scenarios
		if scenarios, ok := def["scenarios"].([]any); ok {
			for _, item := range scenarios {
				sm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Scenarios = append(data.Scenarios, ui.FeatureScenario{
					ID:      payloadStr(sm, "id"),
					Name:    payloadStr(sm, "name"),
					Actor:   payloadStr(sm, "actor"),
					Trigger: payloadStr(sm, "trigger"),
					Context: payloadStr(sm, "context"),
					Action:  payloadStr(sm, "action"),
					Outcome: payloadStr(sm, "outcome"),
				})
			}
		}
	}

	// ── Strategic Context ──
	if sc, ok := payload["strategic_context"].(map[string]any); ok {
		data.Tracks = payloadStrSlice(sc, "tracks")
		data.ContributesTo = payloadStrSlice(sc, "contributes_to")
		data.AssumptionsTested = payloadStrSlice(sc, "assumptions_tested")
	}

	// ── Dependencies ──
	if deps, ok := payload["dependencies"].(map[string]any); ok {
		if requires, ok := deps["requires"].([]any); ok {
			for _, item := range requires {
				dm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Requires = append(data.Requires, ui.FeatureDep{
					ID:     payloadStr(dm, "id"),
					Name:   payloadStr(dm, "name"),
					Reason: payloadStr(dm, "reason"),
				})
			}
		}
		if enables, ok := deps["enables"].([]any); ok {
			for _, item := range enables {
				dm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Enables = append(data.Enables, ui.FeatureDep{
					ID:     payloadStr(dm, "id"),
					Name:   payloadStr(dm, "name"),
					Reason: payloadStr(dm, "reason"),
				})
			}
		}
	}

	// ── Boundaries ──
	if boundaries, ok := payload["boundaries"].(map[string]any); ok {
		data.InScope = payloadStrSlice(boundaries, "in_scope")
		data.OutOfScope = payloadStrSlice(boundaries, "out_of_scope")
	}

	return ui.FeatureViewContent(data)
}

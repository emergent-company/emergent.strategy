package handler

import (
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// featureViewContent extracts rich data from a feature_definition payload
// and returns a bespoke FeatureViewContent component.
func (s *Server) featureViewContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	return ui.FeatureViewContent(buildFeatureViewData(navCtx, artifactKey, name, status, payload))
}

// buildFeatureViewData maps a feature_definition payload onto the view model.
//
// Field locations follow feature_definition_schema.json: scenarios and contexts
// live under `implementation`, boundaries are `non_goals` / `constraints`.
// Older payloads that put scenarios under `definition` or used
// `in_scope` / `out_of_scope` are still read so nothing silently disappears.
func buildFeatureViewData(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) ui.FeatureViewData {
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

	def, _ := payload["definition"].(map[string]any)
	impl, _ := payload["implementation"].(map[string]any)

	// ── Definition ──
	if def != nil {
		data.JobToBeDone = payloadStr(def, "job_to_be_done")
		data.SolutionApproach = payloadStr(def, "solution_approach")

		for _, cm := range payloadMaps(def, "capabilities") {
			data.Capabilities = append(data.Capabilities, ui.FeatureCapability{
				ID:           payloadStr(cm, "id"),
				Name:         payloadStr(cm, "name"),
				Description:  payloadStr(cm, "description"),
				ValueOutcome: payloadStr(cm, "value_outcome"),
			})
		}

		for _, pm := range payloadMaps(def, "personas") {
			data.Personas = append(data.Personas, ui.FeaturePersona{
				ID:                   payloadStr(pm, "id"),
				Name:                 payloadStr(pm, "name"),
				Role:                 payloadStr(pm, "role"),
				Description:          payloadStr(pm, "description"),
				Goals:                payloadStrSlice(pm, "goals"),
				PainPoints:           payloadStrSlice(pm, "pain_points"),
				UsageContext:         payloadStr(pm, "usage_context"),
				TechnicalProficiency: payloadStr(pm, "technical_proficiency"),
				CurrentSituation:     splitNarrative(payloadStr(pm, "current_situation")),
				TransformationMoment: splitNarrative(payloadStr(pm, "transformation_moment")),
				EmotionalResolution:  splitNarrative(payloadStr(pm, "emotional_resolution")),
			})
		}
	}

	// ── Scenarios (schema: implementation.scenarios; legacy: definition.scenarios) ──
	scenarios := payloadMaps(impl, "scenarios")
	if len(scenarios) == 0 {
		scenarios = payloadMaps(def, "scenarios")
	}
	for _, sm := range scenarios {
		data.Scenarios = append(data.Scenarios, ui.FeatureScenario{
			ID:                 payloadStr(sm, "id"),
			Name:               payloadStr(sm, "name"),
			Actor:              payloadStr(sm, "actor"),
			Trigger:            payloadStr(sm, "trigger"),
			Context:            payloadStr(sm, "context"),
			Action:             payloadStr(sm, "action"),
			Outcome:            payloadStr(sm, "outcome"),
			AcceptanceCriteria: payloadStrSlice(sm, "acceptance_criteria"),
		})
	}

	// ── Contexts and integrations ──
	for _, cm := range payloadMaps(impl, "contexts") {
		data.Contexts = append(data.Contexts, ui.FeatureContext{
			ID:              payloadStr(cm, "id"),
			Type:            payloadStr(cm, "type"),
			Name:            payloadStr(cm, "name"),
			Description:     payloadStr(cm, "description"),
			KeyInteractions: payloadStrSlice(cm, "key_interactions"),
			DataDisplayed:   payloadStrSlice(cm, "data_displayed"),
		})
	}
	for _, im := range payloadMaps(impl, "external_integrations") {
		data.Integrations = append(data.Integrations, ui.FeatureIntegration{
			Name:      payloadStr(im, "name"),
			Purpose:   payloadStr(im, "purpose"),
			Direction: payloadStr(im, "direction"),
		})
	}

	// ── Strategic Context ──
	if sc, ok := payload["strategic_context"].(map[string]any); ok {
		data.Tracks = payloadStrSlice(sc, "tracks")
		data.ContributesTo = payloadStrSlice(sc, "contributes_to")
		data.AssumptionsTested = payloadStrSlice(sc, "assumptions_tested")
	}

	// ── Dependencies ──
	if deps, ok := payload["dependencies"].(map[string]any); ok {
		data.Requires = featureDeps(deps, "requires")
		data.Enables = featureDeps(deps, "enables")
	}

	// ── Boundaries (schema: non_goals / constraints; legacy: in_scope / out_of_scope) ──
	if boundaries, ok := payload["boundaries"].(map[string]any); ok {
		data.NonGoals = payloadStrSlice(boundaries, "non_goals")
		data.Constraints = payloadStrSlice(boundaries, "constraints")
		data.InScope = payloadStrSlice(boundaries, "in_scope")
		data.OutOfScope = payloadStrSlice(boundaries, "out_of_scope")
	}

	return data
}

// payloadMaps returns the object elements of a JSONB array field. A nil map
// or a missing/non-array field yields nil.
func payloadMaps(m map[string]any, key string) []map[string]any {
	if m == nil {
		return nil
	}
	arr, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]map[string]any, 0, len(arr))
	for _, item := range arr {
		if obj, ok := item.(map[string]any); ok {
			out = append(out, obj)
		}
	}
	return out
}

func featureDeps(deps map[string]any, key string) []ui.FeatureDep {
	var out []ui.FeatureDep
	for _, dm := range payloadMaps(deps, key) {
		out = append(out, ui.FeatureDep{
			ID:     payloadStr(dm, "id"),
			Name:   payloadStr(dm, "name"),
			Reason: payloadStr(dm, "reason"),
		})
	}
	return out
}

// splitNarrative splits persona narrative text into paragraphs on blank lines,
// which is how the EPF feature wizard asks authors to structure them.
func splitNarrative(text string) []string {
	text = strings.ReplaceAll(text, "\r\n", "\n")
	var out []string
	for _, p := range strings.Split(text, "\n\n") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}

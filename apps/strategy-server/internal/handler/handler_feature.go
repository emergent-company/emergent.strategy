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
//
// The page never drops stored content. Whatever the readers below do not show, as
// listed in featureShownPaths, is handed to the generic renderer under a notice
// (data.Unshown).
func buildFeatureViewData(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) ui.FeatureViewData {
	data := ui.FeatureViewData{
		NavContext:      navCtx,
		ArtifactKey:     artifactKey,
		Name:            name,
		Status:          status,
		Slug:            tolStr(payload, "slug"),
		ID:              tolStr(payload, "id"),
		LifecycleStatus: tolStr(payload, "status"),
	}
	if stored := tolStr(payload, "name"); data.Name == "" {
		data.Name = stored
	} else if stored != data.Name {
		data.PayloadName = stored
	}

	def := tolMap(payload, "definition")
	impl := tolMap(payload, "implementation")

	// ── Definition ──
	if def != nil {
		data.JobToBeDone = tolStr(def, "job_to_be_done")
		data.SolutionApproach = tolStr(def, "solution_approach")

		for _, cm := range tolItems(def["capabilities"], "name") {
			c := ui.FeatureCapability{
				ID:           tolStr(cm, "id"),
				Name:         tolStr(cm, "name"),
				Description:  tolStr(cm, "description"),
				ValueOutcome: tolStr(cm, "value_outcome"),
			}
			if c != (ui.FeatureCapability{}) {
				data.Capabilities = append(data.Capabilities, c)
			}
		}

		for _, pm := range tolItems(def["personas"], "name") {
			data.Personas = append(data.Personas, readFeaturePersona(pm))
		}
	}

	// ── Scenarios (schema: implementation.scenarios; legacy: definition.scenarios) ──
	// A payload may hold both, so both are read: reading the legacy list only when
	// the schema one is empty would drop it while featureShownPaths claims it.
	scenarios := append(tolItems(impl["scenarios"], "name"), tolItems(def["scenarios"], "name")...)
	for _, sm := range scenarios {
		data.Scenarios = append(data.Scenarios, ui.FeatureScenario{
			ID:                 tolStr(sm, "id"),
			Name:               tolStr(sm, "name"),
			Category:           tolStr(sm, "jtbd_category"),
			Actor:              tolStr(sm, "actor"),
			Trigger:            tolStr(sm, "trigger"),
			Context:            tolStr(sm, "context"),
			Action:             tolStr(sm, "action"),
			Outcome:            tolStr(sm, "outcome"),
			AcceptanceCriteria: tolStrs(sm, "acceptance_criteria"),
		})
	}

	// ── Contexts and integrations ──
	for _, cm := range tolItems(impl["contexts"], "name") {
		data.Contexts = append(data.Contexts, ui.FeatureContext{
			ID:              tolStr(cm, "id"),
			Type:            tolStr(cm, "type"),
			Name:            tolStr(cm, "name"),
			Description:     tolStr(cm, "description"),
			KeyInteractions: tolStrs(cm, "key_interactions"),
			DataDisplayed:   tolStrs(cm, "data_displayed"),
		})
	}
	for _, im := range tolItems(impl["external_integrations"], "name") {
		data.Integrations = append(data.Integrations, ui.FeatureIntegration{
			Name:      tolStr(im, "name"),
			Purpose:   tolStr(im, "purpose"),
			Direction: tolStr(im, "direction"),
		})
	}

	// ── Strategic Context ──
	if sc := tolMap(payload, "strategic_context"); sc != nil {
		data.Tracks = tolStrs(sc, "tracks")
		data.ContributesTo = tolStrs(sc, "contributes_to")
		data.AssumptionsTested = tolStrs(sc, "assumptions_tested")
	}

	// ── Dependencies ──
	if deps := tolMap(payload, "dependencies"); deps != nil {
		data.Requires = featureDeps(deps, "requires")
		data.Enables = featureDeps(deps, "enables")
	}

	// ── Boundaries (schema: non_goals / constraints; legacy: in_scope / out_of_scope) ──
	if boundaries := tolMap(payload, "boundaries"); boundaries != nil {
		data.NonGoals = tolStrs(boundaries, "non_goals")
		data.Constraints = tolStrs(boundaries, "constraints")
		data.InScope = tolStrs(boundaries, "in_scope")
		data.OutOfScope = tolStrs(boundaries, "out_of_scope")
	}

	data.Records = readRecords(payload, featureRecordSpecs)
	data.Unshown = featureUnshown(payload)
	return data
}

// readFeaturePersona reads a persona with its three-part narrative and its
// demographics and psychographics.
func readFeaturePersona(pm map[string]any) ui.FeaturePersona {
	p := ui.FeaturePersona{
		ID:                   tolStr(pm, "id"),
		Name:                 tolStr(pm, "name"),
		Role:                 tolStr(pm, "role"),
		Description:          tolStr(pm, "description"),
		Goals:                tolStrs(pm, "goals"),
		PainPoints:           tolStrs(pm, "pain_points"),
		UsageContext:         tolStr(pm, "usage_context"),
		TechnicalProficiency: tolStr(pm, "technical_proficiency"),
		CurrentSituation:     splitNarrative(tolStr(pm, "current_situation")),
		TransformationMoment: splitNarrative(tolStr(pm, "transformation_moment")),
		EmotionalResolution:  splitNarrative(tolStr(pm, "emotional_resolution")),
	}
	for _, g := range featurePersonaProfile {
		sub := tolMap(pm, g.group)
		for _, f := range g.facts {
			if v := tolStr(sub, f.key); v != "" {
				p.Profile = append(p.Profile, ui.RecordFact{Label: f.label, Value: v})
			}
		}
		for _, f := range g.lists {
			if items := tolStrs(sub, f.key); len(items) > 0 {
				p.ProfileLists = append(p.ProfileLists, ui.RecordList{Label: f.label, Items: items})
			}
		}
	}
	return p
}

// featurePersonaProfile lists the persona fields held in the demographics and
// psychographics blocks.
var featurePersonaProfile = []struct {
	group string
	facts []recordField
	lists []recordField
}{
	{"demographics",
		[]recordField{{"age_range", "Age range"}, {"experience_years", "Experience (years)"}, {"company_size", "Company size"}, {"geography", "Geography"}, {"education", "Education"}, {"reporting_structure", "Reports to"}},
		[]recordField{{"industry", "Industry"}}},
	{"psychographics",
		[]recordField{{"decision_style", "Decision style"}, {"communication_preferences", "Communication"}},
		[]recordField{{"values", "Values"}, {"motivations", "Motivations"}, {"fears", "Fears"}, {"information_sources", "Information sources"}}},
}

// featureRecordSpecs are the card sections of the page.
var featureRecordSpecs = []recordSpec{
	{kind: ui.FeatureKindMaturity, path: []string{"feature_maturity"}, single: true,
		facts: []recordField{{"overall_stage", "Stage"}, {"last_advanced_by_kr", "Last advanced by"}, {"last_assessment_date", "Last assessed"}}},
	{kind: ui.FeatureKindCapabilityMat, path: []string{"feature_maturity", "capability_maturity"}, head: "capability_id",
		facts: []recordField{{"stage", "Stage"}, {"delivered_by_kr", "Delivered by"}, {"evidence", "Evidence"}}},
	{kind: ui.FeatureKindArchitecture, path: []string{"definition", "architecture_patterns"}, head: "name",
		facts: []recordField{{"description", "Description"}}, lists: []recordField{{"components", "Components"}}},
	{kind: ui.FeatureKindDesign, path: []string{"implementation", "design_guidance"}, single: true,
		lists: []recordField{{"principles", "Principles"}, {"inspirations", "Inspirations"}, {"interaction_patterns", "Interaction patterns"}}},
	{kind: ui.FeatureKindReferences, path: []string{"implementation_references"}, single: true,
		facts: []recordField{{"tool_name", "Tool"}, {"last_sync", "Last sync"}}},
	{kind: ui.FeatureKindSpecs, path: []string{"implementation_references", "specs"}, head: "id",
		facts: []recordField{{"path", "Path"}, {"url", "URL"}, {"status", "Status"}},
		lists: []recordField{{"capability_coverage", "Capabilities covered"}, {"scenario_coverage", "Scenarios covered"}}},
	{kind: ui.FeatureKindCoverage, path: []string{"implementation_references", "coverage_summary"}, single: true,
		facts: []recordField{{"capabilities_covered", "Capabilities covered"}, {"capabilities_total", "Capabilities total"}, {"scenarios_tested", "Scenarios tested"}, {"scenarios_total", "Scenarios total"}}},
	{kind: ui.FeatureKindTools, path: []string{"tools_ecosystem", "recommended"}, head: "category",
		facts: []recordField{{"purpose", "Purpose"}}, lists: []recordField{{"examples", "Examples"}}},
	{kind: ui.FeatureKindIntegrations, path: []string{"tools_ecosystem"}, single: true,
		lists: []recordField{{"integrations", "Integrations"}}},
}

func featureDeps(deps map[string]any, key string) []ui.FeatureDep {
	var out []ui.FeatureDep
	for _, dm := range tolItems(deps[key], "name") {
		d := ui.FeatureDep{ID: tolStr(dm, "id"), Name: tolStr(dm, "name"), Reason: tolStr(dm, "reason")}
		if d != (ui.FeatureDep{}) {
			out = append(out, d)
		}
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

// featureUnshown returns the stored content the page has no dedicated view for.
func featureUnshown(payload map[string]any) map[string]any {
	return unshownContent(payload, featureShownPaths)
}

// featureShownPaths lists every path of the payload that the page renders. Anything
// not listed reaches the page through the generic fallback, so this list must hold
// only what the readers really show: TestFeatureViewShowsEveryFieldOfTheSchema
// renders a payload built from the embedded schema and checks each field.
var featureShownPaths = buildFeatureShownPaths()

func buildFeatureShownPaths() []string {
	var p []string
	add := func(x ...string) { p = append(p, x...) }
	add("id", "name", "slug", "status", "definition.job_to_be_done", "definition.solution_approach")
	add(entryPaths("definition.capabilities", "id", "name", "description", "value_outcome")...)
	persona := []string{"id", "name", "role", "description", "goals", "pain_points", "usage_context", "technical_proficiency", "current_situation", "transformation_moment", "emotional_resolution"}
	for _, g := range featurePersonaProfile {
		for _, f := range g.facts {
			persona = append(persona, g.group+"."+f.key)
		}
		for _, f := range g.lists {
			persona = append(persona, g.group+"."+f.key)
		}
	}
	add(entryPaths("definition.personas", persona...)...)
	sc := []string{"id", "name", "jtbd_category", "actor", "trigger", "context", "action", "outcome", "acceptance_criteria"}
	add(entryPaths("implementation.scenarios", sc...)...)
	add(entryPaths("definition.scenarios", sc...)...)
	add(entryPaths("implementation.contexts", "id", "type", "name", "description", "key_interactions", "data_displayed")...)
	add(entryPaths("implementation.external_integrations", "name", "purpose", "direction")...)
	add("strategic_context.tracks", "strategic_context.contributes_to", "strategic_context.assumptions_tested")
	add(entryPaths("dependencies.requires", "id", "name", "reason")...)
	add(entryPaths("dependencies.enables", "id", "name", "reason")...)
	add("boundaries.non_goals", "boundaries.constraints", "boundaries.in_scope", "boundaries.out_of_scope")
	return append(p, recordPaths(featureRecordSpecs)...)
}

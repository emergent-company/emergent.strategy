package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// strategyFoundationsContent extracts rich data from a strategy_foundations payload
// and returns a bespoke StrategyFoundationsContent component.
//
// The page never drops stored content. Whatever the readers below do not show, as
// listed in foundationsShownPaths, is handed to the generic renderer under a
// notice (data.Unshown).
func (s *Server) strategyFoundationsContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	root, wrapped := rootOf(payload, "strategy_foundations")

	data := ui.StrategyFoundationsData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		LastUpdated: tolStr(root, "last_updated"),
		Confidence:  tolStr(root, "confidence_level"),
	}
	if v := tolStr(root, "opportunity_id"); v != "" {
		data.References = append(data.References, ui.RecordFact{Label: "Opportunity", Value: v})
	}

	applyFoundationsVision(&data, root)
	applyFoundationsValueProposition(&data, root)
	applyFoundationsSequencing(&data, root)
	applyFoundationsArchitecture(&data, root)

	data.Records = readRecords(root, foundationsRecordSpecs)
	outer := root
	if wrapped {
		outer = payload
	}
	data.Records = append(data.Records, readRecords(outer, foundationsOuterSpecs)...)

	data.Unshown = foundationsUnshown(payload)
	data.Gaps = checkFoundationGaps(payload)
	return ui.StrategyFoundationsContent(data)
}

// foundationsUnshown returns the stored content the page has no dedicated view for.
func foundationsUnshown(payload map[string]any) map[string]any {
	return unshownInRoot(payload, "strategy_foundations", foundationsShownPaths, foundationsOuterPaths)
}

// firstNonEmpty returns the first of the values that is not empty.
func firstNonEmpty(values ...string) string {
	for _, v := range values {
		if v != "" {
			return v
		}
	}
	return ""
}

func applyFoundationsVision(data *ui.StrategyFoundationsData, root map[string]any) {
	pv := tolMap(root, "product_vision")
	if pv == nil {
		return
	}
	data.VisionStatement = firstNonEmpty(tolStr(pv, "vision_statement"), tolStr(pv, "statement"))
	data.TargetTimeframe = firstNonEmpty(tolStr(pv, "target_timeframe"), tolStr(pv, "timeframe"))
	for _, im := range tolItems(pv["success_indicators"], "indicator") {
		ind := ui.FoundationIndicator{Indicator: tolStr(im, "indicator"), Target: tolStr(im, "target")}
		if ind != (ui.FoundationIndicator{}) {
			data.SuccessIndicators = append(data.SuccessIndicators, ind)
		}
	}
}

func applyFoundationsValueProposition(data *ui.StrategyFoundationsData, root map[string]any) {
	vp := tolMap(root, "value_proposition")
	if vp == nil {
		return
	}
	data.VPHeadline = tolStr(vp, "headline")
	data.VPTargetSegment = tolStr(vp, "target_segment")
	// The schema nests the benefits under functional_value; an older layout puts
	// them directly under value_proposition.
	data.KeyBenefits = append(tolStrs(tolMap(vp, "functional_value"), "key_benefits"), tolStrs(vp, "key_benefits")...)
	for _, pm := range tolItems(vp["proof_points"], "claim") {
		pp := ui.FoundationProofPoint{Claim: tolStr(pm, "claim"), Proof: tolStr(pm, "proof")}
		if pp != (ui.FoundationProofPoint{}) {
			data.ProofPoints = append(data.ProofPoints, pp)
		}
	}
	if ev := tolMap(vp, "economic_value"); ev != nil {
		data.EconomicValue = ui.FoundationEconomicValue{
			CostSavings:   tolStr(ev, "cost_savings"),
			RevenueGains:  tolStr(ev, "revenue_gains"),
			RiskReduction: tolStr(ev, "risk_reduction"),
		}
	}
}

func applyFoundationsSequencing(data *ui.StrategyFoundationsData, root map[string]any) {
	ss := tolMap(root, "strategic_sequencing")
	if ss == nil {
		return
	}
	data.SequencingPrinciple = firstNonEmpty(tolStr(ss, "sequencing_principle"), tolStr(ss, "principle"))
	for _, pm := range tolItems(ss["phases"], "name") {
		p := ui.FoundationPhase{
			Phase:              tolStr(pm, "phase"),
			Name:               tolStr(pm, "name"),
			Focus:              tolStr(pm, "focus"),
			Timeframe:          tolStr(pm, "timeframe"),
			TargetSegment:      tolStr(pm, "target_segment"),
			TargetProblem:      tolStr(pm, "target_problem"),
			EnabledBy:          tolStr(pm, "enabled_by_phase_1"),
			ValueDelivered:     append(tolStrs(pm, "value_delivered"), tolStrs(pm, "new_value_delivered")...),
			StrategicRationale: tolStr(pm, "strategic_rationale"),
		}
		for _, cm := range tolItems(pm["success_criteria"], "metric") {
			c := ui.FoundationCriterion{Metric: tolStr(cm, "metric"), Target: tolStr(cm, "target")}
			if c != (ui.FoundationCriterion{}) {
				p.SuccessCriteria = append(p.SuccessCriteria, c)
			}
		}
		if p.Phase != "" || p.Name != "" || p.Focus != "" || p.Timeframe != "" || p.TargetSegment != "" || p.TargetProblem != "" ||
			p.EnabledBy != "" || len(p.ValueDelivered) > 0 || len(p.SuccessCriteria) > 0 || p.StrategicRationale != "" {
			data.Phases = append(data.Phases, p)
		}
	}
}

func applyFoundationsArchitecture(data *ui.StrategyFoundationsData, root map[string]any) {
	ia := tolMap(root, "information_architecture")
	if ia != nil {
		data.ArchitecturePhilosophy = tolStr(ia, "architecture_philosophy")
		data.DesignPrinciples = readPrinciples(ia["design_principles"])
	}
	// An older layout puts the principles at the top level.
	data.DesignPrinciples = append(data.DesignPrinciples, readPrinciples(root["design_principles"])...)
}

func readPrinciples(v any) []ui.FoundationPrinciple {
	var out []ui.FoundationPrinciple
	for _, pm := range tolItems(v, "principle") {
		p := ui.FoundationPrinciple{Principle: tolStr(pm, "principle"), Manifestation: tolStr(pm, "manifestation")}
		if p != (ui.FoundationPrinciple{}) {
			out = append(out, p)
		}
	}
	return out
}

// ── record sections ──

// foundationsRecordSpecs are the sections of the root block whose entries share
// one card. Paths are relative to the root block.
var foundationsRecordSpecs = []recordSpec{
	{kind: ui.FoundationKindVisionTrends, path: []string{"product_vision", "vision_alignment", "informed_by_trends"}, head: "trend",
		facts: []recordField{{"how_it_informs", "How it informs"}}},
	{kind: ui.FoundationKindVisionOpportunity, path: []string{"product_vision", "vision_alignment", "addresses_opportunity"}, single: true,
		facts: []recordField{{"opportunity_aspect", "Opportunity aspect"}, {"user_benefit", "User benefit"}}},
	{kind: ui.FoundationKindVisionDifferentiator, path: []string{"product_vision", "vision_alignment"}, single: true,
		facts: []recordField{{"differentiator", "Differentiator"}}},

	{kind: ui.FoundationKindJobs, path: []string{"value_proposition", "functional_value", "jobs_to_be_done"}, head: "job",
		facts: []recordField{{"how_we_do_it", "How we do it"}, {"better_than", "Better than"}}},
	{kind: ui.FoundationKindJobs, path: []string{"value_proposition", "jobs_to_be_done"}, head: "job",
		facts: []recordField{{"how_we_do_it", "How we do it"}, {"better_than", "Better than"}}},
	{kind: ui.FoundationKindPains, path: []string{"value_proposition", "emotional_value", "pains_we_eliminate"}, head: "pain",
		facts: []recordField{{"how_eliminated", "How eliminated"}}},
	{kind: ui.FoundationKindPains, path: []string{"value_proposition", "pains_we_eliminate"}, head: "pain",
		facts: []recordField{{"how_eliminated", "How eliminated"}}},
	{kind: ui.FoundationKindFeelings, path: []string{"value_proposition", "emotional_value", "feelings_we_create"}, head: "feeling",
		facts: []recordField{{"situation", "Situation"}}},
	{kind: ui.FoundationKindFeelings, path: []string{"value_proposition", "feelings_we_create"}, head: "feeling",
		facts: []recordField{{"situation", "Situation"}}},
	{kind: ui.FoundationKindVPConsistency, path: []string{"value_proposition", "consistency_check"}, single: true,
		facts: []recordField{{"solves_problem", "Solves problem"}, {"exploits_white_space", "Exploits white space"}, {"leverages_strength", "Leverages strength"}}},

	{kind: ui.FoundationKindDependencies, path: []string{"strategic_sequencing", "sequencing_constraints", "dependencies"}, head: "dependency",
		facts: []recordField{{"from_phase", "From phase"}, {"to_phase", "To phase"}}},
	{kind: ui.FoundationKindSequenceRisks, path: []string{"strategic_sequencing", "sequencing_constraints", "risks_of_sequence"}, head: "risk",
		facts: []recordField{{"mitigation", "Mitigation"}}},
	{kind: ui.FoundationKindAlternative, path: []string{"strategic_sequencing", "sequencing_constraints"}, single: true,
		facts: []recordField{{"alternative_considered", "Alternative considered"}}},
	{kind: ui.FoundationKindSequenceConsistency, path: []string{"strategic_sequencing", "consistency_check"}, single: true,
		facts: []recordField{{"aligns_with_trends", "Aligns with trends"}, {"de_risks_assumptions", "De-risks assumptions"}, {"leverages_moat", "Leverages moat"}}},

	{kind: ui.FoundationKindMentalModel, path: []string{"information_architecture", "mental_model"}, single: true,
		lists: []recordField{{"user_thinks_in_terms_of", "Users think in terms of"}, {"not_in_terms_of", "Not in terms of"}, {"informed_by_jobs", "Informed by jobs"}}},
	{kind: ui.FoundationKindNavigation, path: []string{"information_architecture", "primary_structure", "top_level_navigation"}, head: "label",
		facts: []recordField{{"purpose", "Purpose"}, {"rationale", "Rationale"}, {"maps_to_job", "Maps to job"}}},
	{kind: ui.FoundationKindObjectTypes, path: []string{"information_architecture", "primary_structure", "key_object_types"}, head: "object",
		facts: []recordField{{"definition", "Definition"}, {"why_first_class", "Why first class"}},
		lists: []recordField{{"relationships", "Relationships"}, {"key_attributes", "Key attributes"}}},
	{kind: ui.FoundationKindPrimaryActions, path: []string{"information_architecture", "interaction_patterns", "primary_actions"}, head: "action",
		facts: []recordField{{"where", "Where"}, {"why_prominent", "Why prominent"}, {"frequency", "Frequency"}, {"complexity", "Complexity"}, {"must_be", "Must be"}}},
	{kind: ui.FoundationKindDiscovery, path: []string{"information_architecture", "interaction_patterns"}, single: true,
		facts: []recordField{{"information_discovery", "Information discovery"}}},
	{kind: ui.FoundationKindDiscovery, path: []string{"information_architecture", "interaction_patterns", "information_discovery"}, single: true,
		facts: []recordField{{"how_users_find_things", "How users find things"}, {"how_users_learn_status", "How users learn status"}}},
	{kind: ui.FoundationKindCompetitiveIA, path: []string{"information_architecture", "competitive_ia_comparison"}, single: true,
		facts: []recordField{{"competitor_approach", "Competitor approach"}, {"our_differentiation", "Our differentiation"}}},
	{kind: ui.FoundationKindIAConsistency, path: []string{"information_architecture", "consistency_check"}, single: true,
		facts: []recordField{{"reflects_mental_model", "Reflects mental model"}, {"supports_jobs", "Supports jobs"}, {"enables_sequencing", "Enables sequencing"},
			{"reflects_user_problems", "Reflects user problems"}, {"supports_value_prop", "Supports value proposition"}, {"scales_with_sequencing", "Scales with sequencing"}}},
}

// foundationsOuterSpecs are the sections beside the root block in a wrapped
// payload (inside it in an unwrapped one): the consistency validation and the
// change log.
var foundationsOuterSpecs = []recordSpec{
	{kind: ui.FoundationKindValidation, path: []string{"consistency_validation"}, single: true,
		facts: []recordField{{"last_validated", "Last validated"}, {"vision_aligns_with_north_star", "Vision aligns with North Star"},
			{"value_prop_addresses_insights", "Value proposition addresses insights"}, {"sequencing_exploits_trends", "Sequencing exploits trends"},
			{"ia_matches_user_mental_model", "IA matches user mental model"}}},
	{kind: ui.FoundationKindValidatedAgainst, path: []string{"consistency_validation", "validated_against"}, head: "artifact",
		facts: []recordField{{"status", "Status"}, {"notes", "Notes"}}},
	{kind: ui.FoundationKindKnownTensions, path: []string{"consistency_validation", "known_tensions"}, head: "tension",
		facts: []recordField{{"how_resolved", "How resolved"}}},
	{kind: ui.FoundationKindChangeLog, path: []string{"change_log"}, head: "date",
		facts: []recordField{{"changed_by", "Changed by"}, {"what_changed", "What changed"}, {"why", "Why"}, {"reason", "Reason"}, {"impact_on_fire_phase", "Impact on FIRE phase"}},
		lists: []recordField{{"sections_updated", "Sections updated"}, {"triggered_updates", "Triggered updates"}}},
}

// ── shown paths ──

// foundationsShownPaths lists every path of the root block that the page renders.
// See unshownContent for the syntax. Anything not listed reaches the page through
// the generic fallback, so this list must hold only what the readers really show:
// TestStrategyFoundationsViewShowsEveryFieldOfTheSchema renders a payload built
// from the embedded schema and checks that each field is on the page.
var foundationsShownPaths = buildFoundationsShownPaths()

// foundationsOuterPaths are the paths of the sections beside the root block.
var foundationsOuterPaths = recordPaths(foundationsOuterSpecs)

func buildFoundationsShownPaths() []string {
	var paths []string
	add := func(p ...string) { paths = append(paths, p...) }

	add("opportunity_id", "last_updated", "confidence_level")
	add("product_vision.vision_statement", "product_vision.statement", "product_vision.target_timeframe", "product_vision.timeframe")
	add(entryPaths("product_vision.success_indicators", "indicator", "target")...)
	add("value_proposition.headline", "value_proposition.target_segment",
		"value_proposition.functional_value.key_benefits", "value_proposition.key_benefits",
		"value_proposition.economic_value.cost_savings", "value_proposition.economic_value.revenue_gains",
		"value_proposition.economic_value.risk_reduction")
	add(entryPaths("value_proposition.proof_points", "claim", "proof")...)
	add("strategic_sequencing.sequencing_principle", "strategic_sequencing.principle")
	add(entryPaths("strategic_sequencing.phases", "phase", "name", "timeframe", "focus", "target_segment", "target_problem",
		"enabled_by_phase_1", "value_delivered", "new_value_delivered", "strategic_rationale")...)
	add(entryPaths("strategic_sequencing.phases.*.success_criteria", "metric", "target")...)
	add("information_architecture.architecture_philosophy")
	add(entryPaths("information_architecture.design_principles", "principle", "manifestation")...)
	add(entryPaths("design_principles", "principle", "manifestation")...)
	add(recordPaths(foundationsRecordSpecs)...)
	return paths
}

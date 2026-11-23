package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// strategyFormulaContent extracts rich data from a strategy_formula payload
// and returns a bespoke StrategyFormulaContent component.
//
// The page never drops stored content. Whatever the readers below do not show,
// as listed in formulaShownPaths, is handed to the generic renderer under a
// notice (data.Unshown).
func (s *Server) strategyFormulaContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	strategy, wrapped := formulaRoot(payload)

	data := ui.StrategyFormulaData{
		NavContext:          navCtx,
		ArtifactKey:         artifactKey,
		Name:                name,
		Status:              status,
		Title:               tolStr(strategy, "title"),
		LastUpdated:         tolStr(strategy, "last_updated"),
		Confidence:          tolStr(strategy, "confidence_level"),
		ConfidenceRationale: tolStr(strategy, "confidence_rationale"),
		NextValidation:      tolStrs(strategy, "next_validation_needed"),
	}
	if data.Title == "" {
		data.Title = name
	}
	for _, ref := range []recordField{
		{"id", "ID"}, {"opportunity_id", "Opportunity"}, {"informed_by_foundations", "Foundations"}, {"aligns_with_north_star", "North Star"},
	} {
		if v := tolStr(strategy, ref.key); v != "" {
			data.References = append(data.References, ui.RecordFact{Label: ref.label, Value: v})
		}
	}

	applyFormulaPositioning(&data, strategy)
	applyFormulaCompetitiveMoat(&data, strategy)
	applyFormulaBusinessModel(&data, strategy)
	applyFormulaValueCreation(&data, strategy)
	data.Risks = extractFormulaRisks(strategy)
	data.TradeOffs = extractFormulaTradeOffs(strategy)
	applyFormulaSuccessMetrics(&data, strategy)
	applyFormulaEcosystem(&data, strategy)

	data.Records = readRecords(strategy, formulaRecordSpecs)
	logRoot := strategy
	if wrapped {
		logRoot = payload
	}
	data.Records = append(data.Records, readRecords(logRoot, formulaLogSpecs)...)

	data.Unshown = formulaUnshown(payload)
	data.Gaps = checkFormulaGaps(payload)
	return ui.StrategyFormulaContent(data)
}

// formulaRoot returns the strategy block of a payload.
func formulaRoot(payload map[string]any) (strategy map[string]any, wrapped bool) {
	return rootOf(payload, "strategy")
}

// formulaUnshown returns the stored content the page has no dedicated view for.
func formulaUnshown(payload map[string]any) map[string]any {
	return unshownInRoot(payload, "strategy", formulaShownPaths, formulaLogPaths)
}

// applyFormulaPositioning populates positioning fields from the strategy payload.
func applyFormulaPositioning(data *ui.StrategyFormulaData, strategy map[string]any) {
	pos := tolMap(strategy, "positioning")
	if pos == nil {
		return
	}
	data.CategoryPosition = tolStr(pos, "category_position")
	data.Category = tolStr(pos, "category")
	data.PositioningStmt = tolStr(pos, "positioning_statement")
	data.TargetCustomer = tolStr(pos, "target_customer_profile")
	data.UniqueValue = tolStr(pos, "unique_value_proposition")
	data.Taglines = tolStrs(pos, "tagline_candidates")
}

// applyFormulaCompetitiveMoat populates moat-related fields (differentiation,
// barriers, advantages, competitor comparisons).
func applyFormulaCompetitiveMoat(data *ui.StrategyFormulaData, strategy map[string]any) {
	moat := tolMap(strategy, "competitive_moat")
	if moat == nil {
		return
	}
	data.Differentiation = tolStr(moat, "differentiation")
	data.BarriersToEntry = tolStrs(moat, "barriers_to_entry")

	for _, am := range tolItems(moat["advantages"], "name") {
		a := ui.FormulaAdvantage{
			Name:          tolStr(am, "name"),
			Description:   tolStr(am, "description"),
			Evidence:      tolStr(am, "evidence"),
			Defensibility: tolStr(am, "defensibility"),
		}
		if a != (ui.FormulaAdvantage{}) {
			data.Advantages = append(data.Advantages, a)
		}
	}
	for _, vm := range tolItems(moat["vs_competitors"], "competitor") {
		c := ui.FormulaCompetitor{
			Competitor:    tolStr(vm, "competitor"),
			TheirStrength: tolStr(vm, "their_strength"),
			OurAngle:      tolStr(vm, "our_angle"),
			Wedge:         tolStr(vm, "wedge"),
			Category:      tolStr(vm, "category"),
		}
		if c != (ui.FormulaCompetitor{}) {
			data.VsCompetitors = append(data.VsCompetitors, c)
		}
	}
}

// applyFormulaBusinessModel populates revenue model, pricing and unit economics.
// Growth engines are record cards (formulaRecordSpecs).
func applyFormulaBusinessModel(data *ui.StrategyFormulaData, strategy map[string]any) {
	bm := tolMap(strategy, "business_model")
	if bm == nil {
		return
	}
	data.RevenueModel = tolStr(bm, "revenue_model")
	data.PricingStrategy = tolStr(bm, "pricing_strategy")
	data.PricingPhilosophy = tolStr(bm, "pricing_philosophy")

	for _, tm := range tolItems(bm["pricing_tiers"], "tier") {
		t := ui.FormulaTier{
			Tier:     tolStr(tm, "tier"),
			Price:    tolStr(tm, "price"),
			Target:   tolStr(tm, "target"),
			Purpose:  tolStr(tm, "purpose"),
			Limits:   tolStr(tm, "limits"),
			Features: tolStrs(tm, "features"),
		}
		if t.Tier != "" || t.Price != "" || t.Target != "" || t.Purpose != "" || t.Limits != "" || len(t.Features) > 0 {
			data.PricingTiers = append(data.PricingTiers, t)
		}
	}
	switch ue := bm["unit_economics"].(type) {
	case map[string]any:
		for k, v := range ue {
			if text := tolText(v); text != "" {
				if data.UnitEconomics == nil {
					data.UnitEconomics = make(map[string]string)
				}
				data.UnitEconomics[k] = text
			}
		}
	default:
		data.UnitEconomicsText = tolText(ue)
	}
}

// applyFormulaValueCreation populates the user journey and value drivers. Key
// capabilities are record cards (formulaRecordSpecs).
func applyFormulaValueCreation(data *ui.StrategyFormulaData, strategy map[string]any) {
	vc := tolMap(strategy, "value_creation")
	if vc == nil {
		return
	}
	if text, ok := vc["user_journey"].(string); ok {
		data.JourneyText = tolText(text)
	}
	for _, jm := range tolItems(vc["user_journey"], "step") {
		j := ui.FormulaJourneyStep{
			Step:        tolStr(jm, "step"),
			Description: tolStr(jm, "description"),
			Action:      tolStr(jm, "action"),
			Value:       tolStr(jm, "value"),
			Delight:     tolStr(jm, "delight"),
		}
		if j != (ui.FormulaJourneyStep{}) {
			data.UserJourney = append(data.UserJourney, j)
		}
	}
	for _, dm := range tolItems(vc["value_drivers"], "driver") {
		d := ui.FormulaValueDriver{
			Driver:    tolStr(dm, "driver"),
			Mechanism: tolStr(dm, "mechanism"),
			Flywheel:  tolStr(dm, "flywheel"),
		}
		if d != (ui.FormulaValueDriver{}) {
			data.ValueDrivers = append(data.ValueDrivers, d)
		}
	}
}

// extractFormulaRisks maps the risks array into FormulaRisk view models.
func extractFormulaRisks(strategy map[string]any) []ui.FormulaRisk {
	var out []ui.FormulaRisk
	for _, rm := range tolItems(strategy["risks"], "risk") {
		r := ui.FormulaRisk{
			Risk:       tolStr(rm, "risk"),
			Impact:     tolStr(rm, "impact"),
			Likelihood: tolStr(rm, "likelihood"),
			Mitigation: tolStr(rm, "mitigation"),
			Monitoring: tolStr(rm, "monitoring"),
		}
		if r != (ui.FormulaRisk{}) {
			out = append(out, r)
		}
	}
	return out
}

// extractFormulaTradeOffs maps the trade_offs array into FormulaTradeOff view models.
func extractFormulaTradeOffs(strategy map[string]any) []ui.FormulaTradeOff {
	var out []ui.FormulaTradeOff
	for _, tm := range tolItems(strategy["trade_offs"], "decision") {
		t := ui.FormulaTradeOff{
			Decision:     tolStr(tm, "decision"),
			Over:         tolStr(tm, "over"),
			Rationale:    tolStr(tm, "rationale"),
			WhatWeGain:   tolStr(tm, "what_we_gain"),
			WhatWeGiveUp: tolStr(tm, "what_we_give_up"),
		}
		if t != (ui.FormulaTradeOff{}) {
			out = append(out, t)
		}
	}
	return out
}

// applyFormulaSuccessMetrics populates the north star metric and the supporting
// metrics. Leading and lagging indicators are record cards (formulaRecordSpecs).
func applyFormulaSuccessMetrics(data *ui.StrategyFormulaData, strategy map[string]any) {
	sm := tolMap(strategy, "success_metrics")
	if sm == nil {
		return
	}
	data.NorthStarMetric = tolStr(sm, "north_star_metric")
	for _, mm := range tolItems(sm["supporting_metrics"], "metric") {
		m := ui.FormulaMetric{
			Metric: tolStr(mm, "metric"),
			Target: tolStr(mm, "target_phase_1"),
			Why:    tolStr(mm, "why"),
		}
		if m != (ui.FormulaMetric{}) {
			data.SupportingMetrics = append(data.SupportingMetrics, m)
		}
	}
}

// applyFormulaEcosystem populates ecosystem summary, components and synergies.
// Expansion vectors are record cards (formulaRecordSpecs).
func applyFormulaEcosystem(data *ui.StrategyFormulaData, strategy map[string]any) {
	eco := tolMap(strategy, "ecosystem_differentiation")
	if eco == nil {
		return
	}
	data.EcosystemSummary = tolStr(eco, "summary")
	data.VsPointSolutions = tolStr(eco, "vs_point_solutions")
	for _, cm := range tolItems(eco["ecosystem_components"], "component") {
		c := ui.FormulaEcoComponent{
			Component:       tolStr(cm, "component"),
			Metaphor:        tolStr(cm, "metaphor"),
			Role:            tolStr(cm, "role"),
			StandaloneValue: tolStr(cm, "standalone_value"),
			EcosystemValue:  tolStr(cm, "ecosystem_value"),
		}
		if c != (ui.FormulaEcoComponent{}) {
			data.EcosystemComponents = append(data.EcosystemComponents, c)
		}
	}
	for _, sm := range tolItems(eco["ecosystem_synergies"], "synergy") {
		syn := ui.FormulaSynergy{
			Synergy:    tolStr(sm, "synergy"),
			How:        tolStr(sm, "how"),
			UniqueToUs: tolStr(sm, "unique_to_us"),
		}
		if syn != (ui.FormulaSynergy{}) {
			data.EcosystemSynergies = append(data.EcosystemSynergies, syn)
		}
	}
}

// ── record sections ──

// formulaRecordSpecs are the sections of the strategy block whose entries share
// one card. Paths are relative to the strategy block.
var formulaRecordSpecs = []recordSpec{
	{kind: ui.FormulaKindPositioningSummary, path: []string{"competitive_moat", "competitive_positioning_summary"}, single: true,
		facts: []recordField{{"category_definition", "Category definition"}, {"unique_combination", "Unique combination"}}},
	{kind: ui.FormulaKindPositioningOptions, path: []string{"competitive_moat", "competitive_positioning_summary", "positioning_options"}, head: "frame",
		facts: []recordField{{"description", "Description"}, {"audience", "Audience"}}},
	{kind: ui.FormulaKindCapabilities, path: []string{"value_creation", "key_capabilities"}, head: "capability",
		facts: []recordField{{"description", "Description"}, {"status", "Status"}, {"why_critical", "Why critical"}, {"current_state", "Current state"}}},
	{kind: ui.FormulaKindGrowthEngines, path: []string{"business_model", "growth_engines"}, head: "engine",
		facts: []recordField{{"mechanism", "Mechanism"}, {"timeline", "Timeline"}, {"investment", "Investment"}}},
	{kind: ui.FormulaKindConstraints, path: []string{"constraints"}, head: "constraint",
		facts: []recordField{{"impact", "Impact"}, {"response", "Response"}, {"strategy", "Strategy"}, {"implication", "Implication"}}},
	{kind: ui.FormulaKindLeadingIndicators, path: []string{"success_metrics", "leading_indicators"}, head: "metric",
		facts: []recordField{{"target", "Target"}, {"rationale", "Rationale"}}},
	{kind: ui.FormulaKindLaggingIndicators, path: []string{"success_metrics", "lagging_indicators"}, head: "metric",
		facts: []recordField{{"target", "Target"}, {"rationale", "Rationale"}}},
	{kind: ui.FormulaKindExpansionVectors, path: []string{"ecosystem_differentiation", "ecosystem_expansion_vectors"}, head: "vector",
		facts: []recordField{{"description", "Description"}, {"value_add", "Value added"}}},
}

// formulaLogSpecs is the change log. It sits beside the strategy block in a
// wrapped payload, and inside it in an unwrapped one.
var formulaLogSpecs = []recordSpec{
	{kind: ui.FormulaKindChangeLog, path: []string{"change_log"}, head: "date",
		facts: []recordField{{"changed_by", "Changed by"}, {"reason", "Reason"}},
		lists: []recordField{{"sections_updated", "Sections updated"}, {"consistency_validated", "Consistency validated"}}},
}

// ── shown paths ──

// formulaShownPaths lists every path of the strategy block that the page renders.
// See unshownContent for the syntax. Anything not listed reaches the page through
// the generic fallback, so this list must hold only what the readers really show:
// TestStrategyFormulaViewShowsEveryFieldOfTheSchema renders a payload built from
// the embedded schema and checks that each field is on the page.
var formulaShownPaths = buildFormulaShownPaths()

// formulaLogPaths are the paths of the change log.
var formulaLogPaths = recordPaths(formulaLogSpecs)

func buildFormulaShownPaths() []string {
	var paths []string
	add := func(p ...string) { paths = append(paths, p...) }

	add("id", "opportunity_id", "informed_by_foundations", "aligns_with_north_star", "title", "last_updated",
		"status", "confidence_level", "confidence_rationale", "next_validation_needed")
	add("positioning.unique_value_proposition", "positioning.target_customer_profile", "positioning.category",
		"positioning.category_position", "positioning.positioning_statement", "positioning.tagline_candidates")
	add("competitive_moat.differentiation", "competitive_moat.barriers_to_entry")
	add(entryPaths("competitive_moat.advantages", "name", "description", "evidence", "defensibility")...)
	add(entryPaths("competitive_moat.vs_competitors", "competitor", "their_strength", "our_angle", "wedge", "category")...)
	add("value_creation.user_journey")
	add(entryPaths("value_creation.user_journey", "step", "description", "action", "value", "delight")...)
	add(entryPaths("value_creation.value_drivers", "driver", "mechanism", "flywheel")...)
	add("business_model.revenue_model", "business_model.pricing_strategy", "business_model.pricing_philosophy")
	add(entryPaths("business_model.pricing_tiers", "tier", "price", "target", "purpose", "limits", "features")...)
	add("business_model.unit_economics", "business_model.unit_economics.*")
	add(entryPaths("risks", "risk", "impact", "likelihood", "mitigation", "monitoring")...)
	add(entryPaths("trade_offs", "decision", "over", "rationale", "what_we_gain", "what_we_give_up")...)
	add("success_metrics.north_star_metric")
	add(entryPaths("success_metrics.supporting_metrics", "metric", "target_phase_1", "why")...)
	add("ecosystem_differentiation.summary", "ecosystem_differentiation.vs_point_solutions")
	add(entryPaths("ecosystem_differentiation.ecosystem_components", "component", "metaphor", "role", "standalone_value", "ecosystem_value")...)
	add(entryPaths("ecosystem_differentiation.ecosystem_synergies", "synergy", "how", "unique_to_us")...)
	add(recordPaths(formulaRecordSpecs)...)
	return paths
}

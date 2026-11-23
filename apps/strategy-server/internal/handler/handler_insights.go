package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// insightAnalysesContent extracts rich data from an insight_analyses payload
// and returns a bespoke InsightAnalysesContent component.
//
// The page never drops stored content. Whatever the readers below do not show,
// as listed in insightShownPaths, is handed to the generic renderer under a
// notice (data.Unshown). That covers a layout the schema allows but this page
// does not know, such as an older instance's swot_analysis, and any property a
// later canonical release adds.
func (s *Server) insightAnalysesContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.InsightAnalysesData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		LastUpdated: tolStr(payload, "last_updated"),
		NextReview:  tolStr(payload, "next_review_date"),
		Confidence:  tolStr(payload, "confidence_level"),
		Trends:      make(map[string][]ui.InsightTrend),
	}

	extractInsightTrends(&data, payload)
	data.Personas = extractInsightPersonas(payload)
	applyInsightSWOT(&data, payload)
	applyInsightCompetitiveLandscape(&data, payload)
	data.KeyInsights = extractInsightKeyInsights(payload)
	data.WhiteSpaces = extractInsightWhiteSpaces(payload)
	applyInsightMarketDefinition(&data, payload)
	data.MarketSegments = extractInsightMarketSegments(payload)
	data.OpportunityConvergence = extractInsightConvergence(payload)
	data.Records = readRecords(payload, insightRecordSpecs)

	data.Unshown = unshownContent(payload, insightShownPaths)
	data.Gaps = checkInsightGaps(payload)
	return ui.InsightAnalysesContent(data)
}

// ── dedicated sections ──

// extractInsightTrends populates the category-grouped trends map.
func extractInsightTrends(data *ui.InsightAnalysesData, payload map[string]any) {
	trends := tolMap(payload, "trends")
	for cat, arr := range trends {
		for _, tm := range tolItems(arr, "trend") {
			t := ui.InsightTrend{
				Trend:     tolStr(tm, "trend"),
				Impact:    tolStr(tm, "impact"),
				Timeframe: tolStr(tm, "timeframe"),
				Evidence:  tolStrs(tm, "evidence"),

				ImplicationsForUs: tolStr(tm, "implications_for_us"),
			}
			if t.Trend == "" && t.Impact == "" && t.Timeframe == "" && t.ImplicationsForUs == "" && len(t.Evidence) == 0 {
				continue
			}
			data.Trends[cat] = append(data.Trends[cat], t)
		}
	}
}

// extractInsightPersonas maps the target_users array into InsightPersona view models.
func extractInsightPersonas(payload map[string]any) []ui.InsightPersona {
	var out []ui.InsightPersona
	for _, um := range tolItems(payload["target_users"], "persona") {
		persona := ui.InsightPersona{
			Name:        tolStr(um, "persona"),
			Description: tolStr(um, "description"),
		}
		if cs := tolMap(um, "current_state"); cs != nil {
			persona.Context = tolStr(cs, "context")
			persona.Frequency = tolStr(cs, "frequency")
			persona.Goals = tolStrs(cs, "goals")
		}
		for _, pm := range tolItems(um["problems"], "problem") {
			p := ui.InsightProblem{
				Problem:            tolStr(pm, "problem"),
				Severity:           tolStr(pm, "severity"),
				Frequency:          tolStr(pm, "frequency"),
				CurrentSolution:    tolStr(pm, "current_solution"),
				CostOfProblem:      tolStr(pm, "cost_of_problem"),
				WillingnessToSolve: tolStr(pm, "willingness_to_solve"),
				Workarounds:        tolStrs(pm, "workarounds"),
				Evidence:           tolStrs(pm, "evidence"),
			}
			if p.Problem == "" && p.Frequency == "" && p.CurrentSolution == "" && p.CostOfProblem == "" &&
				p.WillingnessToSolve == "" && len(p.Workarounds) == 0 && len(p.Evidence) == 0 {
				continue
			}
			persona.Problems = append(persona.Problems, p)
		}
		for _, jm := range tolItems(um["jobs_to_be_done"], "job") {
			j := ui.InsightJob{
				Job:            tolStr(jm, "job"),
				When:           tolStr(jm, "when"),
				DesiredOutcome: tolStr(jm, "desired_outcome"),
				Satisfaction:   tolStr(jm, "current_solution_satisfaction"),
			}
			if j.Job == "" && j.When == "" && j.DesiredOutcome == "" && j.Satisfaction == "" {
				continue
			}
			persona.Jobs = append(persona.Jobs, j)
		}
		if persona.Name == "" && persona.Description == "" && persona.Context == "" && persona.Frequency == "" &&
			len(persona.Goals) == 0 && len(persona.Problems) == 0 && len(persona.Jobs) == 0 {
			continue
		}
		out = append(out, persona)
	}
	return out
}

// applyInsightSWOT populates strengths, weaknesses, opportunities, and threats.
func applyInsightSWOT(data *ui.InsightAnalysesData, payload map[string]any) {
	for _, sm := range tolItems(payload["strengths"], "strength") {
		v := ui.InsightStrength{
			Strength:       tolStr(sm, "strength"),
			StrategicValue: tolStr(sm, "strategic_value"),
			Evidence:       tolStrs(sm, "evidence"),
		}
		if v.Strength != "" || v.StrategicValue != "" || len(v.Evidence) > 0 {
			data.Strengths = append(data.Strengths, v)
		}
	}
	for _, wm := range tolItems(payload["weaknesses"], "weakness") {
		v := ui.InsightWeakness{
			Weakness:   tolStr(wm, "weakness"),
			Impact:     tolStr(wm, "impact"),
			Mitigation: tolStr(wm, "mitigation"),
		}
		if v.Weakness != "" || v.Impact != "" || v.Mitigation != "" {
			data.Weaknesses = append(data.Weaknesses, v)
		}
	}
	for _, om := range tolItems(payload["opportunities"], "opportunity") {
		v := ui.InsightOpportunity{
			Opportunity:  tolStr(om, "opportunity"),
			Priority:     tolStr(om, "priority"),
			HowToExploit: tolStr(om, "how_to_exploit"),
		}
		if v.Opportunity != "" || v.Priority != "" || v.HowToExploit != "" {
			data.Opportunities = append(data.Opportunities, v)
		}
	}
	for _, tm := range tolItems(payload["threats"], "threat") {
		v := ui.InsightThreat{
			Threat:     tolStr(tm, "threat"),
			Likelihood: tolStr(tm, "likelihood"),
			Mitigation: tolStr(tm, "mitigation"),
		}
		if v.Threat != "" || v.Likelihood != "" || v.Mitigation != "" {
			data.Threats = append(data.Threats, v)
		}
	}
}

// applyInsightCompetitiveLandscape populates direct/indirect competitors and strategy tools.
func applyInsightCompetitiveLandscape(data *ui.InsightAnalysesData, payload map[string]any) {
	cl := tolMap(payload, "competitive_landscape")
	if cl == nil {
		return
	}
	data.DirectCompetitors = extractCompetitors(cl, "direct_competitors")
	data.StrategyTools = extractCompetitors(cl, "strategy_tools")

	for _, im := range tolItems(cl["indirect_competitors"], "name") {
		v := ui.InsightIndirect{
			Name:         tolStr(im, "name"),
			ThreatLevel:  tolStr(im, "threat_level"),
			HowTheySolve: tolStr(im, "how_they_solve"),
		}
		if v.Name != "" || v.ThreatLevel != "" || v.HowTheySolve != "" {
			data.IndirectCompetitors = append(data.IndirectCompetitors, v)
		}
	}
}

// extractInsightKeyInsights maps the key_insights array into InsightKey view models.
func extractInsightKeyInsights(payload map[string]any) []ui.InsightKey {
	var out []ui.InsightKey
	for _, im := range tolItems(payload["key_insights"], "insight") {
		v := ui.InsightKey{
			Insight:              tolStr(im, "insight"),
			StrategicImplication: tolStr(im, "strategic_implication"),
			SupportingTrends:     tolStrs(im, "supporting_trends"),
		}
		if v.Insight != "" || v.StrategicImplication != "" || len(v.SupportingTrends) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// extractInsightWhiteSpaces maps the white_spaces array into InsightWhiteSpace view models.
func extractInsightWhiteSpaces(payload map[string]any) []ui.InsightWhiteSpace {
	var out []ui.InsightWhiteSpace
	for _, wm := range tolItems(payload["white_spaces"], "gap") {
		v := ui.InsightWhiteSpace{
			Gap:                  tolStr(wm, "gap"),
			OpportunityPotential: tolStr(wm, "opportunity_potential"),
			Evidence:             tolStrs(wm, "evidence"),
		}
		if v.Gap != "" || v.OpportunityPotential != "" || len(v.Evidence) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// applyInsightMarketDefinition populates market growth/stage and the TAM, SAM
// and SOM sizes with their method, definition and timeframe. A size stored as a
// plain string (the canonical template does) is read as the size.
func applyInsightMarketDefinition(data *ui.InsightAnalysesData, payload map[string]any) {
	md := tolMap(payload, "market_definition")
	if md == nil {
		return
	}
	data.MarketDefinition.GrowthRate = tolStr(md, "growth_rate")
	data.MarketDefinition.MarketStage = tolStr(md, "market_stage")
	size := func(key, detailKey string) (string, string) {
		if m := tolMap(md, key); m != nil {
			return tolStr(m, "size"), tolStr(m, detailKey)
		}
		return tolStr(md, key), ""
	}
	data.MarketDefinition.TAM, data.MarketDefinition.TAMMethod = size("tam", "calculation_method")
	data.MarketDefinition.SAM, data.MarketDefinition.SAMDefinition = size("sam", "definition")
	data.MarketDefinition.SOM, data.MarketDefinition.SOMTimeframe = size("som", "timeframe")
}

// extractInsightMarketSegments maps market_structure.segments into InsightSegment view models.
func extractInsightMarketSegments(payload map[string]any) []ui.InsightSegment {
	var out []ui.InsightSegment
	for _, sm := range tolItems(tolDig(payload, "market_structure", "segments"), "segment") {
		v := ui.InsightSegment{
			Segment:         tolStr(sm, "segment"),
			Size:            tolStr(sm, "size"),
			Characteristics: tolStrs(sm, "characteristics"),
			UnmetNeeds:      tolStrs(sm, "unmet_needs"),
		}
		if v.Segment != "" || v.Size != "" || len(v.Characteristics) > 0 || len(v.UnmetNeeds) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// extractInsightConvergence maps the opportunity_convergence array into InsightConvergence view models.
func extractInsightConvergence(payload map[string]any) []ui.InsightConvergence {
	var out []ui.InsightConvergence
	for _, om := range tolItems(payload["opportunity_convergence"], "opportunity") {
		v := ui.InsightConvergence{
			Opportunity:        tolStr(om, "opportunity"),
			Strength:           tolStr(om, "strength"),
			SupportingAnalyses: tolStrs(om, "supporting_analyses"),
		}
		if v.Opportunity != "" || v.Strength != "" || len(v.SupportingAnalyses) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// extractCompetitors extracts a competitor list from a competitive_landscape sub-key.
func extractCompetitors(cl map[string]any, key string) []ui.InsightCompetitor {
	var out []ui.InsightCompetitor
	for _, cm := range tolItems(cl[key], "name") {
		v := ui.InsightCompetitor{
			Name:          tolStr(cm, "name"),
			Positioning:   tolStr(cm, "positioning"),
			MarketShare:   tolStr(cm, "market_share"),
			TargetSegment: tolStr(cm, "target_segment"),
			BusinessModel: tolStr(cm, "business_model"),
			Strengths:     tolStrs(cm, "strengths"),
			Weaknesses:    tolStrs(cm, "weaknesses"),
		}
		if v.Name != "" || v.Positioning != "" || v.MarketShare != "" || v.TargetSegment != "" || v.BusinessModel != "" ||
			len(v.Strengths) > 0 || len(v.Weaknesses) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// ── record sections ──

var insightRecordSpecs = []recordSpec{
	{kind: ui.InsightKindMarketDynamics, path: []string{"market_dynamics"}, head: "dynamic",
		facts: []recordField{{"implication", "Implication"}}},
	{kind: ui.InsightKindValueChain, path: []string{"market_structure", "value_chain"}, head: "stage",
		facts: []recordField{{"value_captured", "Value captured"}},
		lists: []recordField{{"key_players", "Key players"}, {"inefficiencies", "Inefficiencies"}}},
	{kind: ui.InsightKindSubstitutes, path: []string{"competitive_landscape", "substitutes"}, head: "substitute",
		facts: []recordField{{"adoption", "Adoption"}}},
	{kind: ui.InsightKindBarriers, path: []string{"competitive_landscape", "barriers_to_entry"}, head: "barrier",
		facts: []recordField{{"height", "Height"}}},
	{kind: ui.InsightKindImplications, path: []string{"strategic_implications"}, head: "insight",
		facts: []recordField{{"action", "Action"}}},
	{kind: ui.InsightKindTensions, path: []string{"strategic_tensions"}, head: "tension",
		facts: []recordField{{"tradeoff", "Tradeoff"}}},
	{kind: ui.InsightKindProblemFit, path: []string{"product_problem_fit_analysis"}, single: true,
		facts: []recordField{{"problem_clarity", "Problem clarity"}, {"problem_severity", "Problem severity"}, {"solution_feasibility", "Solution feasibility"}}},
	{kind: ui.InsightKindValidation, path: []string{"validation_status"}, head: "hypothesis",
		facts: []recordField{{"validation_method", "Method"}, {"status", "Status"}},
		lists: []recordField{{"evidence", "Evidence"}}},
	{kind: ui.InsightKindHypotheses, path: []string{"problem_solution_hypotheses"}, head: "problem",
		facts: []recordField{{"hypothesis", "Hypothesis"}, {"test_approach", "Test approach"}}},
	{kind: ui.InsightKindConfidenceGaps, path: []string{"confidence_gaps"}, head: "gap",
		facts: []recordField{{"why_it_matters", "Why it matters"}, {"how_to_close", "How to close"}}},
	{kind: ui.InsightKindNextSteps, path: []string{"next_analytical_steps"}, head: "step",
		facts: []recordField{{"priority", "Priority"}, {"owner", "Owner"}}},
}

// ── shown paths ──

// insightShownPaths lists every payload path the page above renders. See
// unshownContent for the syntax. Anything not listed reaches the page through the
// generic fallback, so this list must hold only what the readers really show:
// TestInsightAnalysesViewShowsEveryFieldOfTheSchema renders a payload built from
// the embedded schema and checks that each field is on the page.
var insightShownPaths = buildInsightShownPaths()

func buildInsightShownPaths() []string {
	list := entryPaths
	var paths []string
	add := func(p ...string) { paths = append(paths, p...) }

	add("last_updated", "next_review_date", "confidence_level")
	add(list("trends.*", "trend", "impact", "timeframe", "evidence", "implications_for_us")...)
	add(list("target_users", "persona", "description", "current_state.goals", "current_state.context", "current_state.frequency")...)
	add(list("target_users.*.problems", "problem", "severity", "frequency", "current_solution", "workarounds", "cost_of_problem", "willingness_to_solve", "evidence")...)
	add(list("target_users.*.jobs_to_be_done", "job", "when", "desired_outcome", "current_solution_satisfaction")...)
	add(list("strengths", "strength", "strategic_value", "evidence")...)
	add(list("weaknesses", "weakness", "impact", "mitigation")...)
	add(list("opportunities", "opportunity", "priority", "how_to_exploit")...)
	add(list("threats", "threat", "likelihood", "mitigation")...)
	for _, group := range []string{"direct_competitors", "strategy_tools"} {
		add(list("competitive_landscape."+group, "name", "positioning", "market_share", "target_segment", "business_model", "strengths", "weaknesses")...)
	}
	add(list("competitive_landscape.indirect_competitors", "name", "threat_level", "how_they_solve")...)
	add(list("key_insights", "insight", "strategic_implication", "supporting_trends")...)
	add(list("white_spaces", "gap", "opportunity_potential", "evidence")...)
	add("market_definition.growth_rate", "market_definition.market_stage",
		"market_definition.tam", "market_definition.tam.size", "market_definition.tam.calculation_method",
		"market_definition.sam", "market_definition.sam.size", "market_definition.sam.definition",
		"market_definition.som", "market_definition.som.size", "market_definition.som.timeframe")
	add(list("market_structure.segments", "segment", "size", "characteristics", "unmet_needs")...)
	add(list("opportunity_convergence", "opportunity", "strength", "supporting_analyses")...)

	add(recordPaths(insightRecordSpecs)...)
	return paths
}

package handler

import (
	"strconv"
	"strings"

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
		LastUpdated: insightStr(payload, "last_updated"),
		NextReview:  insightStr(payload, "next_review_date"),
		Confidence:  insightStr(payload, "confidence_level"),
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
	data.Records = extractInsightRecords(payload)

	data.Unshown = unshownContent(payload, insightShownPaths)
	data.Gaps = checkInsightGaps(payload)
	return ui.InsightAnalysesContent(data)
}

// ── tolerant readers ──
//
// The schema says what a field should hold, but a payload that disagrees still
// validates. These read a number as its text, a lone string as a one-item list,
// and a plain string where an object is expected, so the page shows them rather
// than a blank card. Anything they cannot read is left to the fallback.

// insightText is the text of a scalar. Blank text is empty.
func insightText(v any) string {
	switch t := v.(type) {
	case string:
		if strings.TrimSpace(t) == "" {
			return ""
		}
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(t)
	}
	return ""
}

func insightStr(m map[string]any, key string) string { return insightText(m[key]) }

// insightStrs reads a list of scalars, or a lone scalar as a list of one.
func insightStrs(m map[string]any, key string) []string {
	switch t := m[key].(type) {
	case []any:
		var out []string
		for _, e := range t {
			if s := insightText(e); s != "" {
				out = append(out, s)
			}
		}
		return out
	case nil:
		return nil
	default:
		if s := insightText(t); s != "" {
			return []string{s}
		}
	}
	return nil
}

// insightItems reads a list of objects. A plain string item stands for an object
// whose textKey is that string. Items of any other type are skipped.
func insightItems(v any, textKey string) []map[string]any {
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	var out []map[string]any
	for _, item := range list {
		switch t := item.(type) {
		case map[string]any:
			out = append(out, t)
		case string:
			if insightText(t) != "" {
				out = append(out, map[string]any{textKey: t})
			}
		}
	}
	return out
}

func insightMap(m map[string]any, key string) map[string]any {
	child, _ := m[key].(map[string]any)
	return child
}

func insightDig(m map[string]any, path ...string) any {
	var cur any = m
	for _, k := range path {
		mm, ok := cur.(map[string]any)
		if !ok {
			return nil
		}
		cur = mm[k]
	}
	return cur
}

// ── dedicated sections ──

// extractInsightTrends populates the category-grouped trends map.
func extractInsightTrends(data *ui.InsightAnalysesData, payload map[string]any) {
	trends := insightMap(payload, "trends")
	for cat, arr := range trends {
		for _, tm := range insightItems(arr, "trend") {
			t := ui.InsightTrend{
				Trend:     insightStr(tm, "trend"),
				Impact:    insightStr(tm, "impact"),
				Timeframe: insightStr(tm, "timeframe"),
				Evidence:  insightStrs(tm, "evidence"),

				ImplicationsForUs: insightStr(tm, "implications_for_us"),
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
	for _, um := range insightItems(payload["target_users"], "persona") {
		persona := ui.InsightPersona{
			Name:        insightStr(um, "persona"),
			Description: insightStr(um, "description"),
		}
		if cs := insightMap(um, "current_state"); cs != nil {
			persona.Context = insightStr(cs, "context")
			persona.Frequency = insightStr(cs, "frequency")
			persona.Goals = insightStrs(cs, "goals")
		}
		for _, pm := range insightItems(um["problems"], "problem") {
			p := ui.InsightProblem{
				Problem:            insightStr(pm, "problem"),
				Severity:           insightStr(pm, "severity"),
				Frequency:          insightStr(pm, "frequency"),
				CurrentSolution:    insightStr(pm, "current_solution"),
				CostOfProblem:      insightStr(pm, "cost_of_problem"),
				WillingnessToSolve: insightStr(pm, "willingness_to_solve"),
				Workarounds:        insightStrs(pm, "workarounds"),
				Evidence:           insightStrs(pm, "evidence"),
			}
			if p.Problem == "" && p.Frequency == "" && p.CurrentSolution == "" && p.CostOfProblem == "" &&
				p.WillingnessToSolve == "" && len(p.Workarounds) == 0 && len(p.Evidence) == 0 {
				continue
			}
			persona.Problems = append(persona.Problems, p)
		}
		for _, jm := range insightItems(um["jobs_to_be_done"], "job") {
			j := ui.InsightJob{
				Job:            insightStr(jm, "job"),
				When:           insightStr(jm, "when"),
				DesiredOutcome: insightStr(jm, "desired_outcome"),
				Satisfaction:   insightStr(jm, "current_solution_satisfaction"),
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
	for _, sm := range insightItems(payload["strengths"], "strength") {
		v := ui.InsightStrength{
			Strength:       insightStr(sm, "strength"),
			StrategicValue: insightStr(sm, "strategic_value"),
			Evidence:       insightStrs(sm, "evidence"),
		}
		if v.Strength != "" || v.StrategicValue != "" || len(v.Evidence) > 0 {
			data.Strengths = append(data.Strengths, v)
		}
	}
	for _, wm := range insightItems(payload["weaknesses"], "weakness") {
		v := ui.InsightWeakness{
			Weakness:   insightStr(wm, "weakness"),
			Impact:     insightStr(wm, "impact"),
			Mitigation: insightStr(wm, "mitigation"),
		}
		if v.Weakness != "" || v.Impact != "" || v.Mitigation != "" {
			data.Weaknesses = append(data.Weaknesses, v)
		}
	}
	for _, om := range insightItems(payload["opportunities"], "opportunity") {
		v := ui.InsightOpportunity{
			Opportunity:  insightStr(om, "opportunity"),
			Priority:     insightStr(om, "priority"),
			HowToExploit: insightStr(om, "how_to_exploit"),
		}
		if v.Opportunity != "" || v.Priority != "" || v.HowToExploit != "" {
			data.Opportunities = append(data.Opportunities, v)
		}
	}
	for _, tm := range insightItems(payload["threats"], "threat") {
		v := ui.InsightThreat{
			Threat:     insightStr(tm, "threat"),
			Likelihood: insightStr(tm, "likelihood"),
			Mitigation: insightStr(tm, "mitigation"),
		}
		if v.Threat != "" || v.Likelihood != "" || v.Mitigation != "" {
			data.Threats = append(data.Threats, v)
		}
	}
}

// applyInsightCompetitiveLandscape populates direct/indirect competitors and strategy tools.
func applyInsightCompetitiveLandscape(data *ui.InsightAnalysesData, payload map[string]any) {
	cl := insightMap(payload, "competitive_landscape")
	if cl == nil {
		return
	}
	data.DirectCompetitors = extractCompetitors(cl, "direct_competitors")
	data.StrategyTools = extractCompetitors(cl, "strategy_tools")

	for _, im := range insightItems(cl["indirect_competitors"], "name") {
		v := ui.InsightIndirect{
			Name:         insightStr(im, "name"),
			ThreatLevel:  insightStr(im, "threat_level"),
			HowTheySolve: insightStr(im, "how_they_solve"),
		}
		if v.Name != "" || v.ThreatLevel != "" || v.HowTheySolve != "" {
			data.IndirectCompetitors = append(data.IndirectCompetitors, v)
		}
	}
}

// extractInsightKeyInsights maps the key_insights array into InsightKey view models.
func extractInsightKeyInsights(payload map[string]any) []ui.InsightKey {
	var out []ui.InsightKey
	for _, im := range insightItems(payload["key_insights"], "insight") {
		v := ui.InsightKey{
			Insight:              insightStr(im, "insight"),
			StrategicImplication: insightStr(im, "strategic_implication"),
			SupportingTrends:     insightStrs(im, "supporting_trends"),
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
	for _, wm := range insightItems(payload["white_spaces"], "gap") {
		v := ui.InsightWhiteSpace{
			Gap:                  insightStr(wm, "gap"),
			OpportunityPotential: insightStr(wm, "opportunity_potential"),
			Evidence:             insightStrs(wm, "evidence"),
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
	md := insightMap(payload, "market_definition")
	if md == nil {
		return
	}
	data.MarketDefinition.GrowthRate = insightStr(md, "growth_rate")
	data.MarketDefinition.MarketStage = insightStr(md, "market_stage")
	size := func(key, detailKey string) (string, string) {
		if m := insightMap(md, key); m != nil {
			return insightStr(m, "size"), insightStr(m, detailKey)
		}
		return insightStr(md, key), ""
	}
	data.MarketDefinition.TAM, data.MarketDefinition.TAMMethod = size("tam", "calculation_method")
	data.MarketDefinition.SAM, data.MarketDefinition.SAMDefinition = size("sam", "definition")
	data.MarketDefinition.SOM, data.MarketDefinition.SOMTimeframe = size("som", "timeframe")
}

// extractInsightMarketSegments maps market_structure.segments into InsightSegment view models.
func extractInsightMarketSegments(payload map[string]any) []ui.InsightSegment {
	var out []ui.InsightSegment
	for _, sm := range insightItems(insightDig(payload, "market_structure", "segments"), "segment") {
		v := ui.InsightSegment{
			Segment:         insightStr(sm, "segment"),
			Size:            insightStr(sm, "size"),
			Characteristics: insightStrs(sm, "characteristics"),
			UnmetNeeds:      insightStrs(sm, "unmet_needs"),
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
	for _, om := range insightItems(payload["opportunity_convergence"], "opportunity") {
		v := ui.InsightConvergence{
			Opportunity:        insightStr(om, "opportunity"),
			Strength:           insightStr(om, "strength"),
			SupportingAnalyses: insightStrs(om, "supporting_analyses"),
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
	for _, cm := range insightItems(cl[key], "name") {
		v := ui.InsightCompetitor{
			Name:          insightStr(cm, "name"),
			Positioning:   insightStr(cm, "positioning"),
			MarketShare:   insightStr(cm, "market_share"),
			TargetSegment: insightStr(cm, "target_segment"),
			BusinessModel: insightStr(cm, "business_model"),
			Strengths:     insightStrs(cm, "strengths"),
			Weaknesses:    insightStrs(cm, "weaknesses"),
		}
		if v.Name != "" || v.Positioning != "" || v.MarketShare != "" || v.TargetSegment != "" || v.BusinessModel != "" ||
			len(v.Strengths) > 0 || len(v.Weaknesses) > 0 {
			out = append(out, v)
		}
	}
	return out
}

// ── record sections ──

// insightField is one labelled value of a record card.
type insightField struct{ key, label string }

// insightRecordSpec describes a section whose entries share one card: a headline
// field, labelled values and labelled lists. The same spec drives reading and the
// list of shown paths, so a field added here is both rendered and accounted for.
type insightRecordSpec struct {
	kind   string
	path   []string
	head   string
	facts  []insightField
	lists  []insightField
	single bool // the path holds one object, not a list of entries
}

var insightRecordSpecs = []insightRecordSpec{
	{kind: ui.InsightKindMarketDynamics, path: []string{"market_dynamics"}, head: "dynamic",
		facts: []insightField{{"implication", "Implication"}}},
	{kind: ui.InsightKindValueChain, path: []string{"market_structure", "value_chain"}, head: "stage",
		facts: []insightField{{"value_captured", "Value captured"}},
		lists: []insightField{{"key_players", "Key players"}, {"inefficiencies", "Inefficiencies"}}},
	{kind: ui.InsightKindSubstitutes, path: []string{"competitive_landscape", "substitutes"}, head: "substitute",
		facts: []insightField{{"adoption", "Adoption"}}},
	{kind: ui.InsightKindBarriers, path: []string{"competitive_landscape", "barriers_to_entry"}, head: "barrier",
		facts: []insightField{{"height", "Height"}}},
	{kind: ui.InsightKindImplications, path: []string{"strategic_implications"}, head: "insight",
		facts: []insightField{{"action", "Action"}}},
	{kind: ui.InsightKindTensions, path: []string{"strategic_tensions"}, head: "tension",
		facts: []insightField{{"tradeoff", "Tradeoff"}}},
	{kind: ui.InsightKindProblemFit, path: []string{"product_problem_fit_analysis"}, single: true,
		facts: []insightField{{"problem_clarity", "Problem clarity"}, {"problem_severity", "Problem severity"}, {"solution_feasibility", "Solution feasibility"}}},
	{kind: ui.InsightKindValidation, path: []string{"validation_status"}, head: "hypothesis",
		facts: []insightField{{"validation_method", "Method"}, {"status", "Status"}},
		lists: []insightField{{"evidence", "Evidence"}}},
	{kind: ui.InsightKindHypotheses, path: []string{"problem_solution_hypotheses"}, head: "problem",
		facts: []insightField{{"hypothesis", "Hypothesis"}, {"test_approach", "Test approach"}}},
	{kind: ui.InsightKindConfidenceGaps, path: []string{"confidence_gaps"}, head: "gap",
		facts: []insightField{{"why_it_matters", "Why it matters"}, {"how_to_close", "How to close"}}},
	{kind: ui.InsightKindNextSteps, path: []string{"next_analytical_steps"}, head: "step",
		facts: []insightField{{"priority", "Priority"}, {"owner", "Owner"}}},
}

func extractInsightRecords(payload map[string]any) []ui.InsightRecordSection {
	var out []ui.InsightRecordSection
	for _, spec := range insightRecordSpecs {
		var entries []map[string]any
		if spec.single {
			if m, ok := insightDig(payload, spec.path...).(map[string]any); ok {
				entries = []map[string]any{m}
			}
		} else {
			entries = insightItems(insightDig(payload, spec.path...), spec.head)
		}
		var records []ui.InsightRecord
		for _, m := range entries {
			rec := ui.InsightRecord{Head: insightStr(m, spec.head)}
			for _, f := range spec.facts {
				if v := insightStr(m, f.key); v != "" {
					rec.Facts = append(rec.Facts, ui.InsightFact{Label: f.label, Value: v})
				}
			}
			for _, f := range spec.lists {
				if items := insightStrs(m, f.key); len(items) > 0 {
					rec.Lists = append(rec.Lists, ui.InsightList{Label: f.label, Items: items})
				}
			}
			if rec.Head != "" || len(rec.Facts) > 0 || len(rec.Lists) > 0 {
				records = append(records, rec)
			}
		}
		if len(records) > 0 {
			out = append(out, ui.InsightRecordSection{Kind: spec.kind, Records: records})
		}
	}
	return out
}

// ── shown paths ──

// insightShownPaths lists every payload path the page above renders. See
// unshownContent for the syntax. Anything not listed reaches the page through the
// generic fallback, so this list must hold only what the readers really show:
// TestInsightAnalysesViewShowsEveryFieldOfTheSchema renders a payload built from
// the embedded schema and checks that each field is on the page.
var insightShownPaths = buildInsightShownPaths()

func buildInsightShownPaths() []string {
	// list names a list of entries: the entries themselves (a plain string
	// entry), and each field of an entry.
	list := func(base string, fields ...string) []string {
		out := []string{base + ".*"}
		for _, f := range fields {
			out = append(out, base+".*."+f)
		}
		return out
	}
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

	for _, spec := range insightRecordSpecs {
		base := strings.Join(spec.path, ".")
		fields := []string{}
		if spec.head != "" {
			fields = append(fields, spec.head)
		}
		for _, f := range spec.facts {
			fields = append(fields, f.key)
		}
		for _, f := range spec.lists {
			fields = append(fields, f.key)
		}
		if spec.single {
			for _, f := range fields {
				add(base + "." + f)
			}
			continue
		}
		add(list(base, fields...)...)
	}
	return paths
}

package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// insightAnalysesContent extracts rich data from an insight_analyses payload
// and returns a bespoke InsightAnalysesContent component.
func (s *Server) insightAnalysesContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.InsightAnalysesData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		LastUpdated: payloadStr(payload, "last_updated"),
		Confidence:  payloadStr(payload, "confidence_level"),
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
	data.StrategicTensions = extractInsightTensions(payload)

	data.Gaps = checkInsightGaps(payload)
	return ui.InsightAnalysesContent(data)
}

// extractInsightTrends populates the category-grouped trends map.
func extractInsightTrends(data *ui.InsightAnalysesData, payload map[string]any) {
	trends, ok := payload["trends"].(map[string]any)
	if !ok {
		return
	}
	for cat, arr := range trends {
		items, ok := arr.([]any)
		if !ok {
			continue
		}
		for _, item := range items {
			tm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Trends[cat] = append(data.Trends[cat], ui.InsightTrend{
				Trend:     payloadStr(tm, "trend"),
				Impact:    payloadStr(tm, "impact"),
				Timeframe: payloadStr(tm, "timeframe"),
				Evidence:  payloadStrSlice(tm, "evidence"),
			})
		}
	}
}

// extractInsightPersonas maps the target_users array into InsightPersona view models.
func extractInsightPersonas(payload map[string]any) []ui.InsightPersona {
	users, ok := payload["target_users"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightPersona
	for _, u := range users {
		um, ok := u.(map[string]any)
		if !ok {
			continue
		}
		persona := ui.InsightPersona{
			Name:        payloadStr(um, "persona"),
			Description: payloadStr(um, "description"),
		}
		if cs, ok := um["current_state"].(map[string]any); ok {
			persona.Context = payloadStr(cs, "context")
			persona.Frequency = payloadStr(cs, "frequency")
			persona.Goals = payloadStrSlice(cs, "goals")
		}
		if problems, ok := um["problems"].([]any); ok {
			for _, p := range problems {
				pm, ok := p.(map[string]any)
				if !ok {
					continue
				}
				persona.Problems = append(persona.Problems, ui.InsightProblem{
					Problem:   payloadStr(pm, "problem"),
					Severity:  payloadStr(pm, "severity"),
					Frequency: payloadStr(pm, "frequency"),
				})
			}
		}
		out = append(out, persona)
	}
	return out
}

// applyInsightSWOT populates strengths, weaknesses, opportunities, and threats.
func applyInsightSWOT(data *ui.InsightAnalysesData, payload map[string]any) {
	if strengths, ok := payload["strengths"].([]any); ok {
		for _, item := range strengths {
			sm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Strengths = append(data.Strengths, ui.InsightStrength{
				Strength:       payloadStr(sm, "strength"),
				StrategicValue: payloadStr(sm, "strategic_value"),
				Evidence:       payloadStrSlice(sm, "evidence"),
			})
		}
	}
	if weaknesses, ok := payload["weaknesses"].([]any); ok {
		for _, item := range weaknesses {
			wm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Weaknesses = append(data.Weaknesses, ui.InsightWeakness{
				Weakness:   payloadStr(wm, "weakness"),
				Impact:     payloadStr(wm, "impact"),
				Mitigation: payloadStr(wm, "mitigation"),
			})
		}
	}
	if opportunities, ok := payload["opportunities"].([]any); ok {
		for _, item := range opportunities {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Opportunities = append(data.Opportunities, ui.InsightOpportunity{
				Opportunity:  payloadStr(om, "opportunity"),
				Priority:     payloadStr(om, "priority"),
				HowToExploit: payloadStr(om, "how_to_exploit"),
			})
		}
	}
	if threats, ok := payload["threats"].([]any); ok {
		for _, item := range threats {
			tm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Threats = append(data.Threats, ui.InsightThreat{
				Threat:     payloadStr(tm, "threat"),
				Likelihood: payloadStr(tm, "likelihood"),
				Mitigation: payloadStr(tm, "mitigation"),
			})
		}
	}
}

// applyInsightCompetitiveLandscape populates direct/indirect competitors and strategy tools.
func applyInsightCompetitiveLandscape(data *ui.InsightAnalysesData, payload map[string]any) {
	cl, ok := payload["competitive_landscape"].(map[string]any)
	if !ok {
		return
	}
	data.DirectCompetitors = extractCompetitors(cl, "direct_competitors")
	data.StrategyTools = extractCompetitors(cl, "strategy_tools")

	if indirect, ok := cl["indirect_competitors"].([]any); ok {
		for _, item := range indirect {
			im, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.IndirectCompetitors = append(data.IndirectCompetitors, ui.InsightIndirect{
				Name:         payloadStr(im, "name"),
				ThreatLevel:  payloadStr(im, "threat_level"),
				HowTheySolve: payloadStr(im, "how_they_solve"),
			})
		}
	}
}

// extractInsightKeyInsights maps the key_insights array into InsightKey view models.
func extractInsightKeyInsights(payload map[string]any) []ui.InsightKey {
	insights, ok := payload["key_insights"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightKey
	for _, item := range insights {
		im, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightKey{
			Insight:              payloadStr(im, "insight"),
			StrategicImplication: payloadStr(im, "strategic_implication"),
			SupportingTrends:     payloadStrSlice(im, "supporting_trends"),
		})
	}
	return out
}

// extractInsightWhiteSpaces maps the white_spaces array into InsightWhiteSpace view models.
func extractInsightWhiteSpaces(payload map[string]any) []ui.InsightWhiteSpace {
	ws, ok := payload["white_spaces"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightWhiteSpace
	for _, item := range ws {
		wm, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightWhiteSpace{
			Gap:                  payloadStr(wm, "gap"),
			OpportunityPotential: payloadStr(wm, "opportunity_potential"),
			Evidence:             payloadStrSlice(wm, "evidence"),
		})
	}
	return out
}

// applyInsightMarketDefinition populates market growth/stage and TAM/SAM/SOM sizes.
func applyInsightMarketDefinition(data *ui.InsightAnalysesData, payload map[string]any) {
	md, ok := payload["market_definition"].(map[string]any)
	if !ok {
		return
	}
	data.MarketDefinition.GrowthRate = payloadStr(md, "growth_rate")
	data.MarketDefinition.MarketStage = payloadStr(md, "market_stage")
	if tam, ok := md["tam"].(map[string]any); ok {
		data.MarketDefinition.TAM = payloadStr(tam, "size")
	}
	if sam, ok := md["sam"].(map[string]any); ok {
		data.MarketDefinition.SAM = payloadStr(sam, "size")
	}
	if som, ok := md["som"].(map[string]any); ok {
		data.MarketDefinition.SOM = payloadStr(som, "size")
	}
}

// extractInsightMarketSegments maps market_structure.segments into InsightSegment view models.
func extractInsightMarketSegments(payload map[string]any) []ui.InsightSegment {
	ms, ok := payload["market_structure"].(map[string]any)
	if !ok {
		return nil
	}
	segments, ok := ms["segments"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightSegment
	for _, item := range segments {
		sm, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightSegment{
			Segment:         payloadStr(sm, "segment"),
			Size:            payloadStr(sm, "size"),
			Characteristics: payloadStrSlice(sm, "characteristics"),
			UnmetNeeds:      payloadStrSlice(sm, "unmet_needs"),
		})
	}
	return out
}

// extractInsightConvergence maps the opportunity_convergence array into InsightConvergence view models.
func extractInsightConvergence(payload map[string]any) []ui.InsightConvergence {
	oc, ok := payload["opportunity_convergence"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightConvergence
	for _, item := range oc {
		om, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightConvergence{
			Opportunity:        payloadStr(om, "opportunity"),
			Strength:           payloadStr(om, "strength"),
			SupportingAnalyses: payloadStrSlice(om, "supporting_analyses"),
		})
	}
	return out
}

// extractInsightTensions maps the strategic_tensions array into InsightTension view models.
func extractInsightTensions(payload map[string]any) []ui.InsightTension {
	st, ok := payload["strategic_tensions"].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightTension
	for _, item := range st {
		tm, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightTension{
			Tension:  payloadStr(tm, "tension"),
			Tradeoff: payloadStr(tm, "tradeoff"),
		})
	}
	return out
}

// extractCompetitors extracts a competitor list from a competitive_landscape sub-key.
func extractCompetitors(cl map[string]any, key string) []ui.InsightCompetitor {
	arr, ok := cl[key].([]any)
	if !ok {
		return nil
	}
	var out []ui.InsightCompetitor
	for _, item := range arr {
		cm, ok := item.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.InsightCompetitor{
			Name:        payloadStr(cm, "name"),
			Positioning: payloadStr(cm, "positioning"),
			Strengths:   payloadStrSlice(cm, "strengths"),
			Weaknesses:  payloadStrSlice(cm, "weaknesses"),
		})
	}
	return out
}

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

	// Trends (grouped by category)
	if trends, ok := payload["trends"].(map[string]any); ok {
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

	// Target users / Personas
	if users, ok := payload["target_users"].([]any); ok {
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
			data.Personas = append(data.Personas, persona)
		}
	}

	// SWOT
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

	// Competitive landscape
	if cl, ok := payload["competitive_landscape"].(map[string]any); ok {
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

	// Key insights
	if insights, ok := payload["key_insights"].([]any); ok {
		for _, item := range insights {
			im, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.KeyInsights = append(data.KeyInsights, ui.InsightKey{
				Insight:              payloadStr(im, "insight"),
				StrategicImplication: payloadStr(im, "strategic_implication"),
				SupportingTrends:     payloadStrSlice(im, "supporting_trends"),
			})
		}
	}

	// White spaces
	if ws, ok := payload["white_spaces"].([]any); ok {
		for _, item := range ws {
			wm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.WhiteSpaces = append(data.WhiteSpaces, ui.InsightWhiteSpace{
				Gap:                 payloadStr(wm, "gap"),
				OpportunityPotential: payloadStr(wm, "opportunity_potential"),
				Evidence:            payloadStrSlice(wm, "evidence"),
			})
		}
	}

	// Market definition
	if md, ok := payload["market_definition"].(map[string]any); ok {
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

	// Market segments
	if ms, ok := payload["market_structure"].(map[string]any); ok {
		if segments, ok := ms["segments"].([]any); ok {
			for _, item := range segments {
				sm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.MarketSegments = append(data.MarketSegments, ui.InsightSegment{
					Segment:         payloadStr(sm, "segment"),
					Size:            payloadStr(sm, "size"),
					Characteristics: payloadStrSlice(sm, "characteristics"),
					UnmetNeeds:      payloadStrSlice(sm, "unmet_needs"),
				})
			}
		}
	}

	// Opportunity convergence
	if oc, ok := payload["opportunity_convergence"].([]any); ok {
		for _, item := range oc {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.OpportunityConvergence = append(data.OpportunityConvergence, ui.InsightConvergence{
				Opportunity:        payloadStr(om, "opportunity"),
				Strength:           payloadStr(om, "strength"),
				SupportingAnalyses: payloadStrSlice(om, "supporting_analyses"),
			})
		}
	}

	// Strategic tensions
	if st, ok := payload["strategic_tensions"].([]any); ok {
		for _, item := range st {
			tm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.StrategicTensions = append(data.StrategicTensions, ui.InsightTension{
				Tension:  payloadStr(tm, "tension"),
				Tradeoff: payloadStr(tm, "tradeoff"),
			})
		}
	}

	return ui.InsightAnalysesContent(data)
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
			Name:       payloadStr(cm, "name"),
			Positioning: payloadStr(cm, "positioning"),
			Strengths:  payloadStrSlice(cm, "strengths"),
			Weaknesses: payloadStrSlice(cm, "weaknesses"),
		})
	}
	return out
}

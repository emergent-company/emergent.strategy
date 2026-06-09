package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// strategyFormulaContent extracts rich data from a strategy_formula payload
// and returns a bespoke StrategyFormulaContent component.
func (s *Server) strategyFormulaContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	strategy, ok := payload["strategy"].(map[string]any)
	if !ok {
		// Some payloads wrap in "strategy", others don't.
		strategy = payload
	}

	data := ui.StrategyFormulaData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		Title:       payloadStr(strategy, "title"),
		LastUpdated: payloadStr(strategy, "last_updated"),
		Confidence:  payloadStr(strategy, "confidence_level"),
	}
	if data.Title == "" {
		data.Title = name
	}

	applyFormulaPositioning(&data, strategy)
	applyFormulaCompetitiveMoat(&data, strategy)
	applyFormulaBusinessModel(&data, strategy)
	applyFormulaValueCreation(&data, strategy)
	data.Risks = extractFormulaRisks(strategy)
	data.TradeOffs = extractFormulaTradeOffs(strategy)
	data.Constraints = extractFormulaConstraints(strategy)
	applyFormulaSuccessMetrics(&data, strategy)
	applyFormulaEcosystem(&data, strategy)

	data.Gaps = checkFormulaGaps(payload)
	return ui.StrategyFormulaContent(data)
}

// applyFormulaPositioning populates positioning fields from the strategy payload.
func applyFormulaPositioning(data *ui.StrategyFormulaData, strategy map[string]any) {
	pos, ok := strategy["positioning"].(map[string]any)
	if !ok {
		return
	}
	data.CategoryPosition = payloadStr(pos, "category_position")
	data.PositioningStmt = payloadStr(pos, "positioning_statement")
	data.TargetCustomer = payloadStr(pos, "target_customer_profile")
	data.UniqueValue = payloadStr(pos, "unique_value_proposition")
	data.Taglines = payloadStrSlice(pos, "tagline_candidates")
}

// applyFormulaCompetitiveMoat populates moat-related fields (differentiation,
// barriers, advantages, competitor comparisons).
func applyFormulaCompetitiveMoat(data *ui.StrategyFormulaData, strategy map[string]any) {
	moat, ok := strategy["competitive_moat"].(map[string]any)
	if !ok {
		return
	}
	data.Differentiation = payloadStr(moat, "differentiation")
	data.BarriersToEntry = payloadStrSlice(moat, "barriers_to_entry")

	if advantages, ok := moat["advantages"].([]any); ok {
		for _, a := range advantages {
			am, ok := a.(map[string]any)
			if !ok {
				continue
			}
			data.Advantages = append(data.Advantages, ui.FormulaAdvantage{
				Name:          payloadStr(am, "name"),
				Description:   payloadStr(am, "description"),
				Evidence:      payloadStr(am, "evidence"),
				Defensibility: payloadStr(am, "defensibility"),
			})
		}
	}
	if vs, ok := moat["vs_competitors"].([]any); ok {
		for _, v := range vs {
			vm, ok := v.(map[string]any)
			if !ok {
				continue
			}
			data.VsCompetitors = append(data.VsCompetitors, ui.FormulaCompetitor{
				Competitor:    payloadStr(vm, "competitor"),
				TheirStrength: payloadStr(vm, "their_strength"),
				OurAngle:      payloadStr(vm, "our_angle"),
				Wedge:         payloadStr(vm, "wedge"),
			})
		}
	}
}

// applyFormulaBusinessModel populates revenue model, pricing tiers, growth
// engines, and unit economics.
func applyFormulaBusinessModel(data *ui.StrategyFormulaData, strategy map[string]any) {
	bm, ok := strategy["business_model"].(map[string]any)
	if !ok {
		return
	}
	data.RevenueModel = payloadStr(bm, "revenue_model")
	data.PricingPhilosophy = payloadStr(bm, "pricing_philosophy")

	if tiers, ok := bm["pricing_tiers"].([]any); ok {
		for _, t := range tiers {
			tm, ok := t.(map[string]any)
			if !ok {
				continue
			}
			data.PricingTiers = append(data.PricingTiers, ui.FormulaTier{
				Tier:    payloadStr(tm, "tier"),
				Price:   payloadStr(tm, "price"),
				Purpose: payloadStr(tm, "purpose"),
				Limits:  payloadStr(tm, "limits"),
			})
		}
	}
	if engines, ok := bm["growth_engines"].([]any); ok {
		for _, e := range engines {
			em, ok := e.(map[string]any)
			if !ok {
				continue
			}
			data.GrowthEngines = append(data.GrowthEngines, ui.FormulaEngine{
				Engine:     payloadStr(em, "engine"),
				Mechanism:  payloadStr(em, "mechanism"),
				Investment: payloadStr(em, "investment"),
			})
		}
	}
	if ue, ok := bm["unit_economics_targets"].(map[string]any); ok {
		data.UnitEconomics = make(map[string]string)
		for k, v := range ue {
			if s, ok := v.(string); ok {
				data.UnitEconomics[k] = s
			}
		}
	}
}

// applyFormulaValueCreation populates user journey, value drivers, and key
// capabilities from the value_creation block.
func applyFormulaValueCreation(data *ui.StrategyFormulaData, strategy map[string]any) {
	vc, ok := strategy["value_creation"].(map[string]any)
	if !ok {
		return
	}
	if journey, ok := vc["user_journey"].([]any); ok {
		for _, j := range journey {
			jm, ok := j.(map[string]any)
			if !ok {
				continue
			}
			data.UserJourney = append(data.UserJourney, ui.FormulaJourneyStep{
				Step:    payloadStr(jm, "step"),
				Action:  payloadStr(jm, "action"),
				Value:   payloadStr(jm, "value"),
				Delight: payloadStr(jm, "delight"),
			})
		}
	}
	if drivers, ok := vc["value_drivers"].([]any); ok {
		for _, d := range drivers {
			dm, ok := d.(map[string]any)
			if !ok {
				continue
			}
			data.ValueDrivers = append(data.ValueDrivers, ui.FormulaValueDriver{
				Driver:    payloadStr(dm, "driver"),
				Mechanism: payloadStr(dm, "mechanism"),
				Flywheel:  payloadStr(dm, "flywheel"),
			})
		}
	}
	if caps, ok := vc["key_capabilities"].([]any); ok {
		for _, c := range caps {
			cm, ok := c.(map[string]any)
			if !ok {
				continue
			}
			data.KeyCapabilities = append(data.KeyCapabilities, ui.FormulaCapability{
				Capability:   payloadStr(cm, "capability"),
				WhyCritical:  payloadStr(cm, "why_critical"),
				CurrentState: payloadStr(cm, "current_state"),
			})
		}
	}
}

// extractFormulaRisks maps the risks array into FormulaRisk view models.
func extractFormulaRisks(strategy map[string]any) []ui.FormulaRisk {
	risks, ok := strategy["risks"].([]any)
	if !ok {
		return nil
	}
	var out []ui.FormulaRisk
	for _, r := range risks {
		rm, ok := r.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.FormulaRisk{
			Risk:       payloadStr(rm, "risk"),
			Impact:     payloadStr(rm, "impact"),
			Likelihood: payloadStr(rm, "likelihood"),
			Mitigation: payloadStr(rm, "mitigation"),
			Monitoring: payloadStr(rm, "monitoring"),
		})
	}
	return out
}

// extractFormulaTradeOffs maps the trade_offs array into FormulaTradeOff view models.
func extractFormulaTradeOffs(strategy map[string]any) []ui.FormulaTradeOff {
	tradeoffs, ok := strategy["trade_offs"].([]any)
	if !ok {
		return nil
	}
	var out []ui.FormulaTradeOff
	for _, t := range tradeoffs {
		tm, ok := t.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.FormulaTradeOff{
			Decision:     payloadStr(tm, "decision"),
			Rationale:    payloadStr(tm, "rationale"),
			WhatWeGain:   payloadStr(tm, "what_we_gain"),
			WhatWeGiveUp: payloadStr(tm, "what_we_give_up"),
		})
	}
	return out
}

// extractFormulaConstraints maps the constraints array into FormulaConstraint view models.
func extractFormulaConstraints(strategy map[string]any) []ui.FormulaConstraint {
	constraints, ok := strategy["constraints"].([]any)
	if !ok {
		return nil
	}
	var out []ui.FormulaConstraint
	for _, c := range constraints {
		cm, ok := c.(map[string]any)
		if !ok {
			continue
		}
		out = append(out, ui.FormulaConstraint{
			Constraint:  payloadStr(cm, "constraint"),
			Strategy:    payloadStr(cm, "strategy"),
			Implication: payloadStr(cm, "implication"),
		})
	}
	return out
}

// applyFormulaSuccessMetrics populates the north star metric and supporting metrics.
func applyFormulaSuccessMetrics(data *ui.StrategyFormulaData, strategy map[string]any) {
	sm, ok := strategy["success_metrics"].(map[string]any)
	if !ok {
		return
	}
	data.NorthStarMetric = payloadStr(sm, "north_star_metric")
	if metrics, ok := sm["supporting_metrics"].([]any); ok {
		for _, m := range metrics {
			mm, ok := m.(map[string]any)
			if !ok {
				continue
			}
			data.SupportingMetrics = append(data.SupportingMetrics, ui.FormulaMetric{
				Metric: payloadStr(mm, "metric"),
				Target: payloadStr(mm, "target_phase_1"),
				Why:    payloadStr(mm, "why"),
			})
		}
	}
}

// applyFormulaEcosystem populates ecosystem summary, components, and synergies.
func applyFormulaEcosystem(data *ui.StrategyFormulaData, strategy map[string]any) {
	eco, ok := strategy["ecosystem_differentiation"].(map[string]any)
	if !ok {
		return
	}
	data.EcosystemSummary = payloadStr(eco, "summary")
	if comps, ok := eco["ecosystem_components"].([]any); ok {
		for _, c := range comps {
			cm, ok := c.(map[string]any)
			if !ok {
				continue
			}
			data.EcosystemComponents = append(data.EcosystemComponents, ui.FormulaEcoComponent{
				Component:       payloadStr(cm, "component"),
				Metaphor:        payloadStr(cm, "metaphor"),
				Role:            payloadStr(cm, "role"),
				StandaloneValue: payloadStr(cm, "standalone_value"),
				EcosystemValue:  payloadStr(cm, "ecosystem_value"),
			})
		}
	}
	if syns, ok := eco["ecosystem_synergies"].([]any); ok {
		for _, syn := range syns {
			sm, ok := syn.(map[string]any)
			if !ok {
				continue
			}
			data.EcosystemSynergies = append(data.EcosystemSynergies, ui.FormulaSynergy{
				Synergy:    payloadStr(sm, "synergy"),
				How:        payloadStr(sm, "how"),
				UniqueToUs: payloadStr(sm, "unique_to_us"),
			})
		}
	}
}

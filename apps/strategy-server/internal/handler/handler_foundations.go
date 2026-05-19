package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// strategyFoundationsContent extracts rich data from a strategy_foundations payload
// and returns a bespoke StrategyFoundationsContent component.
func (s *Server) strategyFoundationsContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// The payload may wrap everything under "strategy_foundations".
	root, ok := payload["strategy_foundations"].(map[string]any)
	if !ok {
		root = payload
	}

	data := ui.StrategyFoundationsData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		LastUpdated: payloadStr(root, "last_updated"),
		Confidence:  payloadStr(root, "confidence_level"),
	}

	// ── Product Vision ──
	if pv, ok := root["product_vision"].(map[string]any); ok {
		data.VisionStatement = payloadStr(pv, "statement")
		if data.VisionStatement == "" {
			data.VisionStatement = payloadStr(pv, "vision_statement")
		}
		data.TargetTimeframe = payloadStr(pv, "timeframe")
		if data.TargetTimeframe == "" {
			data.TargetTimeframe = payloadStr(pv, "target_timeframe")
		}

		if indicators, ok := pv["success_indicators"].([]any); ok {
			for _, item := range indicators {
				im, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.SuccessIndicators = append(data.SuccessIndicators, ui.FoundationIndicator{
					Indicator: payloadStr(im, "indicator"),
					Target:    payloadStr(im, "target"),
				})
			}
		}
	}

	// ── Value Proposition ──
	if vp, ok := root["value_proposition"].(map[string]any); ok {
		data.VPHeadline = payloadStr(vp, "headline")
		data.VPTargetSegment = payloadStr(vp, "target_segment")
		data.JobsToBeDone = payloadStrSlice(vp, "jobs_to_be_done")
		data.KeyBenefits = payloadStrSlice(vp, "key_benefits")
		data.PainsWeEliminate = payloadStrSlice(vp, "pains_we_eliminate")
		data.FeelingsWeCreate = payloadStrSlice(vp, "feelings_we_create")

		if proofs, ok := vp["proof_points"].([]any); ok {
			for _, item := range proofs {
				pm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.ProofPoints = append(data.ProofPoints, ui.FoundationProofPoint{
					Claim: payloadStr(pm, "claim"),
					Proof: payloadStr(pm, "proof"),
				})
			}
		}

		if ev, ok := vp["economic_value"].(map[string]any); ok {
			data.EconomicValue = ui.FoundationEconomicValue{
				CostSavings:   payloadStr(ev, "cost_savings"),
				RevenueGains:  payloadStr(ev, "revenue_gains"),
				RiskReduction: payloadStr(ev, "risk_reduction"),
			}
		}
	}

	// ── Strategic Sequencing ──
	if ss, ok := root["strategic_sequencing"].(map[string]any); ok {
		data.SequencingPrinciple = payloadStr(ss, "principle")
		if data.SequencingPrinciple == "" {
			data.SequencingPrinciple = payloadStr(ss, "sequencing_principle")
		}

		if phases, ok := ss["phases"].([]any); ok {
			for _, item := range phases {
				pm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.Phases = append(data.Phases, ui.FoundationPhase{
					Phase:              payloadStr(pm, "phase"),
					Name:               payloadStr(pm, "name"),
					Focus:              payloadStr(pm, "focus"),
					Timeframe:          payloadStr(pm, "timeframe"),
					TargetSegment:      payloadStr(pm, "target_segment"),
					ValueDelivered:     payloadStrSlice(pm, "value_delivered"),
					StrategicRationale: payloadStr(pm, "strategic_rationale"),
				})
			}
		}
	}

	// ── Information Architecture / Design Principles ──
	if ia, ok := root["information_architecture"].(map[string]any); ok {
		if principles, ok := ia["design_principles"].([]any); ok {
			for _, item := range principles {
				pm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.DesignPrinciples = append(data.DesignPrinciples, ui.FoundationPrinciple{
					Principle:     payloadStr(pm, "principle"),
					Manifestation: payloadStr(pm, "manifestation"),
				})
			}
		}
	}
	// Also check top-level design_principles (alternative payload shape).
	if len(data.DesignPrinciples) == 0 {
		if principles, ok := root["design_principles"].([]any); ok {
			for _, item := range principles {
				pm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.DesignPrinciples = append(data.DesignPrinciples, ui.FoundationPrinciple{
					Principle:     payloadStr(pm, "principle"),
					Manifestation: payloadStr(pm, "manifestation"),
				})
			}
		}
	}

	return ui.StrategyFoundationsContent(data)
}

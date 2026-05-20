package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// insightOpportunityContent extracts rich data from an insight_opportunity payload
// and returns a bespoke InsightOpportunityContent component.
func (s *Server) insightOpportunityContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// The opportunity data may be nested under an "opportunity" key.
	opp, ok := payload["opportunity"].(map[string]any)
	if !ok {
		opp = payload
	}

	data := ui.InsightOpportunityData{
		NavContext:      navCtx,
		ArtifactKey:     artifactKey,
		Name:            name,
		Status:          status,
		OpportunityID:   payloadStr(opp, "id"),
		Title:           payloadStr(opp, "title"),
		Description:     payloadStr(opp, "description"),
		ConfidenceLevel: payloadStr(opp, "confidence_level"),
		ValidationDate:  payloadStr(opp, "validation_date"),
	}
	if data.Title == "" {
		data.Title = name
	}

	// ── Context ──
	if ctx, ok := opp["context"].(map[string]any); ok {
		data.Urgency = payloadStr(ctx, "urgency")
		data.MarketSize = payloadStr(ctx, "market_size")
		data.TargetSegment = payloadStr(ctx, "target_segment")
		data.PainPoints = payloadStrSlice(ctx, "pain_points")
	}

	// ── Evidence ──
	if ev, ok := opp["evidence"].(map[string]any); ok {
		if qual, ok := ev["qualitative"].([]any); ok {
			for _, item := range qual {
				em, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.QualitativeEvidence = append(data.QualitativeEvidence, ui.OpportunityEvidence{
					Source:  payloadStr(em, "source"),
					Insight: payloadStr(em, "insight"),
				})
			}
		}
		if quant, ok := ev["quantitative"].([]any); ok {
			for _, item := range quant {
				em, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.QuantitativeEvidence = append(data.QuantitativeEvidence, ui.OpportunityEvidence{
					Source:  payloadStr(em, "source"),
					Insight: payloadStr(em, "insight"),
				})
			}
		}
		data.CompetitiveLandscape = payloadStrSlice(ev, "competitive_landscape")
	}

	// ── Value Hypothesis ──
	if vh, ok := opp["value_hypothesis"].(map[string]any); ok {
		data.UserValue = payloadStr(vh, "user_value")
		data.BusinessValue = payloadStr(vh, "business_value")
		data.StrategicFit = payloadStr(vh, "strategic_fit")
	}

	// ── Success Indicators ──
	if indicators, ok := opp["success_indicators"].([]any); ok {
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

	data.Gaps = checkOpportunityGaps(payload)
	return ui.InsightOpportunityContent(data)
}

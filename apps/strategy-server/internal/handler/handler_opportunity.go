package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// insightOpportunityContent extracts rich data from an insight_opportunity payload
// and returns a bespoke InsightOpportunityContent component.
func (s *Server) insightOpportunityContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// The opportunity data may be nested under an "opportunity" key.
	opp, _ := rootOf(payload, "opportunity")

	data := ui.InsightOpportunityData{
		NavContext:      navCtx,
		ArtifactKey:     artifactKey,
		Name:            name,
		Status:          status,
		OpportunityID:   tolStr(opp, "id"),
		Title:           tolStr(opp, "title"),
		Description:     tolStr(opp, "description"),
		ConfidenceLevel: tolStr(opp, "confidence_level"),
		ValidationDate:  tolStr(opp, "validation_date"),
		StoredStatus:    tolStr(opp, "status"),
		AnalysesSource:  tolStr(payload, "analyses_source"),
		BasedOnAnalyses: tolStr(payload, "based_on_analyses"),
		AnalysesUpdated: tolStr(payload, "analyses_last_updated"),
	}
	if data.Title == "" {
		data.Title = name
	}

	// ── Context ──
	ctx := tolMap(opp, "context")
	data.Urgency = tolStr(ctx, "urgency")
	data.MarketSize = tolStr(ctx, "market_size")
	data.TargetSegment = tolStr(ctx, "target_segment")
	data.PainPoints = tolStrs(ctx, "pain_points")

	// ── Evidence ──
	ev := tolMap(opp, "evidence")
	data.QualitativeEvidence = readOpportunityEvidence(ev["qualitative"])
	data.QuantitativeEvidence = readOpportunityEvidence(ev["quantitative"])
	data.CompetitiveLandscape = tolStrs(ev, "competitive_landscape")

	// ── Value Hypothesis ──
	vh := tolMap(opp, "value_hypothesis")
	data.UserValue = tolStr(vh, "user_value")
	data.BusinessValue = tolStr(vh, "business_value")
	data.StrategicFit = tolStr(vh, "strategic_fit")

	// ── Success Indicators ── the schema calls the text `metric`; `indicator` is
	// the older spelling and is still read.
	for _, im := range tolItems(opp["success_indicators"], "metric") {
		text := tolStr(im, "metric")
		if text == "" {
			text = tolStr(im, "indicator")
		}
		data.SuccessIndicators = append(data.SuccessIndicators, ui.FoundationIndicator{Indicator: text, Target: tolStr(im, "target")})
	}

	data.Gaps = checkOpportunityGaps(payload)
	data.Unshown = opportunityUnshown(payload)
	return ui.InsightOpportunityContent(data)
}

// readOpportunityEvidence reads a list of evidence items; a plain string is an
// insight with no source.
func readOpportunityEvidence(v any) []ui.OpportunityEvidence {
	var out []ui.OpportunityEvidence
	for _, em := range tolItems(v, "insight") {
		out = append(out, ui.OpportunityEvidence{Source: tolStr(em, "source"), Insight: tolStr(em, "insight")})
	}
	return out
}

// opportunityUnshown returns the stored content the page has no dedicated view for.
func opportunityUnshown(payload map[string]any) map[string]any {
	return unshownInRoot(payload, "opportunity", opportunityShownPaths, opportunityOuterShownPaths)
}

// opportunityShownPaths lists every path of the opportunity block that the page
// renders. Anything not listed reaches the page through the generic fallback, so
// this list must hold only what the reader really shows:
// TestOpportunityViewShowsEveryFieldOfTheSchema renders a payload built from the
// embedded schema and checks each field.
var opportunityShownPaths = []string{
	"id", "title", "description", "status", "confidence_level", "validation_date",
	"context.urgency", "context.market_size", "context.target_segment", "context.pain_points",
	"evidence.qualitative.*.source", "evidence.qualitative.*.insight",
	"evidence.quantitative.*.source", "evidence.quantitative.*.insight",
	"evidence.competitive_landscape",
	"value_hypothesis.user_value", "value_hypothesis.business_value", "value_hypothesis.strategic_fit",
	"success_indicators.*.metric", "success_indicators.*.indicator", "success_indicators.*.target",
}

// opportunityOuterShownPaths are the blocks that sit beside the opportunity: the
// template links the opportunity to the analyses it was drawn from.
var opportunityOuterShownPaths = []string{"analyses_source", "based_on_analyses", "analyses_last_updated"}

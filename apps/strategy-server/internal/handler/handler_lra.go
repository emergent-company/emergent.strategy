package handler

import (
	"sort"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// lraContent extracts rich data from a LRA (Living Reality Assessment) payload
// and returns a bespoke LRAContent component.
//
// The page never drops stored content. Whatever the readers below do not show, as
// listed in lraShownPaths, is handed to the generic renderer under a notice
// (data.Unshown). Layouts the schema does not define are not aliased: they are
// shown there as stored.
func (s *Server) lraContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.LRAViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
	}

	if meta := tolMap(payload, "metadata"); meta != nil {
		data.LifecycleStage = tolStr(meta, "lifecycle_stage")
		data.AdoptionLevel = payloadInt(meta, "adoption_level")
		data.CyclesCompleted = payloadInt(meta, "cycles_completed")
		data.CreatedAt = tolStr(meta, "created_at")
		data.LastUpdated = tolStr(meta, "last_updated")
		data.LastUpdatedBy = tolStr(meta, "last_updated_by")
		data.BootstrapType = tolStr(meta, "bootstrap_type")
		data.BootstrapTime = tolStr(meta, "bootstrap_time_invested")
	}

	if ac := tolMap(payload, "adoption_context"); ac != nil {
		data.TeamSize = tolStr(ac, "team_size")
		data.FundingStage = tolStr(ac, "funding_stage")
		data.OrgType = tolStr(ac, "organization_type")
		data.PrimaryBottleneck = tolStr(ac, "primary_bottleneck")
		data.AICapability = tolStr(ac, "ai_capability_level")
		data.RunwayMonths = tolStr(ac, "runway_months")
	}

	if cf := tolMap(payload, "current_focus"); cf != nil {
		data.PrimaryTrack = tolStr(cf, "primary_track")
		data.SecondaryTrack = tolStr(cf, "secondary_track")
		data.CycleRef = tolStr(cf, "cycle_reference")
		data.PrimaryObjective = tolStr(cf, "primary_objective")
		data.SuccessSignals = tolStrs(cf, "success_signals")
		data.AttentionAllocation = payloadIntMap(cf, "attention_allocation")
	}

	data.TrackBaselines = readLRABaselines(payload["track_baselines"])

	if ca := tolMap(payload, "constraints_and_assumptions"); ca != nil {
		for _, cm := range tolItems(ca["hard_constraints"], "constraint") {
			c := ui.LRAConstraint{
				Constraint:  tolStr(cm, "constraint"),
				Impact:      tolStr(cm, "impact"),
				Flexibility: tolStr(cm, "flexibility"),
			}
			if c != (ui.LRAConstraint{}) {
				data.HardConstraints = append(data.HardConstraints, c)
			}
		}
	}

	data.Evolution = readLRAEvolution(payload["evolution_log"])
	data.Records = readRecords(payload, lraRecordSpecs)
	data.Unshown = lraUnshown(payload)

	return ui.LRAContent(data)
}

// lraTrackOrder is the order the four tracks are shown in.
var lraTrackOrder = []string{"product", "strategy", "org_ops", "commercial"}

// readLRABaselines reads the baselines keyed by track, as the schema has them, or
// a list of baselines that name their track.
func readLRABaselines(v any) []ui.LRATrackBaseline {
	if list, ok := v.([]any); ok {
		var out []ui.LRATrackBaseline
		for _, item := range list {
			if bm, ok := item.(map[string]any); ok {
				if b := readLRABaseline(tolStr(bm, "track"), bm); hasLRABaseline(b) {
					out = append(out, b)
				}
			}
		}
		return out
	}
	baselines, _ := v.(map[string]any)
	var keys []string
	for k := range baselines {
		keys = append(keys, k)
	}
	rank := func(k string) int {
		for i, t := range lraTrackOrder {
			if t == k {
				return i
			}
		}
		return len(lraTrackOrder)
	}
	sort.Slice(keys, func(i, j int) bool {
		if ri, rj := rank(keys[i]), rank(keys[j]); ri != rj {
			return ri < rj
		}
		return keys[i] < keys[j]
	})
	var out []ui.LRATrackBaseline
	for _, track := range keys {
		bm := tolMap(baselines, track)
		if bm == nil {
			continue
		}
		if b := readLRABaseline(track, bm); hasLRABaseline(b) {
			out = append(out, b)
		}
	}
	return out
}

func readLRABaseline(track string, bm map[string]any) ui.LRATrackBaseline {
	return ui.LRATrackBaseline{
		Track:       track,
		Maturity:    tolStr(bm, "maturity"),
		Status:      tolStr(bm, "status"),
		Description: tolStr(bm, "description"),
		Activities:  tolStrs(bm, "key_activities"),
		Strengths:   tolStrs(bm, "strengths"),
		PainPoints:  tolStrs(bm, "pain_points"),
	}
}

func hasLRABaseline(b ui.LRATrackBaseline) bool {
	return b.Maturity != "" || b.Status != "" || b.Description != "" || len(b.Activities) > 0 || len(b.Strengths) > 0 || len(b.PainPoints) > 0
}

// readLRAEvolution reads the evolution log, latest entry first.
func readLRAEvolution(v any) []ui.LRAEvolution {
	entries := tolItems(v, "summary")
	var out []ui.LRAEvolution
	for i := len(entries) - 1; i >= 0; i-- {
		em := entries[i]
		e := ui.LRAEvolution{
			Timestamp: tolStr(em, "timestamp"),
			CycleRef:  tolStr(em, "cycle_reference"),
			UpdatedBy: tolStr(em, "updated_by"),
			Trigger:   tolStr(em, "trigger"),
			Summary:   tolStr(em, "summary"),
		}
		for _, cm := range tolItems(em["changes"], "field") {
			c := ui.LRAChange{
				Section:  tolStr(cm, "section"),
				Field:    tolStr(cm, "field"),
				Type:     tolStr(cm, "change_type"),
				Previous: tolText(cm["previous_value"]),
				New:      tolText(cm["new_value"]),
				Reason:   tolStr(cm, "reason"),
			}
			if c != (ui.LRAChange{}) {
				e.Changes = append(e.Changes, c)
			}
		}
		snap := tolMap(em, "signals_snapshot")
		for _, track := range lraTrackOrder {
			sm := tolMap(snap, track)
			sg := ui.LRASignal{Track: track, Velocity: tolStr(sm, "velocity"), Quality: tolStr(sm, "quality")}
			if sg.Velocity != "" || sg.Quality != "" {
				e.Signals = append(e.Signals, sg)
			}
		}
		if e.Timestamp != "" || e.CycleRef != "" || e.UpdatedBy != "" || e.Trigger != "" || e.Summary != "" || len(e.Changes) > 0 || len(e.Signals) > 0 {
			out = append(out, e)
		}
	}
	return out
}

// lraRecordSpecs are the card sections of the page.
var lraRecordSpecs = []recordSpec{
	{kind: ui.LRAKindCodeAssets, path: []string{"existing_assets", "code_assets"}, single: true,
		facts: []recordField{{"exists", "Exists"}, {"maturity", "Maturity"}, {"tech_stack_summary", "Tech stack"}}},
	{kind: ui.LRAKindDocAssets, path: []string{"existing_assets", "documentation_assets"}, single: true,
		facts: []recordField{{"exists", "Exists"}, {"quality_assessment", "Quality"}},
		lists: []recordField{{"types", "Types"}}},
	{kind: ui.LRAKindCustomerAssets, path: []string{"existing_assets", "customer_assets"}, single: true,
		facts: []recordField{{"has_users", "Has users"}, {"user_count_estimate", "Users"}, {"paying_customers", "Paying customers"}, {"customer_feedback_exists", "Customer feedback"}}},
	{kind: ui.LRAKindStrategyAssets, path: []string{"existing_assets", "strategic_assets"}, single: true,
		facts: []recordField{{"has_positioning", "Has positioning"}, {"positioning_documented", "Positioning documented"}, {"competitor_analysis_exists", "Competitor analysis"}, {"investor_materials_exist", "Investor materials"}}},
	{kind: ui.LRAKindProcessAssets, path: []string{"existing_assets", "process_assets"}, single: true,
		facts: []recordField{{"has_defined_process", "Has defined process"}},
		lists: []recordField{{"process_types", "Process types"}}},
	{kind: ui.LRAKindAssumptions, path: []string{"constraints_and_assumptions", "operating_assumptions"}, head: "assumption",
		facts: []recordField{{"confidence", "Confidence"}, {"source", "Source"}}},
	{kind: ui.LRAKindCapabilityGaps, path: []string{"constraints_and_assumptions", "capability_gaps"}, head: "gap",
		facts: []recordField{{"track", "Track"}, {"mitigation_approach", "Mitigation"}, {"mitigation_status", "Status"}}},
}

// lraUnshown returns the stored content the page has no dedicated view for.
func lraUnshown(payload map[string]any) map[string]any {
	return unshownContent(payload, lraShownPaths)
}

// lraShownPaths lists every path of the payload that the page renders. Anything
// not listed reaches the page through the generic fallback, so this list must
// hold only what the readers really show: TestLRAViewShowsEveryFieldOfTheSchema
// renders a payload built from the embedded schema and checks each field.
var lraShownPaths = buildLRAShownPaths()

func buildLRAShownPaths() []string {
	paths := []string{
		"metadata.lifecycle_stage", "metadata.adoption_level", "metadata.cycles_completed",
		"metadata.created_at", "metadata.last_updated", "metadata.last_updated_by",
		"metadata.bootstrap_type", "metadata.bootstrap_time_invested",
		"adoption_context.team_size", "adoption_context.funding_stage", "adoption_context.organization_type",
		"adoption_context.primary_bottleneck", "adoption_context.ai_capability_level", "adoption_context.runway_months",
		"current_focus.primary_track", "current_focus.secondary_track", "current_focus.cycle_reference",
		"current_focus.primary_objective", "current_focus.success_signals", "current_focus.attention_allocation.*",
	}
	paths = append(paths, entryPaths("constraints_and_assumptions.hard_constraints", "constraint", "impact", "flexibility")...)
	for _, f := range []string{"track", "maturity", "status", "description", "key_activities", "strengths", "pain_points"} {
		paths = append(paths, "track_baselines.*."+f)
	}
	for _, f := range []string{"timestamp", "cycle_reference", "updated_by", "trigger", "summary"} {
		paths = append(paths, "evolution_log.*."+f)
	}
	for _, f := range []string{"section", "field", "change_type", "previous_value", "new_value", "reason"} {
		paths = append(paths, "evolution_log.*.changes.*."+f)
	}
	for _, f := range []string{"velocity", "quality"} {
		paths = append(paths, "evolution_log.*.signals_snapshot.*."+f)
	}
	return append(paths, recordPaths(lraRecordSpecs)...)
}

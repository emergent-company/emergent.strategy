package handler

import (
	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// lraContent extracts rich data from a LRA (Living Reality Assessment) payload
// and returns a bespoke LRAContent component.
func (s *Server) lraContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.LRAViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
	}

	// ── Metadata ──
	if meta, ok := payload["metadata"].(map[string]any); ok {
		data.LifecycleStage = payloadStr(meta, "lifecycle_stage")
		data.AdoptionLevel = payloadInt(meta, "adoption_level")
		data.CyclesCompleted = payloadInt(meta, "cycles_completed")
		data.CreatedAt = payloadStr(meta, "created_at")
		data.LastUpdated = payloadStr(meta, "last_updated")
	}

	// ── Adoption Context ──
	if ac, ok := payload["adoption_context"].(map[string]any); ok {
		data.TeamSize = payloadStr(ac, "team_size")
		data.FundingStage = payloadStr(ac, "funding_stage")
		data.OrgType = payloadStr(ac, "organization_type")
		if data.OrgType == "" {
			data.OrgType = payloadStr(ac, "org_type")
		}
		data.PrimaryBottleneck = payloadStr(ac, "primary_bottleneck")
		data.AICapability = payloadStr(ac, "ai_capability_level")
		if data.AICapability == "" {
			data.AICapability = payloadStr(ac, "ai_capability")
		}
	}

	// ── Current Focus ──
	if cf, ok := payload["current_focus"].(map[string]any); ok {
		data.PrimaryTrack = payloadStr(cf, "primary_track")
		data.SecondaryTrack = payloadStr(cf, "secondary_track")
		data.CycleRef = payloadStr(cf, "cycle_reference")
		if data.CycleRef == "" {
			data.CycleRef = payloadStr(cf, "cycle_ref")
		}
		data.PrimaryObjective = payloadStr(cf, "primary_objective")
		data.SuccessSignals = payloadStrSlice(cf, "success_signals")
		data.AttentionAllocation = payloadIntMap(cf, "attention_allocation")
	}

	// ── Track Baselines ──
	if baselines, ok := payload["track_baselines"].(map[string]any); ok {
		// Track baselines is typically an object keyed by track name.
		for trackName, bv := range baselines {
			bm, ok := bv.(map[string]any)
			if !ok {
				continue
			}
			data.TrackBaselines = append(data.TrackBaselines, ui.LRATrackBaseline{
				Track:       trackName,
				Maturity:    payloadStr(bm, "maturity"),
				Status:      payloadStr(bm, "status"),
				Description: payloadStr(bm, "description"),
				Strengths:   payloadStrSlice(bm, "strengths"),
				PainPoints:  payloadStrSlice(bm, "pain_points"),
			})
		}
	}
	// Also support array form.
	if baselines, ok := payload["track_baselines"].([]any); ok {
		for _, item := range baselines {
			bm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.TrackBaselines = append(data.TrackBaselines, ui.LRATrackBaseline{
				Track:       payloadStr(bm, "track"),
				Maturity:    payloadStr(bm, "maturity"),
				Status:      payloadStr(bm, "status"),
				Description: payloadStr(bm, "description"),
				Strengths:   payloadStrSlice(bm, "strengths"),
				PainPoints:  payloadStrSlice(bm, "pain_points"),
			})
		}
	}

	// ── Constraints & Assumptions ──
	if ca, ok := payload["constraints_and_assumptions"].(map[string]any); ok {
		if constraints, ok := ca["hard_constraints"].([]any); ok {
			for _, item := range constraints {
				cm, ok := item.(map[string]any)
				if !ok {
					continue
				}
				data.HardConstraints = append(data.HardConstraints, ui.LRAConstraint{
					Constraint:  payloadStr(cm, "constraint"),
					Impact:      payloadStr(cm, "impact"),
					Flexibility: payloadStr(cm, "flexibility"),
				})
			}
		}
	}
	// Also check top-level "constraints" key.
	if constraints, ok := payload["constraints"].([]any); ok && len(data.HardConstraints) == 0 {
		for _, item := range constraints {
			cm, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.HardConstraints = append(data.HardConstraints, ui.LRAConstraint{
				Constraint:  payloadStr(cm, "constraint"),
				Impact:      payloadStr(cm, "impact"),
				Flexibility: payloadStr(cm, "flexibility"),
			})
		}
	}

	// ── Evolution Log ──
	if evol, ok := payload["evolution_log"].([]any); ok {
		for _, item := range evol {
			em, ok := item.(map[string]any)
			if !ok {
				continue
			}
			data.Evolution = append(data.Evolution, ui.LRAEvolution{
				Timestamp: payloadStr(em, "timestamp"),
				Trigger:   payloadStr(em, "trigger"),
				Summary:   payloadStr(em, "summary"),
			})
		}
	}

	return ui.LRAContent(data)
}

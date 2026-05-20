package handler

import (
	"context"
	"encoding/json"
	"strings"

	"github.com/a-h/templ"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// loadAssumptionStatements queries the roadmap_recipe for this instance and
// builds a map of assumption ID → human-readable description string.
func (s *Server) loadAssumptionStatements(ctx context.Context, instanceID string) map[string]string {
	var row struct {
		Payload string `bun:"payload"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "roadmap_recipe").
		Limit(1).
		Scan(ctx, &row)
	if err != nil || row.Payload == "" {
		return nil
	}

	var doc map[string]any
	if json.Unmarshal([]byte(row.Payload), &doc) != nil {
		return nil
	}
	// Roadmap is wrapped in a "roadmap" key.
	roadmap, _ := doc["roadmap"].(map[string]any)
	if roadmap == nil {
		roadmap = doc
	}

	result := make(map[string]string)

	// Walk every possible location assumptions may live, collecting id→description.
	collectAssumptions := func(list []any) {
		for _, asm := range list {
			am, ok := asm.(map[string]any)
			if !ok {
				continue
			}
			id, _ := am["id"].(string)
			desc, _ := am["description"].(string)
			if id != "" && desc != "" {
				result[id] = desc
			}
		}
	}

	// Pattern 1: roadmap.cycles[].assumptions[]  (older schema)
	cycles, _ := roadmap["cycles"].([]any)
	for _, cyc := range cycles {
		cm, ok := cyc.(map[string]any)
		if !ok {
			continue
		}
		if list, ok := cm["assumptions"].([]any); ok {
			collectAssumptions(list)
		}
	}

	// Pattern 2: roadmap.tracks.<track>.riskiest_assumptions[]  (current schema)
	tracks, _ := roadmap["tracks"].(map[string]any)
	for _, tv := range tracks {
		tm, ok := tv.(map[string]any)
		if !ok {
			continue
		}
		if list, ok := tm["riskiest_assumptions"].([]any); ok {
			collectAssumptions(list)
		}
	}

	// Pattern 3: top-level roadmap.assumptions[]
	if list, ok := roadmap["assumptions"].([]any); ok {
		collectAssumptions(list)
	}

	return result
}

// loadOKRTitles queries roadmap_recipe and builds a map of OKR id → objective text.
// It walks every list under roadmap.tracks.<track>.<any key containing "okr"> to
// handle both current-cycle and future OKR keys.
func (s *Server) loadOKRTitles(ctx context.Context, instanceID string) map[string]string {
	var row struct {
		Payload string `bun:"payload"`
	}
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "roadmap_recipe").
		Limit(1).
		Scan(ctx, &row)
	if err != nil || row.Payload == "" {
		return nil
	}
	var doc map[string]any
	if json.Unmarshal([]byte(row.Payload), &doc) != nil {
		return nil
	}
	roadmap, _ := doc["roadmap"].(map[string]any)
	if roadmap == nil {
		roadmap = doc
	}

	result := make(map[string]string)
	tracks, _ := roadmap["tracks"].(map[string]any)
	for _, tv := range tracks {
		tm, ok := tv.(map[string]any)
		if !ok {
			continue
		}
		for _, v := range tm {
			list, ok := v.([]any)
			if !ok {
				continue
			}
			for _, item := range list {
				m, ok := item.(map[string]any)
				if !ok {
					continue
				}
				id, _ := m["id"].(string)
				if !strings.HasPrefix(id, "okr-") {
					continue
				}
				// Field may be "objective", "title", or "name"
				title := strField(m, "objective")
				if title == "" {
					title = strField(m, "title")
				}
				if title == "" {
					title = strField(m, "name")
				}
				if id != "" && title != "" {
					result[id] = title
				}
			}
		}
	}
	return result
}

// assessmentContent extracts rich data from an assessment_report payload
// and returns a bespoke AssessmentContent component.
func (s *Server) assessmentContent(ctx context.Context, instanceID string, navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	// Pre-load human-readable labels from roadmap.
	asmStatements := s.loadAssumptionStatements(ctx, instanceID)
	okrTitles := s.loadOKRTitles(ctx, instanceID)

	data := ui.AssessmentViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
		Cycle:       payloadInt(payload, "cycle"),
		RoadmapID:   payloadStr(payload, "roadmap_id"),
		LastUpdated: payloadStr(payload, "last_updated"),
	}

	// Also check nested "meta" for last_updated.
	if meta, ok := payload["meta"].(map[string]any); ok {
		if data.LastUpdated == "" {
			data.LastUpdated = payloadStr(meta, "last_updated")
		}
		if data.RoadmapID == "" {
			data.RoadmapID = payloadStr(meta, "roadmap_id")
		}
	}

	// ── OKR Assessments ──
	if okrs, ok := payload["okr_assessments"].([]any); ok {
		for _, item := range okrs {
			om, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id := payloadStr(om, "okr_id")
			okr := ui.AssessmentOKR{
				OKRID:      id,
				Title:      okrTitles[id],
				Assessment: payloadStr(om, "assessment"),
			}

			if krs, ok := om["key_results"].([]any); ok {
				for _, krItem := range krs {
					km, ok := krItem.(map[string]any)
					if !ok {
						continue
					}
					okr.KeyResults = append(okr.KeyResults, ui.AssessmentKR{
						KRID:      payloadStr(km, "kr_id"),
						Status:    payloadStr(km, "status"),
						Target:    payloadStr(km, "target"),
						Actual:    payloadStr(km, "actual"),
						Learnings: payloadStrSlice(km, "learnings"),
					})
				}
			}

			data.OKRAssessments = append(data.OKRAssessments, okr)
		}
	}

	// ── Assumption Validations ──
	if assumptions, ok := payload["assumption_validations"].([]any); ok {
		for _, item := range assumptions {
			am, ok := item.(map[string]any)
			if !ok {
				continue
			}
			id := payloadStr(am, "id")
			data.AssumptionValidations = append(data.AssumptionValidations, ui.AssessmentAssumption{
				ID:               id,
				Statement:        asmStatements[id],
				Status:           payloadStr(am, "status"),
				Evidence:         payloadStr(am, "evidence"),
				ConfidenceChange: payloadStr(am, "confidence_change"),
			})
		}
	}

	// ── Strategic Insights ──
	data.StrategicInsights = payloadStrSlice(payload, "strategic_insights")

	// ── Recommendations ──
	data.Recommendations = payloadStrSlice(payload, "next_cycle_recommendations")
	if len(data.Recommendations) == 0 {
		data.Recommendations = payloadStrSlice(payload, "recommendations")
	}

	return ui.AssessmentContent(data)
}

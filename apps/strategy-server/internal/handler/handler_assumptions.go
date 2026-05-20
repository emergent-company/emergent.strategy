package handler

import (
	"context"
	"encoding/json"

	"github.com/a-h/templ"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/labstack/echo/v4"
)

// handleAssumptions serves /aim/assumptions.
func (s *Server) handleAssumptions(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		content := s.loadAssumptionsView(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{Title: "Assumptions", Content: content}
	})
}

func (s *Server) loadAssumptionsView(ctx context.Context, instanceID string) templ.Component {
	// All tests_assumption relationships: source=feature, target=assumption key
	type relRow struct {
		SourceKey string `bun:"source_key"`
		TargetKey string `bun:"target_key"`
	}
	var rels []relRow
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		ColumnExpr("source_key, target_key").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		Scan(ctx, &rels)

	// Build assumption → []feature map
	type assumptionData struct {
		testedBy []string
	}
	assumptionMap := make(map[string]*assumptionData)
	for _, r := range rels {
		if _, ok := assumptionMap[r.TargetKey]; !ok {
			assumptionMap[r.TargetKey] = &assumptionData{}
		}
		assumptionMap[r.TargetKey].testedBy = append(assumptionMap[r.TargetKey].testedBy, r.SourceKey)
	}

	// Also pick up assumptions from roadmap that may have no test coverage yet
	type asmRow struct {
		Key string `bun:"key"`
	}
	// We approximate by looking at all known target_keys in tests_assumption; roadmap
	// assumptions not referenced have no row yet — they're not surfaced.
	// For a richer view we'd parse the roadmap payload; keep it simple for now.

	// Build assumption validation outcomes from assessment reports
	type validationRow struct {
		AssumptionID     string `bun:"assumption_id"`
		ValidationStatus string `bun:"validation_status"`
		Evidence         string `bun:"evidence"`
	}
	// Parse assumption_validations from all assessment_report payloads
	validationMap := make(map[string]validationRow)
	type reportRow struct {
		Payload string `bun:"payload"`
	}
	var reports []reportRow
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "assessment_report").
		Scan(ctx, &reports)

	for _, rep := range reports {
		if rep.Payload == "" {
			continue
		}
		var p map[string]any
		if json.Unmarshal([]byte(rep.Payload), &p) != nil {
			continue
		}
		avs, _ := p["assumption_validations"].([]any)
		for _, v := range avs {
			av, ok := v.(map[string]any)
			if !ok {
				continue
			}
			id := strField(av, "id")
			if id == "" {
				continue
			}
			validationMap[id] = validationRow{
				AssumptionID:     id,
				ValidationStatus: strField(av, "status"),
				Evidence:         strField(av, "evidence"),
			}
		}
	}

	// Compose the view rows — sorted by risk (untested first)
	rows := make([]ui.AssumptionRow, 0, len(assumptionMap))
	for key, ad := range assumptionMap {
		risk := assumptionRiskLevel(len(ad.testedBy))
		vr := validationMap[key]
		rows = append(rows, ui.AssumptionRow{
			Key:              key,
			TestedBy:         ad.testedBy,
			RiskLevel:        risk,
			ValidationStatus: vr.ValidationStatus,
			Evidence:         vr.Evidence,
		})
	}
	// Sort: untested → partially_tested → well_tested
	sortAssumptionRows(rows)

	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: "/strategies/" + instanceID + "/aim/assumptions",
		ScreenID:    "aim-assumptions",
		TabGroup:    "aim",
	}

	return ui.AssumptionsContent(ui.AssumptionsViewData{
		NavContext:  navCtx,
		InstanceID:  instanceID,
		Assumptions: rows,
	})
}

// assumptionRiskLevel classifies risk based on how many features test it.
func assumptionRiskLevel(testedByCount int) string {
	switch {
	case testedByCount == 0:
		return "untested"
	case testedByCount == 1:
		return "partially_tested"
	default:
		return "well_tested"
	}
}

// sortAssumptionRows sorts rows: untested first, then partially, then well tested.
func sortAssumptionRows(rows []ui.AssumptionRow) {
	riskOrder := map[string]int{"untested": 0, "partially_tested": 1, "well_tested": 2}
	for i := 1; i < len(rows); i++ {
		for j := i; j > 0 && riskOrder[rows[j].RiskLevel] < riskOrder[rows[j-1].RiskLevel]; j-- {
			rows[j], rows[j-1] = rows[j-1], rows[j]
		}
	}
}

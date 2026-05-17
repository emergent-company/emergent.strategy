package handler

import (
	"context"
	"encoding/json"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/domain"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
)

// loadReadyPhaseData loads data for the READY phase dashboard.
func (s *Server) loadReadyPhaseData(ctx context.Context, instanceID string) ui.ReadyPhaseData {
	data := ui.ReadyPhaseData{
		InstanceID:     instanceID,
		TotalArtifacts: 7, // north_star, insight_analyses, strategy_foundations, insight_opportunity, strategy_formula, roadmap_recipe, product_portfolio
	}

	// Check each READY artifact and extract titles from payload
	data.NorthStarExists, data.NorthStarOrg, data.NorthStarVision = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeNorthStar, "north_star.organization", "north_star.vision.vision_statement")
	data.InsightExists, data.InsightTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeInsightAnalyses, "name", "")
	data.FoundationExists, data.FoundationTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeStrategyFoundations, "name", "")
	data.FormulaExists, data.FormulaTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeStrategyFormula, "name", "")
	data.RoadmapExists, data.RoadmapTitle, _ = s.loadArtifactSummary(ctx, instanceID, domain.ArtifactTypeRoadmap, "name", "")
	data.OpportunityExists, data.OpportunityTitle, _ = s.loadArtifactSummary(ctx, instanceID, "insight_opportunity", "name", "")

	// Count completed
	for _, exists := range []bool{data.NorthStarExists, data.InsightExists, data.FoundationExists, data.FormulaExists, data.RoadmapExists, data.OpportunityExists} {
		if exists {
			data.CompletedArtifacts++
		}
	}
	// Check product_portfolio too
	if s.hasArtifactType(ctx, instanceID, "product_portfolio") {
		data.CompletedArtifacts++
	}

	// Load roadmap OKR summary from payload
	data.TrackOKRs = s.loadRoadmapOKRs(ctx, instanceID)

	return data
}

// loadFirePhaseData loads data for the FIRE phase dashboard.
func (s *Server) loadFirePhaseData(ctx context.Context, instanceID string) ui.FirePhaseData {
	data := ui.FirePhaseData{InstanceID: instanceID}

	// Features by status
	data.DeliveredCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "delivered")
	data.InProgressCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "in-progress")
	data.DraftCount = s.countArtifactsByStatus(ctx, instanceID, domain.ArtifactTypeFeature, "draft")
	data.TotalFeatures = data.DeliveredCount + data.InProgressCount + data.DraftCount

	// Track definitions
	data.Tracks = []ui.TrackSummary{
		{Name: "Product", Icon: "lucide--code-2", Count: s.countByType(ctx, instanceID, domain.ArtifactTypeFeature), Track: "product"},
		{Name: "Commercial", Icon: "lucide--briefcase", Count: s.countByType(ctx, instanceID, "commercial_def"), Track: "commercial"},
		{Name: "Strategy", Icon: "lucide--navigation", Count: s.countByType(ctx, instanceID, "strategy_def"), Track: "strategy"},
		{Name: "Org & Ops", Icon: "lucide--container", Count: s.countByType(ctx, instanceID, "org_ops_def"), Track: "org-ops"},
	}

	// Value models
	data.ValueModels = s.loadValueModels(ctx, instanceID)

	// Features
	data.RecentFeatures = s.loadFeatures(ctx, instanceID)

	return data
}

// loadAimPhaseData loads data for the AIM phase dashboard.
func (s *Server) loadAimPhaseData(ctx context.Context, instanceID string) ui.AimPhaseData {
	data := ui.AimPhaseData{InstanceID: instanceID}

	// Assumptions
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		ColumnExpr("COUNT(DISTINCT target_key)").
		Scan(ctx, &data.TotalAssumptions)

	// Count features that test assumptions
	_ = s.db.NewSelect().
		TableExpr("strategy_relationships").
		Where("instance_id = ?", instanceID).
		Where("relationship_type = ?", "tests_assumption").
		ColumnExpr("COUNT(DISTINCT source_key)").
		Scan(ctx, &data.TestedAssumptions)

	// Signals
	data.ActiveSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Count(ctx)

	data.CriticalSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "critical").
		Count(ctx)

	data.WarningSignals, _ = s.db.NewSelect().
		TableExpr("ripple_signals").
		Where("instance_id = ?", instanceID).
		Where("status = ?", "active").
		Where("severity = ?", "warning").
		Count(ctx)

	// AIM artifacts
	data.HasLRA = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeLRA)
	data.HasAssessmentReport = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeAssessmentReport)
	data.HasTriggerConfig = s.hasArtifactType(ctx, instanceID, domain.ArtifactTypeAIMTriggerConfig)
	data.HasCalibration = s.hasArtifactType(ctx, instanceID, "calibration_memo")
	data.HasRealityCheck = s.hasArtifactType(ctx, instanceID, "strategic_reality_check")

	// LRA lifecycle stage
	if data.HasLRA {
		data.LRALifecycleStage = s.extractPayloadField(ctx, instanceID, domain.ArtifactTypeLRA, "metadata.lifecycle_stage")
	}

	// Versions
	data.VersionCount, _ = s.db.NewSelect().
		TableExpr("strategy_versions").
		Where("instance_id = ?", instanceID).
		Count(ctx)

	return data
}

// --- helper queries ---

// loadArtifactSummary checks if an artifact type exists and extracts fields from its payload.
func (s *Server) loadArtifactSummary(ctx context.Context, instanceID, artifactType, field1, field2 string) (bool, string, string) {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return false, "", ""
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return true, "", ""
	}

	v1 := extractNestedField(m, field1)
	v2 := extractNestedField(m, field2)
	return true, v1, v2
}

// extractPayloadField extracts a single nested field from an artifact payload.
func (s *Server) extractPayloadField(ctx context.Context, instanceID, artifactType, field string) string {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return ""
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return ""
	}
	return extractNestedField(m, field)
}

// extractNestedField traverses a dot-separated path in a map.
func extractNestedField(m map[string]any, path string) string {
	if path == "" {
		return ""
	}
	parts := splitDot(path)
	var current any = m
	for _, p := range parts {
		cm, ok := current.(map[string]any)
		if !ok {
			return ""
		}
		current, ok = cm[p]
		if !ok {
			return ""
		}
	}
	if s, ok := current.(string); ok {
		return s
	}
	return ""
}

// splitDot splits a string by dots.
func splitDot(s string) []string {
	var parts []string
	start := 0
	for i := range s {
		if s[i] == '.' {
			parts = append(parts, s[start:i])
			start = i + 1
		}
	}
	parts = append(parts, s[start:])
	return parts
}

// countArtifactsByStatus counts artifacts of a type with a specific status.
func (s *Server) countArtifactsByStatus(ctx context.Context, instanceID, artifactType, status string) int {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Where("status = ?", status).
		Count(ctx)
	return int(count)
}

// countByType counts all artifacts of a given type.
func (s *Server) countByType(ctx context.Context, instanceID, artifactType string) int {
	count, _ := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", artifactType).
		Count(ctx)
	return int(count)
}

// loadValueModels loads value model summaries.
func (s *Server) loadValueModels(ctx context.Context, instanceID string) []ui.ValueModelSummary {
	var rows []struct {
		Name   string `bun:"name"`
		Status string `bun:"status"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("name, status").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "value_model").
		OrderExpr("name ASC").
		Scan(ctx, &rows)

	vms := make([]ui.ValueModelSummary, len(rows))
	for i, r := range rows {
		icon := "lucide--layers"
		vms[i] = ui.ValueModelSummary{
			Track:  r.Name,
			Status: r.Status,
			Icon:   icon,
		}
	}
	return vms
}

// loadFeatures loads feature summaries ordered by status then name.
func (s *Server) loadFeatures(ctx context.Context, instanceID string) []ui.FeatureSummary {
	var rows []struct {
		Key    string `bun:"artifact_key"`
		Name   string `bun:"name"`
		Status string `bun:"status"`
		Track  string `bun:"track"`
	}
	_ = s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, name, status, track").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeFeature).
		OrderExpr("CASE status WHEN 'in-progress' THEN 0 WHEN 'draft' THEN 1 WHEN 'delivered' THEN 2 ELSE 3 END, name ASC").
		Scan(ctx, &rows)

	features := make([]ui.FeatureSummary, len(rows))
	for i, r := range rows {
		features[i] = ui.FeatureSummary{
			Key:    r.Key,
			Name:   r.Name,
			Status: r.Status,
			Track:  r.Track,
		}
	}
	return features
}

// loadRoadmapOKRs extracts OKR counts from the roadmap recipe payload.
func (s *Server) loadRoadmapOKRs(ctx context.Context, instanceID string) []ui.TrackOKRSummary {
	var payloadStr string
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		Column("payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", domain.ArtifactTypeRoadmap).
		Limit(1).
		Scan(ctx, &payloadStr)
	if err != nil || payloadStr == "" {
		return nil
	}

	var m map[string]any
	if json.Unmarshal([]byte(payloadStr), &m) != nil {
		return nil
	}

	tracks, ok := m["tracks"].(map[string]any)
	if !ok {
		return nil
	}

	trackMeta := []struct {
		key  string
		name string
		icon string
	}{
		{"product", "Product", "lucide--code-2"},
		{"strategy", "Strategy", "lucide--navigation"},
		{"org_ops", "Org & Ops", "lucide--container"},
		{"commercial", "Commercial", "lucide--briefcase"},
	}

	var summaries []ui.TrackOKRSummary
	for _, tm := range trackMeta {
		t, ok := tracks[tm.key].(map[string]any)
		if !ok {
			continue
		}
		okrs, ok := t["okrs"].([]any)
		if !ok {
			continue
		}
		objectives := len(okrs)
		keyResults := 0
		for _, okr := range okrs {
			if okrMap, ok := okr.(map[string]any); ok {
				if krs, ok := okrMap["key_results"].([]any); ok {
					keyResults += len(krs)
				}
			}
		}
		summaries = append(summaries, ui.TrackOKRSummary{
			Track:      tm.name,
			Icon:       tm.icon,
			Objectives: objectives,
			KeyResults: keyResults,
		})
	}
	return summaries
}

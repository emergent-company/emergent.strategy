package handler

import (
	"context"
	"encoding/json"

	"github.com/a-h/templ"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/ui"
	"github.com/labstack/echo/v4"
)

// handleCalibration serves /aim/calibration — shows the latest calibration memo.
func (s *Server) handleCalibration(c echo.Context) error {
	return s.renderPhaseContent(c, func(instanceID string, c echo.Context) ui.PhaseRenderData {
		content := s.loadCalibrationView(c.Request().Context(), instanceID)
		return ui.PhaseRenderData{Title: "Calibration", Content: content}
	})
}

// loadCalibrationView loads the most recent calibration_memo and returns its rendered component.
func (s *Server) loadCalibrationView(ctx context.Context, instanceID string) templ.Component {
	currentPath := "/strategies/" + instanceID + "/aim/calibration"
	navCtx := ui.NavContext{
		InstanceID:  instanceID,
		CurrentPath: currentPath,
		ScreenID:    "aim-calibration",
		TabGroup:    "aim",
	}

	type row struct {
		ArtifactKey string `bun:"artifact_key"`
		Name        string `bun:"name"`
		Status      string `bun:"status"`
		Payload     string `bun:"payload"`
	}
	var r row
	err := s.db.NewSelect().
		TableExpr("strategy_artifacts").
		ColumnExpr("artifact_key, COALESCE(name,'') as name, COALESCE(status,'') as status, payload::text as payload").
		Where("instance_id = ?", instanceID).
		Where("artifact_type = ?", "calibration_memo").
		OrderExpr("created_at DESC").
		Limit(1).
		Scan(ctx, &r)

	if err != nil || r.Payload == "" {
		return ui.ArtifactPlaceholder(navCtx, "Calibration Memo",
			"No calibration memo found. Create one after completing an AIM assessment cycle.",
			"lucide--sliders-horizontal")
	}

	name := r.Name
	if name == "" {
		name = "Calibration Memo"
	}

	var payload map[string]any
	if json.Unmarshal([]byte(r.Payload), &payload) != nil {
		return ui.ArtifactPlaceholder(navCtx, "Calibration Memo",
			"Unable to parse calibration memo payload.",
			"lucide--sliders-horizontal")
	}

	return s.calibrationContent(navCtx, r.ArtifactKey, name, r.Status, payload)
}

// calibrationContent extracts fields from the payload and returns the CalibrationContent component.
func (s *Server) calibrationContent(navCtx ui.NavContext, artifactKey, name, status string, payload map[string]any) templ.Component {
	data := ui.CalibrationViewData{
		NavContext:  navCtx,
		ArtifactKey: artifactKey,
		Name:        name,
		Status:      status,
	}

	data.Decision = strField(payload, "decision")
	data.Confidence = strField(payload, "confidence")
	data.Reasoning = strField(payload, "reasoning")
	data.RoadmapID = strField(payload, "roadmap_id")
	if v, ok := payload["cycle"].(float64); ok {
		data.Cycle = int(v)
	}

	if l, ok := payload["learnings"].(map[string]any); ok {
		data.ValidatedAssumptions = strSlice(l, "validated_assumptions")
		data.InvalidatedAssumptions = strSlice(l, "invalidated_assumptions")
		data.Surprises = strSlice(l, "surprises")
	}

	if ncf, ok := payload["next_cycle_focus"].(map[string]any); ok {
		data.ContinueBuilding = extractStringList(ncf, "continue_building")
		data.StopBuilding = extractStringList(ncf, "stop_building")
		data.StartExploring = extractStringList(ncf, "start_exploring")
	}

	if nri, ok := payload["next_ready_inputs"].(map[string]any); ok {
		data.OpportunityUpdate = strField(nri, "opportunity_update")
		data.StrategyUpdate = strField(nri, "strategy_update")
		data.NewAssumptions = strSlice(nri, "new_assumptions")
	}

	data.NextSteps = strSlice(payload, "next_steps")

	// Legacy "calibration" sub-object fallback
	if cal, ok := payload["calibration"].(map[string]any); ok {
		if data.Decision == "" {
			data.Decision = strField(cal, "decision")
		}
		if len(data.ContinueBuilding) == 0 {
			data.ContinueBuilding = extractStringList(cal, "continue_doing")
		}
		if len(data.StopBuilding) == 0 {
			data.StopBuilding = extractStringList(cal, "stop_doing")
		}
		if len(data.StartExploring) == 0 {
			data.StartExploring = extractStringList(cal, "start_exploring")
		}
	}

	return ui.CalibrationContent(data)
}

// strField extracts a string from a map by key.
func strField(m map[string]any, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}

// strSlice extracts a []string from a map key that holds []any of strings.
func strSlice(m map[string]any, key string) []string {
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok && s != "" {
			out = append(out, s)
		}
	}
	return out
}

// extractStringList handles both plain string slices and {description:...} object slices.
func extractStringList(m map[string]any, key string) []string {
	raw, ok := m[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		switch vt := v.(type) {
		case string:
			if vt != "" {
				out = append(out, vt)
			}
		case map[string]any:
			if desc, ok := vt["description"].(string); ok && desc != "" {
				out = append(out, desc)
			}
		}
	}
	return out
}

package mcpserver

// register_phase2c_tools.go — Phase 2c missing tool implementations.
//
// Tools added:
//   get_phase_artifacts     — list artifact types by READY/FIRE/AIM phase
//   list_definitions        — canonical track definitions from embedded templates
//   get_definition          — full YAML template for a specific definition
//   validate_with_plan      — chunked fix-plan for large validation error sets
//   get_persona_details     — deep persona detail with pain points and jobs-to-do
//   validate_assumptions    — check which assumptions have testing features
//   stage_calibration       — stage a calibration memo artifact
//   add_relationship        — stage a cross-artifact relationship
//   suggest_relationships   — suggest missing relationships for a feature
//   discard_scenario        — discard a what-if scenario branch

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/mark3labs/mcp-go/mcp"
	"github.com/mark3labs/mcp-go/server"

	"github.com/emergent-company/emergent-strategy/apps/strategy-server/domain/strategy"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/internal/embedded"
	"github.com/emergent-company/emergent-strategy/apps/strategy-server/pkg/apperror"
)

func registerPhase2cTools(s *server.MCPServer, svc Services) {
	registerPhaseArtifactTools(s)
	registerDefinitionTools(s)
	registerValidateWithPlanTool(s, svc)
	registerPersonaDetailsTool(s, svc)
	registerAssumptionValidationTool(s, svc)
	registerCalibrationTool(s, svc)
	registerRelationshipWriteTools(s, svc)
	registerDiscardScenarioTool(s, svc)
}

// ---------------------------------------------------------------------------
// Phase artifact discovery
// ---------------------------------------------------------------------------

// phaseArtifactInfo describes an artifact type within an EPF phase.
type phaseArtifactInfo struct {
	ArtifactType string `json:"artifact_type"`
	Description  string `json:"description"`
	SchemaFile   string `json:"schema_file,omitempty"`
	TemplatePath string `json:"template_path,omitempty"`
}

var phaseArtifacts = map[string][]phaseArtifactInfo{
	"READY": {
		{ArtifactType: "north_star", Description: "Vision, mission, and purpose", SchemaFile: "north_star_schema.json", TemplatePath: "READY/00_north_star.yaml"},
		{ArtifactType: "insight_analyses", Description: "Market analysis and competitive landscape", SchemaFile: "insight_analyses_schema.json", TemplatePath: "READY/01_insight_analyses.yaml"},
		{ArtifactType: "strategy_foundations", Description: "Target customer, positioning, ICP", SchemaFile: "strategy_foundations_schema.json", TemplatePath: "READY/02_strategy_foundations.yaml"},
		{ArtifactType: "insight_opportunity", Description: "Opportunity assessment", SchemaFile: "insight_opportunity_schema.json", TemplatePath: "READY/03_insight_opportunity.yaml"},
		{ArtifactType: "strategy_formula", Description: "Strategic bet, insight, actions", SchemaFile: "strategy_formula_schema.json", TemplatePath: "READY/04_strategy_formula.yaml"},
		{ArtifactType: "roadmap_recipe", Description: "Phased delivery plan with milestones", SchemaFile: "roadmap_recipe_schema.json", TemplatePath: "READY/05_roadmap_recipe.yaml"},
		{ArtifactType: "product_portfolio", Description: "Product portfolio overview", SchemaFile: "product_portfolio_schema.json", TemplatePath: "READY/product_portfolio.yaml"},
	},
	"FIRE": {
		{ArtifactType: "feature", Description: "Feature definition with strategic context", SchemaFile: "feature_definition_schema.json"},
		{ArtifactType: "commercial_def", Description: "Commercial track definition", SchemaFile: "commercial_definition_schema.json"},
		{ArtifactType: "org_ops_def", Description: "Org ops track definition", SchemaFile: "org_ops_definition_schema.json"},
		{ArtifactType: "strategy_def", Description: "Strategy track definition", SchemaFile: "strategy_definition_schema.json"},
		{ArtifactType: "value_model", Description: "Value model for a track", SchemaFile: "value_model_schema.json"},
		{ArtifactType: "mappings", Description: "Cross-artifact mappings", SchemaFile: "mappings_schema.json"},
	},
	"AIM": {
		{ArtifactType: "living_reality_assessment", Description: "Living Reality Assessment (LRA)", SchemaFile: "living_reality_assessment_schema.json"},
		{ArtifactType: "assessment_report", Description: "Post-launch AIM assessment report", SchemaFile: "assessment_report_schema.json"},
		{ArtifactType: "aim_trigger_config", Description: "AIM trigger thresholds and schedules", SchemaFile: "aim_trigger_config_schema.json"},
		{ArtifactType: "calibration_memo", Description: "Strategy calibration memo after AIM review", SchemaFile: "calibration_memo_schema.json"},
		{ArtifactType: "strategic_reality_check", Description: "Pre-AIM strategic reality check", SchemaFile: "strategic_reality_check_schema.json"},
		{ArtifactType: "track_health_assessment", Description: "Per-track health signal assessment", SchemaFile: "track_health_assessment_schema.json"},
	},
}

func registerPhaseArtifactTools(s *server.MCPServer) {
	s.AddTool(mcp.NewTool("get_phase_artifacts",
		mcp.WithDescription("USE WHEN you need to know which artifact types belong to a specific EPF phase (READY, FIRE, or AIM). Returns artifact types with descriptions, schema files, and template paths."),
		mcp.WithString("phase", mcp.Required(), mcp.Description("EPF phase: READY, FIRE, or AIM")),
	), func(_ context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		phase := strings.ToUpper(argString(req, "phase"))
		artifacts, ok := phaseArtifacts[phase]
		if !ok {
			return mcp.NewToolResultError(fmt.Sprintf("unknown phase %q; use READY, FIRE, or AIM", phase)), nil
		}
		return mustJSON(map[string]any{
			"phase":     phase,
			"artifacts": artifacts,
			"count":     len(artifacts),
		})
	})
}

// ---------------------------------------------------------------------------
// Track definition tools
// ---------------------------------------------------------------------------

func registerDefinitionTools(s *server.MCPServer) {
	// list_definitions — list canonical track definition templates from FIRE/definitions/.
	s.AddTool(mcp.NewTool("list_definitions",
		mcp.WithDescription("USE WHEN you need to see all canonical track definition templates (commercial, org_ops, strategy). Optionally filter by track name."),
		mcp.WithString("track", mcp.Description("Filter by track: commercial, org_ops, strategy. Omit for all.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		allTemplates, err := embedded.ListTemplates()
		if err != nil {
			return toolErr(ctx, err), nil
		}

		track := argString(req, "track")
		prefix := "FIRE/definitions/"
		if track != "" {
			prefix = "FIRE/definitions/" + track + "/"
		}

		type defEntry struct {
			Path     string `json:"path"`
			Track    string `json:"track"`
			Category string `json:"category"`
			Filename string `json:"filename"`
		}
		var defs []defEntry
		for _, t := range allTemplates {
			if !strings.HasPrefix(t, prefix) {
				continue
			}
			// Parse: FIRE/definitions/<track>/<category>/<filename>.yaml
			parts := strings.Split(t, "/")
			if len(parts) < 4 {
				continue
			}
			d := defEntry{
				Path:     t,
				Track:    parts[2],
				Filename: parts[len(parts)-1],
			}
			if len(parts) >= 5 {
				d.Category = parts[3]
			}
			defs = append(defs, d)
		}
		return mustJSON(map[string]any{
			"definitions": defs,
			"count":       len(defs),
		})
	})

	// get_definition — return the full YAML template for a specific definition.
	s.AddTool(mcp.NewTool("get_definition",
		mcp.WithDescription("USE WHEN you need the full YAML template for a specific canonical track definition. Use list_definitions to find the path first."),
		mcp.WithString("path", mcp.Required(), mcp.Description("Template path from list_definitions, e.g. FIRE/definitions/commercial/financing/cd-010-investor-pitch-decks.yaml")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		data, err := embedded.GetTemplate(argString(req, "path"))
		if err != nil {
			return toolErr(ctx, err), nil
		}
		return mcp.NewToolResultText(string(data)), nil
	})
}

// ---------------------------------------------------------------------------
// validate_with_plan — chunked fix-plan for large validation error sets
// ---------------------------------------------------------------------------

func registerValidateWithPlanTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("validate_with_plan",
		mcp.WithDescription("USE WHEN you have a large number of validation errors and need a prioritized fix plan. Validates all artifacts in an instance and groups errors by severity with suggested fix order."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		artifacts, err := svc.Strategy.ListCurrentArtifacts(ctx, instID, "")
		if err != nil {
			return toolErr(ctx, err), nil
		}

		type fixItem struct {
			ArtifactKey  string   `json:"artifact_key"`
			ArtifactType string   `json:"artifact_type"`
			Priority     string   `json:"priority"` // "critical" | "high" | "medium" | "low"
			Errors       []string `json:"errors"`
			FixHint      string   `json:"fix_hint"`
		}

		var plan []fixItem
		for _, a := range artifacts {
			result := embedded.ValidateArtifact(a.ArtifactType, a.Payload)
			if result.Valid {
				continue
			}

			priority := "medium"
			hint := "Fix schema errors to conform to the EPF standard."

			// Foundation artifacts are critical.
			switch a.ArtifactType {
			case "north_star", "strategy_foundations", "strategy_formula":
				priority = "critical"
				hint = "Foundation artifact — fix first as other artifacts depend on it."
			case "roadmap_recipe", "insight_analyses":
				priority = "high"
				hint = "Key READY artifact — fix before moving to FIRE phase."
			case "feature":
				priority = "high"
				hint = "Feature definition — use get_schema('feature_definition_schema.json') to see required fields."
			case "value_model":
				priority = "high"
				hint = "Value model — ensure track_name, maturity_stages, and value_paths are populated."
			case "living_reality_assessment", "assessment_report":
				priority = "medium"
				hint = "AIM artifact — fix when preparing for post-launch assessment."
			}

			plan = append(plan, fixItem{
				ArtifactKey:  a.ArtifactKey,
				ArtifactType: a.ArtifactType,
				Priority:     priority,
				Errors:       result.Errors,
				FixHint:      hint,
			})
		}

		// Sort by priority: critical > high > medium > low.
		priorityOrder := map[string]int{"critical": 0, "high": 1, "medium": 2, "low": 3}
		for i := 0; i < len(plan); i++ {
			for j := i + 1; j < len(plan); j++ {
				if priorityOrder[plan[j].Priority] < priorityOrder[plan[i].Priority] {
					plan[i], plan[j] = plan[j], plan[i]
				}
			}
		}

		return mustJSON(map[string]any{
			"instance_id":     instID,
			"total_artifacts": len(artifacts),
			"errors_found":    len(plan),
			"fix_plan":        plan,
			"suggestion":      "Work through the fix plan in order — critical items first. Use get_schema to see required fields for each artifact type.",
		})
	})
}

// ---------------------------------------------------------------------------
// get_persona_details — deep persona detail
// ---------------------------------------------------------------------------

// personaDetail holds parsed persona data from strategy_foundations.
type personaDetail struct {
	Name         string `json:"name,omitempty"`
	Description  string `json:"description,omitempty"`
	PainPoints   any    `json:"pain_points,omitempty"`
	JobsToBeDone any    `json:"jobs_to_be_done,omitempty"`
	Behaviors    any    `json:"behaviors,omitempty"`
	Demographics any    `json:"demographics,omitempty"`
	Goals        any    `json:"goals,omitempty"`
	RawData      any    `json:"raw_data,omitempty"`
}

func registerPersonaDetailsTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("get_persona_details",
		mcp.WithDescription("USE WHEN you need deep persona detail including pain points, jobs-to-be-done, and behavioral patterns. Returns parsed persona data from strategy_foundations."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("persona_name", mcp.Description("Optional persona name filter. Omit to return all personas.")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Read the strategy_foundations artifact.
		raw, err := svc.Strategy.GetCurrentArtifact(ctx, instID, "strategy_foundations")
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Parse target_customer and related persona fields.
		var foundations map[string]any
		if err := json.Unmarshal(raw, &foundations); err != nil {
			return toolErr(ctx, apperror.ErrBadRequest.WithDetail("failed to parse strategy_foundations payload")), nil //nolint:nilerr
		}

		// Extract personas from various possible fields.
		personaFilter := strings.ToLower(argString(req, "persona_name"))
		var personas []personaDetail

		// Try target_customer (common EPF structure).
		if tc, ok := foundations["target_customer"]; ok {
			personas = append(personas, extractPersonas(tc, personaFilter)...)
		}
		// Try personas field directly.
		if ps, ok := foundations["personas"]; ok {
			personas = append(personas, extractPersonas(ps, personaFilter)...)
		}
		// Try icp (ideal customer profile).
		if icp, ok := foundations["icp"]; ok {
			if personaFilter == "" || strings.Contains(strings.ToLower(fmt.Sprint(icp)), personaFilter) {
				personas = append(personas, personaDetail{
					Name:    "ICP (Ideal Customer Profile)",
					RawData: icp,
				})
			}
		}

		return mustJSON(map[string]any{
			"instance_id":   instID,
			"persona_count": len(personas),
			"personas":      personas,
			"source":        "strategy_foundations",
		})
	})
}

// extractPersonas extracts persona details from an arbitrary value.
func extractPersonas(v any, nameFilter string) []personaDetail {
	var result []personaDetail

	switch val := v.(type) {
	case []any:
		for _, item := range val {
			if m, ok := item.(map[string]any); ok {
				p := personaDetail{RawData: m}
				if n, ok := m["name"].(string); ok {
					p.Name = n
				}
				if d, ok := m["description"].(string); ok {
					p.Description = d
				}
				p.PainPoints = m["pain_points"]
				p.JobsToBeDone = m["jobs_to_be_done"]
				p.Behaviors = m["behaviors"]
				p.Demographics = m["demographics"]
				p.Goals = m["goals"]
				if nameFilter != "" && !strings.Contains(strings.ToLower(p.Name), nameFilter) {
					continue
				}
				result = append(result, p)
			}
		}
	case map[string]any:
		p := personaDetail{RawData: val}
		if n, ok := val["name"].(string); ok {
			p.Name = n
		}
		if nameFilter != "" && !strings.Contains(strings.ToLower(p.Name), nameFilter) {
			return nil
		}
		p.PainPoints = val["pain_points"]
		p.JobsToBeDone = val["jobs_to_be_done"]
		p.Behaviors = val["behaviors"]
		p.Demographics = val["demographics"]
		p.Goals = val["goals"]
		result = append(result, p)
	}

	return result
}

// ---------------------------------------------------------------------------
// validate_assumptions — check assumption testing coverage
// ---------------------------------------------------------------------------

func registerAssumptionValidationTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("validate_assumptions",
		mcp.WithDescription("USE WHEN you need to check which strategic assumptions have features testing them and which are untested. Returns assumption coverage with risk assessment."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		assumptions, err := svc.Strategy.GetAssumptions(ctx, instID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		type assessedAssumption struct {
			AssumptionKey string   `json:"assumption_key"`
			TestedBy      []string `json:"tested_by"`
			IsTested      bool     `json:"is_tested"`
			Risk          string   `json:"risk"` // "untested" | "partially_tested" | "well_tested"
		}

		var assessed []assessedAssumption
		untestedCount := 0
		for _, a := range assumptions {
			aa := assessedAssumption{
				AssumptionKey: a.AssumptionKey,
				TestedBy:      a.TestedBy,
				IsTested:      len(a.TestedBy) > 0,
			}
			switch {
			case len(a.TestedBy) == 0:
				aa.Risk = "untested"
				untestedCount++
			case len(a.TestedBy) == 1:
				aa.Risk = "partially_tested"
			default:
				aa.Risk = "well_tested"
			}
			assessed = append(assessed, aa)
		}

		return mustJSON(map[string]any{
			"instance_id":       instID,
			"total_assumptions": len(assumptions),
			"untested_count":    untestedCount,
			"assumptions":       assessed,
			"suggestion": func() string {
				if untestedCount > 0 {
					return fmt.Sprintf("%d assumptions have no testing features. Consider creating features that explicitly test these assumptions.", untestedCount)
				}
				return "All assumptions have at least one testing feature."
			}(),
		})
	})
}

// ---------------------------------------------------------------------------
// stage_calibration — stage a calibration memo artifact
// ---------------------------------------------------------------------------

func registerCalibrationTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("stage_calibration",
		mcp.WithDescription("USE WHEN you need to stage a calibration memo after an AIM review. Captures strategic adjustments and lessons learned. Stages a mutation; call commit_batch after review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("artifact_key", mcp.Required(), mcp.Description("Unique calibration key, e.g. cal-2025-q1")),
		mcp.WithString("payload", mcp.Required(), mcp.Description("Calibration memo JSON payload conforming to calibration_memo_schema")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID to group with other staged mutations")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		return stageArtifact(ctx, req, svc.Strategy, argString(req, "artifact_key"), "calibration_memo", "create")
	})
}

// ---------------------------------------------------------------------------
// Relationship write tools
// ---------------------------------------------------------------------------

func registerRelationshipWriteTools(s *server.MCPServer, svc Services) {
	// add_relationship — stage a cross-artifact relationship.
	s.AddTool(mcp.NewTool("add_relationship",
		mcp.WithDescription("USE WHEN you need to create a relationship between two artifacts (contributes_to, depends_on, tests_assumption, enables, in_tracks). Stages a mutation; call commit_batch after review."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("source_key", mcp.Required(), mcp.Description("Source artifact key, e.g. fd-001")),
		mcp.WithString("target_key", mcp.Required(), mcp.Description("Target artifact key, e.g. vm-product/growth")),
		mcp.WithString("relationship", mcp.Required(), mcp.Description("Relationship type: contributes_to, depends_on, tests_assumption, enables, in_tracks, implements")),
		mcp.WithString("target_type", mcp.Description("Target artifact type (e.g. value_path, feature, assumption). Auto-inferred when possible.")),
		mcp.WithString("batch_id", mcp.Description("Optional batch UUID to group with other staged mutations")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		sourceKey := argString(req, "source_key")
		targetKey := argString(req, "target_key")
		relType := argString(req, "relationship")
		targetType := argString(req, "target_type")

		if sourceKey == "" || targetKey == "" || relType == "" {
			return mcp.NewToolResultError("source_key, target_key, and relationship are required"), nil
		}

		validRels := map[string]bool{
			"contributes_to": true, "depends_on": true, "tests_assumption": true,
			"enables": true, "in_tracks": true, "implements": true,
		}
		if !validRels[relType] {
			return mcp.NewToolResultError(fmt.Sprintf("invalid relationship type %q; use one of: contributes_to, depends_on, tests_assumption, enables, in_tracks, implements", relType)), nil
		}

		// Auto-infer target type from relationship if not provided.
		if targetType == "" {
			switch relType {
			case "contributes_to":
				targetType = "value_path"
			case "tests_assumption":
				targetType = "assumption"
			case "depends_on", "enables":
				targetType = "feature"
			case "in_tracks":
				targetType = "track"
			case "implements":
				targetType = "feature"
			}
		}

		// Build relationship payload.
		payload, _ := json.Marshal(map[string]any{
			"relationships": []map[string]any{
				{
					"source_key":   sourceKey,
					"target_key":   targetKey,
					"relationship": relType,
					"target_type":  targetType,
				},
			},
		})

		p := strategy.StageParams{
			InstanceID:   instID,
			ArtifactType: "relationship",
			ArtifactKey:  fmt.Sprintf("rel:%s:%s:%s", sourceKey, relType, targetKey),
			Action:       "create",
			Payload:      json.RawMessage(payload),
		}

		if batchStr := argString(req, "batch_id"); batchStr != "" {
			bID, err := parseUUID(batchStr)
			if err != nil {
				return toolErr(ctx, err), nil
			}
			p.BatchID = &bID
		}

		batchID, err := svc.Strategy.Stage(ctx, p)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"staged":       true,
			"batch_id":     batchID,
			"source_key":   sourceKey,
			"target_key":   targetKey,
			"relationship": relType,
			"target_type":  targetType,
			"note":         "Present this batch_id to the user for review. Call commit_batch only after explicit confirmation.",
		})
	})

	// suggest_relationships — suggest missing relationships for a feature.
	s.AddTool(mcp.NewTool("suggest_relationships",
		mcp.WithDescription("USE WHEN you need to identify missing cross-artifact relationships for a feature — checks value model coverage, assumption testing, and dependency gaps."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("feature_key", mcp.Required(), mcp.Description("Feature artifact key, e.g. fd-001")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID, err := parseUUID(argString(req, "instance_id"))
		if err != nil {
			return toolErr(ctx, err), nil
		}

		featureKey := argString(req, "feature_key")
		if featureKey == "" {
			return mcp.NewToolResultError("feature_key is required"), nil
		}

		// Get current relationships for this feature.
		rels, err := svc.Strategy.ListRelationships(ctx, instID, featureKey)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		// Categorize existing relationships.
		hasContributes := false
		hasAssumption := false
		hasDependency := false
		hasTrack := false
		for _, r := range rels {
			if r.SourceKey != featureKey {
				continue
			}
			switch r.Relationship {
			case "contributes_to":
				hasContributes = true
			case "tests_assumption":
				hasAssumption = true
			case "depends_on":
				hasDependency = true
			case "in_tracks":
				hasTrack = true
			}
		}

		type suggestion struct {
			Type     string `json:"relationship_type"`
			Reason   string `json:"reason"`
			Priority string `json:"priority"`
			Example  string `json:"example_target,omitempty"`
		}

		var suggestions []suggestion

		if !hasContributes {
			suggestions = append(suggestions, suggestion{
				Type:     "contributes_to",
				Reason:   "Feature has no value model contribution. Link to value paths to show strategic alignment.",
				Priority: "high",
				Example:  "vm-product/growth or vm-commercial/revenue",
			})
		}
		if !hasAssumption {
			suggestions = append(suggestions, suggestion{
				Type:     "tests_assumption",
				Reason:   "Feature does not test any strategic assumption. Consider which assumptions this feature validates.",
				Priority: "medium",
			})
		}
		if !hasTrack {
			suggestions = append(suggestions, suggestion{
				Type:     "in_tracks",
				Reason:   "Feature is not assigned to any track. Assign to product, commercial, org_ops, or strategy.",
				Priority: "high",
				Example:  "product",
			})
		}
		_ = hasDependency // Dependencies are optional — don't suggest by default.

		return mustJSON(map[string]any{
			"feature_key":          featureKey,
			"existing_count":       len(rels),
			"suggestion_count":     len(suggestions),
			"suggestions":          suggestions,
			"all_relationships_ok": len(suggestions) == 0,
		})
	})
}

// ---------------------------------------------------------------------------
// discard_scenario — discard a what-if scenario branch
// ---------------------------------------------------------------------------

func registerDiscardScenarioTool(s *server.MCPServer, svc Services) {
	s.AddTool(mcp.NewTool("discard_scenario",
		mcp.WithDescription("USE WHEN you want to discard a what-if scenario branch without merging it. The scenario and its mutations are permanently removed."),
		mcp.WithString("instance_id", mcp.Required(), mcp.Description("Strategy instance UUID")),
		mcp.WithString("scenario_id", mcp.Required(), mcp.Description("Scenario ID returned by run_scenario")),
	), func(ctx context.Context, req mcp.CallToolRequest) (*mcp.CallToolResult, error) {
		instID := argString(req, "instance_id")
		if instID == "" {
			return mcp.NewToolResultError("instance_id is required"), nil
		}
		scenarioID := argString(req, "scenario_id")
		if scenarioID == "" {
			return mcp.NewToolResultError("scenario_id is required"), nil
		}

		if svc.Semantic == nil {
			return toolErr(ctx, apperror.ErrInternal.WithDetail("semantic engine not configured")), nil
		}

		err := svc.Semantic.DiscardScenario(ctx, instID, scenarioID)
		if err != nil {
			return toolErr(ctx, err), nil
		}

		return mustJSON(map[string]any{
			"discarded":   true,
			"scenario_id": scenarioID,
		})
	})
}

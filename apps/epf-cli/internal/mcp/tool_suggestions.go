// Package mcp provides the MCP (Model Context Protocol) server implementation.
// This file contains the centralized tool call suggestion logic that maps
// diagnostic tool results to the next tool(s) agents should call.
//
// This is the core structural fix for the "Heuristic Override" problem:
// instead of relying on agents reading tool descriptions, every diagnostic
// response that finds issues tells the agent exactly what to call next.
package mcp

import (
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/validator"
)

// ToolCallSuggestion represents a suggested next tool call for an agent.
// Diagnostic tools include these in their responses to guide agents
// through the correct EPF workflow instead of relying on pre-training heuristics.
type ToolCallSuggestion struct {
	Tool     string            `json:"tool"`
	Params   map[string]string `json:"params"`
	Reason   string            `json:"reason"`
	Priority string            `json:"priority"` // urgent, recommended, optional
}

// ToolTierInfo represents a discovery tier for agent tool organization.
type ToolTierInfo struct {
	Tier        int      `json:"tier"`
	Label       string   `json:"label"`
	Description string   `json:"description"`
	Tools       []string `json:"tools"`
}

// generateHealthCheckSuggestions maps health check results to tool call suggestions.
// This is the centralized mapping function — all diagnostic-to-tool mappings
// live here so they stay consistent and easy to maintain when tool signatures change.
func generateHealthCheckSuggestions(result *HealthCheckSummary) []ToolCallSuggestion {
	var suggestions []ToolCallSuggestion
	instancePath := result.InstancePath

	// Value Model Quality < 80 → wizard for value model structure
	if result.ValueModelQuality != nil && result.ValueModelQuality.OverallScore < 80 {
		suggestions = append(suggestions, ToolCallSuggestion{
			Tool:     "epf_get_wizard_for_task",
			Params:   map[string]string{"task": "fix value model quality issues"},
			Reason:   fmt.Sprintf("Value model quality score %d/100 is below the 80 threshold — consult the value model wizard before making changes", result.ValueModelQuality.OverallScore),
			Priority: "urgent",
		})
	}

	// Feature Quality < 80% → wizard for feature quality
	if result.FeatureQuality != nil && result.FeatureQuality.AverageScore < 80 {
		suggestions = append(suggestions, ToolCallSuggestion{
			Tool:     "epf_get_wizard_for_task",
			Params:   map[string]string{"task": "review feature quality"},
			Reason:   fmt.Sprintf("Feature quality average score %.0f%% is below the 80%% threshold", result.FeatureQuality.AverageScore),
			Priority: "urgent",
		})
	}

	// Content readiness issues → wizard for completing artifacts
	if result.ContentReadiness != nil && result.ContentReadiness.Score < 80 {
		suggestions = append(suggestions, ToolCallSuggestion{
			Tool:     "epf_get_wizard_for_task",
			Params:   map[string]string{"task": "complete EPF artifacts"},
			Reason:   fmt.Sprintf("Content readiness score %d/100 — placeholder content (TBD/TODO) remains in artifacts", result.ContentReadiness.Score),
			Priority: "recommended",
		})
	}

	// Relationship errors → validate relationships for details
	if result.Relationships != nil && result.Relationships.InvalidPaths > 0 {
		suggestions = append(suggestions, ToolCallSuggestion{
			Tool:     "epf_validate_relationships",
			Params:   map[string]string{"instance_path": instancePath},
			Reason:   fmt.Sprintf("%d invalid contributes_to or KR target path(s) — run relationship validation for details and 'did you mean' suggestions", result.Relationships.InvalidPaths),
			Priority: "recommended",
		})
	}

	// Schema validation failures on specific files → validate with plan
	if result.InstanceCheck != nil && result.InstanceCheck.Failed > 0 {
		for _, r := range result.InstanceCheck.Results {
			if !r.Passed && r.Path != "" {
				suggestions = append(suggestions, ToolCallSuggestion{
					Tool:     "epf_validate_with_plan",
					Params:   map[string]string{"path": r.Path},
					Reason:   fmt.Sprintf("Schema validation failed: %s", r.Message),
					Priority: "recommended",
				})
				break // Only suggest for first failing file to avoid overwhelming the agent
			}
		}
	}

	// AIM health critical diagnostics → appropriate AIM tool
	if result.AIMHealth != nil {
		for _, d := range result.AIMHealth.Diagnostics {
			if d.Severity == "critical" {
				switch {
				case strings.Contains(d.Category, "lra") || strings.Contains(d.Title, "Living Reality Assessment"):
					suggestions = append(suggestions, ToolCallSuggestion{
						Tool:     "epf_aim_bootstrap",
						Params:   map[string]string{"instance_path": instancePath},
						Reason:   fmt.Sprintf("AIM diagnostic: %s — create or update the Living Reality Assessment", d.Title),
						Priority: "recommended",
					})
				case strings.Contains(d.Category, "assessment"):
					suggestions = append(suggestions, ToolCallSuggestion{
						Tool:     "epf_aim_assess",
						Params:   map[string]string{"instance_path": instancePath},
						Reason:   fmt.Sprintf("AIM diagnostic: %s", d.Title),
						Priority: "optional",
					})
				}
				break // Only one AIM suggestion
			}
		}
	}

	return suggestions
}

// classifyStructuralErrors determines whether validation errors are structural
// (requiring wizard consultation) or surface-level (fixable directly).
//
// Structural errors indicate the agent misunderstands EPF architecture — e.g.,
// wrong L1/L2/L3 organization, anti-pattern violations, completely wrong artifact
// structure. These require consulting a wizard before attempting fixes.
//
// Surface errors indicate the agent understands the structure but made localized
// mistakes — typos, missing fields, wrong enum values. These can be fixed directly.
func classifyStructuralErrors(aiResult *validator.AIFriendlyResult) (isStructural bool, suggestion *ToolCallSuggestion) {
	if aiResult == nil || aiResult.Valid || aiResult.ErrorCount == 0 {
		return false, nil
	}

	typeMismatches := 0
	topLevelTypeMismatches := 0

	for _, section := range aiResult.ErrorsBySection {
		for _, e := range section.Errors {
			if e.ErrorType == validator.ErrorTypeMismatch {
				typeMismatches++
				// Top-level = 0 or 1 dots in the path (ignoring array indices)
				depth := strings.Count(e.Path, ".")
				if depth <= 1 {
					topLevelTypeMismatches++
				}
			}
		}
	}

	criticalCount := aiResult.Summary.CriticalCount

	// Heuristic 1: Type mismatches on top-level sections → structural
	if topLevelTypeMismatches > 0 {
		isStructural = true
	}

	// Heuristic 2: High error count with many critical errors → structural
	if aiResult.ErrorCount > 20 && criticalCount > 5 {
		isStructural = true
	}

	// Heuristic 3: Very high critical count alone → structural
	if criticalCount > 10 {
		isStructural = true
	}

	if isStructural {
		artifactType := aiResult.ArtifactType
		if artifactType == "" {
			artifactType = "EPF artifact"
		}
		suggestion = &ToolCallSuggestion{
			Tool:   "epf_get_wizard_for_task",
			Params: map[string]string{"task": fmt.Sprintf("fix %s structure", artifactType)},
			Reason: fmt.Sprintf(
				"Structural issues detected (%d critical errors, %d type mismatches in %d total errors). "+
					"Do NOT brute-force these fixes — consult the wizard first to understand the correct structure.",
				criticalCount, typeMismatches, aiResult.ErrorCount),
			Priority: "urgent",
		}
	}

	return isStructural, suggestion
}

// getToolTiers returns the three-tier tool organization for agent instructions.
func getToolTiers() []ToolTierInfo {
	return []ToolTierInfo{
		{
			Tier:  1,
			Label: "Essential",
			Description: "Entry points — always start here. These 3 tools are the only ones you need to begin any EPF workflow. " +
				"Their responses will guide you to the right Tier 2 or Tier 3 tools via required_next_tool_calls.",
			Tools: []string{"epf_health_check", "epf_get_wizard_for_task", "epf_validate_file"},
		},
		{
			Tier:  2,
			Label: "Guided",
			Description: "Use after Tier 1 directs you here, or when querying strategy context. " +
				"These tools provide templates, schemas, wizard content, and strategic information.",
			Tools: []string{
				"epf_get_wizard", "epf_get_template", "epf_get_schema",
				"epf_validate_with_plan", "epf_validate_section", "epf_get_section_example",
				"epf_get_product_vision", "epf_get_personas", "epf_get_persona_details",
				"epf_get_roadmap_summary", "epf_search_strategy",
				"epf_get_competitive_position", "epf_get_value_propositions",
				"epf_get_feature_strategy_context",
				"epf_recommend_reviews", "epf_review_strategic_coherence",
				"epf_review_feature_quality", "epf_review_value_model",
			},
		},
		{
			Tier:  3,
			Label: "Specialized",
			Description: "Use for specific tasks as needed. All tools remain available — " +
				"tiers indicate recommended workflow order, not access control.",
			Tools: []string{
				"epf_list_schemas", "epf_validate_content", "epf_detect_artifact_type",
				"epf_get_phase_artifacts", "epf_list_artifacts",
				"epf_check_instance", "epf_check_content_readiness", "epf_check_feature_quality",
				"epf_batch_validate", "epf_check_migration_status", "epf_get_migration_guide",
				"epf_list_definitions", "epf_get_definition",
				"epf_list_features", "epf_check_generator_prereqs",
				"epf_explain_value_path", "epf_get_strategic_context", "epf_analyze_coverage",
				"epf_validate_relationships", "epf_suggest_relationships",
				"epf_add_implementation_reference", "epf_update_capability_maturity",
				"epf_add_mapping_artifact", "epf_rename_value_path", "epf_update_kr",
				"epf_add_value_model_component", "epf_add_value_model_sub",
				"epf_diff_artifacts", "epf_diff_template",
				"epf_generate_report", "epf_fix_file",
				"epf_init_instance", "epf_sync_canonical", "epf_migrate_definitions",
				"epf_list_generators", "epf_get_generator", "epf_scaffold_generator",
				"epf_list_wizards",
				"epf_list_agent_instructions", "epf_get_agent_instructions",
				"epf_agent_instructions", "epf_locate_instance", "epf_reload_instance",
				"epf_aim_bootstrap", "epf_aim_status", "epf_aim_assess",
				"epf_aim_validate_assumptions", "epf_aim_okr_progress",
				"epf_aim_health", "epf_aim_update_lra", "epf_aim_init_cycle",
				"epf_aim_archive_cycle", "epf_aim_generate_src",
				"epf_aim_write_assessment", "epf_aim_write_calibration", "epf_aim_write_src",
				"epf_aim_recalibrate",
			},
		},
	}
}

// toolTierForName returns the tier string for a given tool name.
func toolTierForName(name string) string {
	tiers := getToolTiers()
	for _, tier := range tiers {
		for _, tool := range tier.Tools {
			if tool == name {
				return tier.Label
			}
		}
	}
	return "specialized" // default
}

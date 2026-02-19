package mcp

import (
	"context"
	"encoding/json"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// AIM RECALIBRATE TOOL
// =============================================================================

func (s *Server) handleAimRecalibrate(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	applyStr, _ := request.RequireString("apply")
	apply := applyStr == "true"

	noSRCStr, _ := request.RequireString("no_src")
	noSRC := noSRCStr == "true"

	// Load calibration memo
	var memo *aim.CalibrationMemo
	memo, err := aim.LoadCalibrationMemo(instancePath)
	if err != nil {
		memo = nil
	}

	// Load SRC
	var src *aim.StrategicRealityCheck
	if !noSRC {
		src, err = aim.LoadStrategicRealityCheck(instancePath)
		if err != nil {
			src = nil
		}
	}

	if memo == nil && src == nil {
		result := map[string]interface{}{
			"success": false,
			"error":   "No calibration memo or SRC found. At least one is required. Run epf_aim_write_calibration or epf_aim_generate_src first.",
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	// Generate changeset
	changeset, err := aim.GenerateRecalibrationChangeset(instancePath, memo, src)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	// Apply if requested
	if apply {
		if err := aim.ApplyRecalibration(instancePath, changeset, "mcp-tool"); err != nil {
			result := map[string]interface{}{
				"success": false,
				"error":   err.Error(),
			}
			data, _ := json.Marshal(result)
			return mcp.NewToolResultText(string(data)), nil
		}
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"applied":       apply,
		"changeset":     changeset,
		"report":        aim.FormatChangesetReport(changeset),
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM HEALTH TOOL
// =============================================================================

func (s *Server) handleAimHealth(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	report, err := aim.RunHealthDiagnostics(instancePath)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":             true,
		"instance_path":       instancePath,
		"overall_status":      report.OverallStatus,
		"summary":             report.Summary,
		"diagnostics":         report.Diagnostics,
		"report":              aim.FormatHealthReport(report),
		"review_wizards_hint": "For deeper semantic quality evaluation, use epf_recommend_reviews or epf_get_wizard with: strategic_coherence_review, feature_quality_review, value_model_review",
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

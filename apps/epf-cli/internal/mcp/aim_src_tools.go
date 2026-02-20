package mcp

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// AIM GENERATE SRC TOOL
// =============================================================================

func (s *Server) handleAimGenerateSRC(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	cycleStr, _ := request.RequireString("cycle")
	cycle := 1
	if cycleStr != "" {
		if _, err := fmt.Sscanf(cycleStr, "%d", &cycle); err != nil {
			return mcp.NewToolResultText(`{"success": false, "error": "Invalid cycle number, must be a positive integer"}`), nil
		}
	}
	if cycle < 1 {
		return mcp.NewToolResultText(`{"success": false, "error": "Cycle number must be >= 1"}`), nil
	}

	src, err := aim.GenerateSRC(instancePath, cycle)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	// Write to AIM directory
	outputPath, err := aim.WriteStrategicRealityCheck(instancePath, src)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	// Invalidate caches after writing SRC
	s.invalidateInstanceCaches(instancePath)

	result := map[string]interface{}{
		"success":             true,
		"instance_path":       instancePath,
		"output_path":         outputPath,
		"cycle":               src.Cycle,
		"overall_health":      src.Summary.OverallHealth,
		"finding_counts":      src.Summary.FindingCounts,
		"mechanical_checks":   "complete",
		"subjective_sections": "TODO — use epf_aim_write_src to fill in belief validity evidence and market changes",
		"message":             "Strategic Reality Check generated successfully",
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM WRITE SRC TOOL
// =============================================================================

func (s *Server) handleAimWriteSRC(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	content, _ := request.RequireString("content")
	if content == "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Required parameter 'content' not provided. Pass SRC YAML content."}`), nil
	}

	var src aim.StrategicRealityCheck
	if err := yaml.Unmarshal([]byte(content), &src); err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Failed to parse SRC YAML: %v", err),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	outputPath, err := aim.WriteStrategicRealityCheck(instancePath, &src)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	// Invalidate caches after writing SRC
	s.invalidateInstanceCaches(instancePath)

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"cycle":         src.Cycle,
		"message":       "Strategic Reality Check written successfully",
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

package mcp

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/aim"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// AIM UPDATE LRA TOOL
// =============================================================================

func (s *Server) handleAimUpdateLRA(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	// Build the update from params
	update := &aim.LRAUpdate{}
	hasUpdate := false

	if v, _ := request.RequireString("primary_track"); v != "" {
		update.PrimaryTrack = &v
		hasUpdate = true
	}
	if v, _ := request.RequireString("secondary_track"); v != "" {
		update.SecondaryTrack = &v
		hasUpdate = true
	}
	if v, _ := request.RequireString("primary_objective"); v != "" {
		update.PrimaryObjective = &v
		hasUpdate = true
	}
	if v, _ := request.RequireString("cycle_reference"); v != "" {
		update.CycleReference = &v
		hasUpdate = true
	}
	if v, _ := request.RequireString("lifecycle_stage"); v != "" {
		update.LifecycleStage = &v
		hasUpdate = true
	}

	trigger, _ := request.RequireString("trigger")
	summary, _ := request.RequireString("summary")
	if trigger != "" && summary != "" {
		update.Trigger = trigger
		update.Summary = summary
		hasUpdate = true
	} else if trigger != "" || summary != "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Both 'trigger' and 'summary' must be provided together"}`), nil
	}

	updatedBy, _ := request.RequireString("updated_by")
	if updatedBy == "" {
		updatedBy = "mcp-agent"
	}

	if !hasUpdate {
		return mcp.NewToolResultText(`{"success": false, "error": "No updates specified. Provide at least one field to update."}`), nil
	}

	if err := aim.ApplyLRAUpdate(instancePath, update, updatedBy); err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"updated_by":    updatedBy,
		"message":       "LRA updated successfully",
	}
	if trigger != "" {
		result["evolution_log_appended"] = true
		result["trigger"] = trigger
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM WRITE ASSESSMENT TOOL
// =============================================================================

func (s *Server) handleAimWriteAssessment(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	content, _ := request.RequireString("content")
	if content == "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Required parameter 'content' not provided. Pass assessment report YAML content."}`), nil
	}

	var report aim.AssessmentReport
	if err := yaml.Unmarshal([]byte(content), &report); err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Failed to parse assessment YAML: %v", err),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	outputPath, err := aim.WriteAssessmentReport(instancePath, &report)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"roadmap_id":    report.RoadmapID,
		"cycle":         report.Cycle,
		"message":       "Assessment report written successfully",
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM WRITE CALIBRATION TOOL
// =============================================================================

func (s *Server) handleAimWriteCalibration(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	content, _ := request.RequireString("content")
	if content == "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Required parameter 'content' not provided. Pass calibration memo YAML content."}`), nil
	}

	var memo aim.CalibrationMemo
	if err := yaml.Unmarshal([]byte(content), &memo); err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   fmt.Sprintf("Failed to parse calibration YAML: %v", err),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	outputPath, err := aim.WriteCalibrationMemo(instancePath, &memo)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"output_path":   outputPath,
		"roadmap_id":    memo.RoadmapID,
		"cycle":         memo.Cycle,
		"decision":      memo.Decision,
		"message":       "Calibration memo written successfully",
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM INIT CYCLE TOOL
// =============================================================================

func (s *Server) handleAimInitCycle(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	cycleStr, _ := request.RequireString("cycle_number")
	if cycleStr == "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Required parameter 'cycle_number' not provided"}`), nil
	}
	var cycleNumber int
	fmt.Sscanf(cycleStr, "%d", &cycleNumber)
	if cycleNumber < 1 {
		return mcp.NewToolResultText(`{"success": false, "error": "cycle_number must be a positive integer"}`), nil
	}

	archiveStr, _ := request.RequireString("archive_previous")
	archivePrevious := strings.ToLower(archiveStr) == "true"

	updatedBy, _ := request.RequireString("updated_by")
	if updatedBy == "" {
		updatedBy = "mcp-agent"
	}

	if err := aim.InitCycle(instancePath, cycleNumber, archivePrevious, updatedBy); err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":           true,
		"instance_path":     instancePath,
		"new_cycle":         cycleNumber,
		"cycle_reference":   fmt.Sprintf("C%d", cycleNumber),
		"archived_previous": archivePrevious,
		"updated_by":        updatedBy,
		"message":           fmt.Sprintf("Cycle %d initialized successfully", cycleNumber),
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

// =============================================================================
// AIM ARCHIVE CYCLE TOOL
// =============================================================================

func (s *Server) handleAimArchiveCycle(ctx context.Context, request mcp.CallToolRequest) (*mcp.CallToolResult, error) {
	instancePath, _ := request.RequireString("instance_path")
	if instancePath == "" {
		instancePath = "."
	}

	cycleStr, _ := request.RequireString("cycle_number")
	if cycleStr == "" {
		return mcp.NewToolResultText(`{"success": false, "error": "Required parameter 'cycle_number' not provided"}`), nil
	}
	var cycleNumber int
	fmt.Sscanf(cycleStr, "%d", &cycleNumber)
	if cycleNumber < 1 {
		return mcp.NewToolResultText(`{"success": false, "error": "cycle_number must be a positive integer"}`), nil
	}

	archiveDir, err := aim.ArchiveCycle(instancePath, cycleNumber)
	if err != nil {
		result := map[string]interface{}{
			"success": false,
			"error":   err.Error(),
		}
		data, _ := json.Marshal(result)
		return mcp.NewToolResultText(string(data)), nil
	}

	result := map[string]interface{}{
		"success":       true,
		"instance_path": instancePath,
		"cycle":         cycleNumber,
		"archive_dir":   archiveDir,
		"message":       fmt.Sprintf("Cycle %d archived successfully", cycleNumber),
	}
	data, _ := json.MarshalIndent(result, "", "  ")
	return mcp.NewToolResultText(string(data)), nil
}

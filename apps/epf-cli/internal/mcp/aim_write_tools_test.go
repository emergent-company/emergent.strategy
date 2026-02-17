package mcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/lra"
	"github.com/mark3labs/mcp-go/mcp"
	"gopkg.in/yaml.v3"
)

// =============================================================================
// HELPERS
// =============================================================================

// createMCPTestInstance creates a minimal EPF instance with an LRA for testing.
func createMCPTestInstance(t *testing.T) (string, *Server) {
	t.Helper()

	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	dir := t.TempDir()
	os.MkdirAll(filepath.Join(dir, "AIM"), 0755)
	os.MkdirAll(filepath.Join(dir, "READY"), 0755)

	// Write a minimal LRA
	assessment := &lra.LivingRealityAssessment{
		Metadata: lra.Metadata{
			LifecycleStage:  "bootstrap",
			CyclesCompleted: 0,
			AdoptionLevel:   1,
		},
		AdoptionContext: lra.AdoptionContext{
			OrganizationType: "solo_founder",
			FundingStage:     "bootstrapped",
			TeamSize:         1,
		},
		TrackBaselines: map[string]lra.TrackBaseline{
			"product":    {Maturity: "implicit", Status: "emerging"},
			"strategy":   {Maturity: "absent", Status: "not_started"},
			"org_ops":    {Maturity: "absent", Status: "not_applicable"},
			"commercial": {Maturity: "absent", Status: "not_started"},
		},
		CurrentFocus: lra.CurrentFocus{
			CycleReference:   "C1",
			PrimaryTrack:     "product",
			PrimaryObjective: "Build MVP",
		},
		EvolutionLog: []lra.EvolutionEntry{
			{
				CycleReference: "bootstrap",
				Trigger:        "bootstrap_complete",
				Summary:        "Initial LRA",
				Changes: []lra.ChangeDetail{
					{Section: "metadata", Field: "lifecycle_stage", ChangeType: "created"},
				},
			},
		},
	}

	data, _ := yaml.Marshal(assessment)
	os.WriteFile(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"), data, 0644)

	return dir, server
}

// parseMCPResult parses the JSON response from an MCP tool call.
func parseMCPResult(t *testing.T, result *mcp.CallToolResult) map[string]interface{} {
	t.Helper()
	text := getResultText(result)
	var parsed map[string]interface{}
	if err := json.Unmarshal([]byte(text), &parsed); err != nil {
		t.Fatalf("Failed to parse MCP result JSON: %v\nContent: %s", err, text)
	}
	return parsed
}

// =============================================================================
// UPDATE LRA TESTS
// =============================================================================

func TestHandleAimUpdateLRA_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path":     dir,
		"primary_objective": "Ship cloud server",
		"lifecycle_stage":   "maturing",
		"trigger":           "aim_signals",
		"summary":           "Updated after assessment",
		"updated_by":        "test-agent",
	}

	result, err := server.handleAimUpdateLRA(ctx, request)
	if err != nil {
		t.Fatalf("handleAimUpdateLRA failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Verify LRA was actually updated
	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}
	if loaded.CurrentFocus.PrimaryObjective != "Ship cloud server" {
		t.Errorf("objective not updated: %s", loaded.CurrentFocus.PrimaryObjective)
	}
	if loaded.Metadata.LifecycleStage != "maturing" {
		t.Errorf("lifecycle_stage not updated: %s", loaded.Metadata.LifecycleStage)
	}
	if len(loaded.EvolutionLog) != 2 {
		t.Errorf("expected 2 evolution entries, got %d", len(loaded.EvolutionLog))
	}
}

func TestHandleAimUpdateLRA_MissingTriggerWithSummary(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"summary":       "Missing trigger",
	}

	result, err := server.handleAimUpdateLRA(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when trigger missing but summary provided")
	}
}

func TestHandleAimUpdateLRA_NoUpdates(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimUpdateLRA(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when no updates specified")
	}
}

// =============================================================================
// WRITE ASSESSMENT TESTS
// =============================================================================

func TestHandleAimWriteAssessment_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	assessmentYAML := `roadmap_id: roadmap-q1
cycle: 1
okr_assessments:
  - okr_id: okr-p-001
    assessment: "Good progress on product track"
    key_result_outcomes:
      - kr_id: kr-p-001
        target: "MVP live"
        actual: "MVP shipped"
        status: met`

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"content":       assessmentYAML,
	}

	result, err := server.handleAimWriteAssessment(ctx, request)
	if err != nil {
		t.Fatalf("handleAimWriteAssessment failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Verify file was written
	outputPath := filepath.Join(dir, "AIM", "assessment_report.yaml")
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Error("expected assessment_report.yaml to be created")
	}
}

func TestHandleAimWriteAssessment_MissingContent(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimWriteAssessment(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when content missing")
	}
}

// =============================================================================
// WRITE CALIBRATION TESTS
// =============================================================================

func TestHandleAimWriteCalibration_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	calibrationYAML := `roadmap_id: roadmap-q1
cycle: 1
decision: persevere
confidence: high
reasoning: "Strong user signal, on track"
learnings:
  validated_assumptions:
    - "AI features validated by user interviews"
  invalidated_assumptions: []
  surprises:
    - "Onboarding needs improvement based on drop-off data"
next_cycle_focus:
  continue_building:
    - "Core AI pipeline showing strong engagement"
  stop_building: []
  start_exploring: []
next_ready_inputs:
  opportunity_update: "Market opportunity confirmed through early traction"
  strategy_update: "Focus shifting to retention over acquisition"
  new_assumptions: []
next_steps:
  - "Review roadmap priorities for next cycle"`

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"content":       calibrationYAML,
	}

	result, err := server.handleAimWriteCalibration(ctx, request)
	if err != nil {
		t.Fatalf("handleAimWriteCalibration failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if parsed["decision"] != "persevere" {
		t.Errorf("expected decision 'persevere', got %v", parsed["decision"])
	}

	// Verify file
	outputPath := filepath.Join(dir, "AIM", "calibration_memo.yaml")
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Error("expected calibration_memo.yaml to be created")
	}
}

// =============================================================================
// INIT CYCLE TESTS
// =============================================================================

func TestHandleAimInitCycle_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path":    dir,
		"cycle_number":     "2",
		"archive_previous": "false",
		"updated_by":       "test-agent",
	}

	result, err := server.handleAimInitCycle(ctx, request)
	if err != nil {
		t.Fatalf("handleAimInitCycle failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if parsed["cycle_reference"] != "C2" {
		t.Errorf("expected cycle_reference 'C2', got %v", parsed["cycle_reference"])
	}

	// Verify LRA was updated
	loaded, err := lra.LoadOrError(dir)
	if err != nil {
		t.Fatalf("reload LRA: %v", err)
	}
	if loaded.CurrentFocus.CycleReference != "C2" {
		t.Errorf("LRA cycle_reference not updated: %s", loaded.CurrentFocus.CycleReference)
	}
}

func TestHandleAimInitCycle_MissingCycleNumber(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimInitCycle(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when cycle_number missing")
	}
}

// =============================================================================
// ARCHIVE CYCLE TESTS
// =============================================================================

func TestHandleAimArchiveCycle_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Write an assessment report to archive
	assessmentData, _ := yaml.Marshal(map[string]interface{}{
		"roadmap_id": "roadmap-q1",
		"cycle":      1,
	})
	os.WriteFile(filepath.Join(dir, "AIM", "assessment_report.yaml"), assessmentData, 0644)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle_number":  "1",
	}

	result, err := server.handleAimArchiveCycle(ctx, request)
	if err != nil {
		t.Fatalf("handleAimArchiveCycle failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Verify archive directory
	archiveDir := filepath.Join(dir, "AIM", "cycles", "cycle-1")
	if _, err := os.Stat(archiveDir); os.IsNotExist(err) {
		t.Error("expected archive directory to be created")
	}
}

func TestHandleAimArchiveCycle_NoArtifacts(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Delete the LRA so there's nothing to archive
	os.Remove(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"))

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle_number":  "1",
	}

	result, err := server.handleAimArchiveCycle(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when no artifacts to archive")
	}
}

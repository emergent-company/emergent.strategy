package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// RECALIBRATE TOOL TESTS
// =============================================================================

func TestHandleAimRecalibrate_NoInputs(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimRecalibrate(ctx, request)
	if err != nil {
		t.Fatalf("handleAimRecalibrate failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Errorf("expected success=false when no memo or SRC, got: %v", parsed["success"])
	}
}

func TestHandleAimRecalibrate_WithMemo(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Write a calibration memo
	memoContent := `roadmap_id: test-roadmap
cycle: 1
decision: persevere
confidence: high
reasoning: Strong execution results
learnings:
  validated_assumptions:
    - "Users want AI-powered features"
  invalidated_assumptions:
    - "Enterprise is primary market"
  surprises:
    - "Solo developers are most engaged"
next_cycle_focus:
  continue_building:
    - "Knowledge graph engine"
  stop_building:
    - "Admin dashboard"
  start_exploring:
    - "CLI interface"
next_ready_inputs:
  opportunity_update: "Shift focus to developer tools"
  strategy_update: "Update competitive positioning for solo dev market"
  new_assumptions:
    - "Developers prefer CLI over GUI"
next_steps:
  - "Ship developer CLI v1.0"
  - "Run developer user interviews"
`
	os.WriteFile(filepath.Join(dir, "AIM", "calibration_memo.yaml"), []byte(memoContent), 0644)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimRecalibrate(ctx, request)
	if err != nil {
		t.Fatalf("handleAimRecalibrate failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if parsed["applied"] != false {
		t.Error("expected applied=false for dry-run")
	}

	// Check changeset exists
	changeset, ok := parsed["changeset"].(map[string]interface{})
	if !ok {
		t.Fatal("expected changeset in result")
	}

	meta, ok := changeset["meta"].(map[string]interface{})
	if !ok {
		t.Fatal("expected meta in changeset")
	}
	if meta["decision"] != "persevere" {
		t.Errorf("expected decision=persevere, got %v", meta["decision"])
	}

	// Check that changes exist
	changes, ok := changeset["changes"].([]interface{})
	if !ok || len(changes) == 0 {
		t.Error("expected non-empty changes array")
	}

	// Check report is present
	if parsed["report"] == nil || parsed["report"] == "" {
		t.Error("expected report in result")
	}
}

func TestHandleAimRecalibrate_WithSRC(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Write an SRC
	srcContent := `cycle: 1
assessment_date: "2025-02-17"
belief_validity: []
market_currency: []
strategic_alignment: []
execution_reality: []
recalibration_plan:
  - id: src-ra-001
    target_artifact: "READY/01_insight_analyses.yaml"
    target_section: "competitive_landscape"
    action: update
    priority: high
    rationale: "Competitive landscape data is 6 months stale"
    effort_estimate: "2 hours"
  - id: src-ra-002
    target_artifact: "READY/04_strategy_formula.yaml"
    target_section: "risks"
    action: review
    priority: medium
    rationale: "Risk monitoring directives have not been evaluated"
summary:
  overall_health: attention_needed
`
	os.WriteFile(filepath.Join(dir, "AIM", "strategic_reality_check.yaml"), []byte(srcContent), 0644)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimRecalibrate(ctx, request)
	if err != nil {
		t.Fatalf("handleAimRecalibrate failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	changeset := parsed["changeset"].(map[string]interface{})
	meta := changeset["meta"].(map[string]interface{})
	if meta["source_src"] != true {
		t.Error("expected source_src=true")
	}

	changes := changeset["changes"].([]interface{})
	if len(changes) != 2 {
		t.Errorf("expected 2 changes from SRC, got %d", len(changes))
	}
}

func TestHandleAimRecalibrate_Apply(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Write a calibration memo
	memoContent := `roadmap_id: test-roadmap
cycle: 1
decision: pivot
confidence: medium
reasoning: Market shifted
learnings:
  validated_assumptions: []
  invalidated_assumptions: []
  surprises: []
next_cycle_focus:
  continue_building: []
  stop_building: []
  start_exploring: []
next_ready_inputs:
  opportunity_update: ""
  strategy_update: ""
  new_assumptions: []
next_steps:
  - "Redesign strategy"
`
	os.WriteFile(filepath.Join(dir, "AIM", "calibration_memo.yaml"), []byte(memoContent), 0644)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"apply":         "true",
	}

	result, err := server.handleAimRecalibrate(ctx, request)
	if err != nil {
		t.Fatalf("handleAimRecalibrate failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if parsed["applied"] != true {
		t.Error("expected applied=true when apply flag is set")
	}
}

func TestHandleAimRecalibrate_NoSRC(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Write both memo and SRC
	memoContent := `roadmap_id: test
cycle: 1
decision: persevere
reasoning: ok
learnings:
  validated_assumptions: []
  invalidated_assumptions: []
  surprises: []
next_cycle_focus:
  continue_building: []
  stop_building: []
  start_exploring: []
next_ready_inputs:
  opportunity_update: "test update"
  strategy_update: ""
  new_assumptions: []
next_steps: []
`
	os.WriteFile(filepath.Join(dir, "AIM", "calibration_memo.yaml"), []byte(memoContent), 0644)

	srcContent := `cycle: 1
recalibration_plan:
  - id: src-ra-001
    target_artifact: "READY/01.yaml"
    action: update
    priority: high
summary:
  overall_health: attention_needed
`
	os.WriteFile(filepath.Join(dir, "AIM", "strategic_reality_check.yaml"), []byte(srcContent), 0644)

	// With no_src=true, SRC should be ignored
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"no_src":        "true",
	}

	result, err := server.handleAimRecalibrate(ctx, request)
	if err != nil {
		t.Fatalf("handleAimRecalibrate failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	changeset := parsed["changeset"].(map[string]interface{})
	meta := changeset["meta"].(map[string]interface{})
	if meta["source_src"] != false {
		t.Error("expected source_src=false when no_src=true")
	}
	if meta["source_memo"] != true {
		t.Error("expected source_memo=true")
	}
}

// =============================================================================
// HEALTH TOOL TESTS
// =============================================================================

func TestHandleAimHealth_EmptyInstance(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Remove the LRA to test missing LRA detection
	os.Remove(filepath.Join(dir, "AIM", "living_reality_assessment.yaml"))

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimHealth(ctx, request)
	if err != nil {
		t.Fatalf("handleAimHealth failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Should detect missing LRA
	if parsed["overall_status"] != "critical" {
		t.Errorf("expected overall_status=critical for missing LRA, got %v", parsed["overall_status"])
	}

	diagnostics, ok := parsed["diagnostics"].([]interface{})
	if !ok || len(diagnostics) == 0 {
		t.Error("expected non-empty diagnostics")
	}
}

func TestHandleAimHealth_HealthyInstance(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Create FIRE directories
	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimHealth(ctx, request)
	if err != nil {
		t.Fatalf("handleAimHealth failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Report should be present
	if parsed["report"] == nil || parsed["report"] == "" {
		t.Error("expected report in result")
	}
}

func TestHandleAimHealth_WithSRCFindings(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	os.MkdirAll(filepath.Join(dir, "FIRE", "feature_definitions"), 0755)

	// Write an SRC with critical health
	srcContent := `cycle: 1
belief_validity: []
market_currency: []
strategic_alignment: []
execution_reality: []
recalibration_plan:
  - id: src-ra-001
    target_artifact: "READY/01.yaml"
    target_section: "comp"
    action: rewrite
    priority: critical
    rationale: "Completely stale"
    effort_estimate: "4 hours"
summary:
  overall_health: critical
  finding_counts:
    belief_validity: 0
    market_currency: 3
    strategic_alignment: 2
    execution_reality: 1
    recalibration_actions: 1
`
	os.WriteFile(filepath.Join(dir, "AIM", "strategic_reality_check.yaml"), []byte(srcContent), 0644)

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimHealth(ctx, request)
	if err != nil {
		t.Fatalf("handleAimHealth failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Should surface SRC findings
	diagnostics := parsed["diagnostics"].([]interface{})
	srcFindingFound := false
	for _, d := range diagnostics {
		diag := d.(map[string]interface{})
		if diag["category"] == "src_findings" {
			srcFindingFound = true
		}
	}
	if !srcFindingFound {
		t.Error("expected src_findings diagnostics to be surfaced")
	}
}

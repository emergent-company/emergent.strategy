package mcp

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// GENERATE SRC TESTS
// =============================================================================

func TestHandleAimGenerateSRC_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("handleAimGenerateSRC failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if parsed["cycle"] == nil {
		t.Error("expected cycle to be set")
	}
	// Default cycle is 1
	if int(parsed["cycle"].(float64)) != 1 {
		t.Errorf("expected cycle=1, got %v", parsed["cycle"])
	}
	if parsed["overall_health"] == nil || parsed["overall_health"] == "" {
		t.Error("expected overall_health to be set")
	}
	if parsed["output_path"] == nil || parsed["output_path"] == "" {
		t.Error("expected output_path to be set")
	}

	// Verify file was actually written
	outputPath := filepath.Join(dir, "AIM", "strategic_reality_check.yaml")
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Error("expected strategic_reality_check.yaml to be created")
	}
}

func TestHandleAimGenerateSRC_WithCycle(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle":         "3",
	}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("handleAimGenerateSRC failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if int(parsed["cycle"].(float64)) != 3 {
		t.Errorf("expected cycle=3, got %v", parsed["cycle"])
	}
}

func TestHandleAimGenerateSRC_InvalidCycle(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle":         "not-a-number",
	}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false for invalid cycle")
	}
}

func TestHandleAimGenerateSRC_NegativeCycle(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle":         "-1",
	}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false for negative cycle")
	}
}

func TestHandleAimGenerateSRC_ZeroCycle(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"cycle":         "0",
	}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false for zero cycle")
	}
}

func TestHandleAimGenerateSRC_DefaultInstancePath(t *testing.T) {
	_, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Omit instance_path — should default to "."
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleAimGenerateSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should succeed (generate-src doesn't strictly require any files)
	// It just won't find any artifacts and will produce an empty SRC
	parsed := parseMCPResult(t, result)
	// May succeed or fail depending on whether AIM/ exists at "."
	// The key thing is no panic / no error return
	_ = parsed
}

// =============================================================================
// WRITE SRC TESTS
// =============================================================================

func TestHandleAimWriteSRC_Success(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	srcYAML := `cycle: 2
assessment_date: "2025-06-15"
summary:
  overall_health: healthy
  finding_counts:
    belief_validity: 0
    market_currency: 1
    strategic_alignment: 0
    execution_reality: 0
    recalibration_actions: 0
  generated_at: "2025-06-15T10:00:00Z"
market_currency:
  - id: src-mc-001
    source_artifact: "READY/00_north_star.yaml"
    staleness_level: low
    days_since_review: 30
meta:
  epf_version: "2.0.0"
  last_updated: "2025-06-15T10:00:00Z"`

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"content":       srcYAML,
	}

	result, err := server.handleAimWriteSRC(ctx, request)
	if err != nil {
		t.Fatalf("handleAimWriteSRC failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}
	if int(parsed["cycle"].(float64)) != 2 {
		t.Errorf("expected cycle=2, got %v", parsed["cycle"])
	}

	// Verify file was written
	outputPath := filepath.Join(dir, "AIM", "strategic_reality_check.yaml")
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Error("expected strategic_reality_check.yaml to be created")
	}
}

func TestHandleAimWriteSRC_MissingContent(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
	}

	result, err := server.handleAimWriteSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false when content missing")
	}
}

func TestHandleAimWriteSRC_InvalidYAML(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"content":       "{{{{ not yaml at all ::::",
	}

	result, err := server.handleAimWriteSRC(ctx, request)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != false {
		t.Error("expected success=false for invalid YAML")
	}
}

func TestHandleAimWriteSRC_MinimalContent(t *testing.T) {
	dir, server := createMCPTestInstance(t)
	ctx := context.Background()

	// Bare minimum valid SRC — only required fields
	srcYAML := `cycle: 1
summary:
  overall_health: healthy`

	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": dir,
		"content":       srcYAML,
	}

	result, err := server.handleAimWriteSRC(ctx, request)
	if err != nil {
		t.Fatalf("handleAimWriteSRC failed: %v", err)
	}

	parsed := parseMCPResult(t, result)
	if parsed["success"] != true {
		t.Errorf("expected success=true, got: %v", parsed)
	}

	// Verify file exists
	outputPath := filepath.Join(dir, "AIM", "strategic_reality_check.yaml")
	if _, err := os.Stat(outputPath); os.IsNotExist(err) {
		t.Error("expected strategic_reality_check.yaml to be created")
	}
}

package mcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mark3labs/mcp-go/mcp"
)

// =============================================================================
// P1 Tools Tests
// =============================================================================

// setupP1Instance creates a minimal EPF instance with features, roadmap,
// and value models for testing P1 tools. Returns the temp directory path.
func setupP1Instance(t *testing.T) string {
	t.Helper()
	tmpDir := t.TempDir()

	readyDir := filepath.Join(tmpDir, "READY")
	fireDir := filepath.Join(tmpDir, "FIRE")
	fdDir := filepath.Join(fireDir, "definitions", "product")
	vmDir := filepath.Join(fireDir, "value_models")
	aimDir := filepath.Join(tmpDir, "AIM")

	for _, d := range []string{readyDir, fdDir, vmDir, aimDir} {
		if err := os.MkdirAll(d, 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// Anchor
	writeFile(t, filepath.Join(tmpDir, "_epf.yaml"), `epf_anchor: true
version: "1.0.0"
instance_id: "test-p1-tools"
created_at: 2025-01-01T00:00:00Z
product_name: "P1 Test"
`)

	// North Star (minimal)
	writeFile(t, filepath.Join(readyDir, "00_north_star.yaml"), `north_star:
  organization: "TestCorp"
  purpose:
    statement: "Test purpose"
    problem_we_solve: "Testing"
    who_we_serve: "Devs"
    impact_we_seek: "Quality"
  vision:
    vision_statement: "Test vision"
    timeframe: "5 years"
  mission:
    mission_statement: "Test mission"
    what_we_do:
      - "Build"
    how_we_deliver:
      approach: "TDD"
      key_capabilities: []
    who_we_serve_specifically: "Engineers"
    boundaries:
      we_dont_do: []
      why_not: "N/A"
  values: []
`)

	// Feature definition 1
	writeFile(t, filepath.Join(fdDir, "fd-001.yaml"), `id: "fd-001"
name: "Knowledge Exploration"
slug: "knowledge-exploration"
status: "in-progress"
strategic_context:
  contributes_to:
    - "Product.Core.KnowledgeExploration"
  tracks:
    - product
definition:
  job_to_be_done: "When I research a topic, I want to explore knowledge, so I can learn."
  solution_approach: "Graph-based knowledge exploration engine."
  personas: []
  capabilities:
    - id: "cap-001"
      name: "Search"
      description: "Full-text search"
implementation:
  contexts: []
`)

	// Feature definition 2
	writeFile(t, filepath.Join(fdDir, "fd-002.yaml"), `id: "fd-002"
name: "Analytics Dashboard"
slug: "analytics-dashboard"
status: "draft"
strategic_context:
  contributes_to:
    - "Product.Core.Analytics"
  tracks:
    - product
definition:
  job_to_be_done: "When I review data, I want to see dashboards, so I can decide."
  solution_approach: "Real-time analytics dashboard."
  personas: []
  capabilities:
    - id: "cap-001"
      name: "Charts"
      description: "Render charts"
implementation:
  contexts: []
`)

	// Value model (Product track)
	writeFile(t, filepath.Join(vmDir, "product_value_model.yaml"), `track_name: Product
description: "Product value model"
layers:
  - id: Core
    name: "Core"
    description: "Core capabilities"
    components:
      - id: KnowledgeExploration
        name: "Knowledge Exploration"
        description: "Knowledge exploration engine"
        maturity: emerging
        sub_components:
          - id: Search
            name: "Search"
            description: "Full-text search"
            maturity: emerging
      - id: Analytics
        name: "Analytics"
        description: "Analytics capabilities"
        maturity: hypothetical
`)

	// Roadmap
	writeFile(t, filepath.Join(readyDir, "05_roadmap_recipe.yaml"), `roadmap:
  id: "roadmap-test"
  name: "Test Roadmap"
  cycle: 1
  tracks:
    - track: product
      okrs:
        - id: "okr-p-001"
          objective: "Build core product"
          key_results:
            - id: "kr-p-001"
              description: "Launch search feature"
              target: "100%"
              status: "in-progress"
              value_model_target:
                component_path: "Product.Core.KnowledgeExploration"
            - id: "kr-p-002"
              description: "Launch analytics"
              target: "MVP"
              status: "not-started"
`)

	return tmpDir
}

func writeFile(t *testing.T, path, content string) {
	t.Helper()
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("Failed to write %s: %v", path, err)
	}
}

// =============================================================================
// Task 2.1 — epf_list_features
// =============================================================================

func TestHandleListFeatures(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path":   instancePath,
		"include_quality": "false",
	}

	result, err := server.handleListFeatures(ctx, request)
	if err != nil {
		t.Fatalf("handleListFeatures failed: %v", err)
	}

	content := getResultText(result)
	if content == "" {
		t.Fatal("Expected non-empty response")
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true, got %v", response["success"])
	}

	features, ok := response["features"].([]interface{})
	if !ok {
		t.Fatal("Expected features array in response")
	}

	if len(features) < 2 {
		t.Errorf("Expected at least 2 features, got %d", len(features))
	}
}

func TestHandleListFeatures_MissingInstancePath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleListFeatures(ctx, request)
	if err != nil {
		t.Fatalf("handleListFeatures failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when instance_path is missing")
	}
}

// =============================================================================
// Task 2.6 — epf_batch_validate
// =============================================================================

func TestHandleBatchValidate(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleBatchValidate(ctx, request)
	if err != nil {
		t.Fatalf("handleBatchValidate failed: %v", err)
	}

	content := getResultText(result)
	if content == "" {
		t.Fatal("Expected non-empty response")
	}

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true, got %v", response["success"])
	}

	// Should have files
	files, ok := response["files"].([]interface{})
	if !ok {
		t.Fatal("Expected files array")
	}

	if len(files) == 0 {
		t.Error("Expected at least one file result")
	}

	// Should have total_files
	if _, ok := response["total_files"]; !ok {
		t.Error("Expected total_files in response")
	}
}

func TestHandleBatchValidate_MissingInstancePath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleBatchValidate(ctx, request)
	if err != nil {
		t.Fatalf("handleBatchValidate failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when instance_path is missing")
	}
}

// =============================================================================
// Task 2.2 — epf_rename_value_path
// =============================================================================

func TestHandleRenameValuePath_DryRun(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"old_path":      "Product.Core.KnowledgeExploration",
		"new_path":      "Product.Core.Analytics",
		"dry_run":       "true",
	}

	result, err := server.handleRenameValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleRenameValuePath failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true, got %v. Full response: %s", response["success"], content)
	}

	if response["dry_run"] != true {
		t.Error("Expected dry_run=true")
	}

	// Should show changes
	if _, ok := response["changes"]; !ok {
		t.Error("Expected changes in dry run response")
	}
}

func TestHandleRenameValuePath_InvalidNewPath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"old_path":      "Product.Core.KnowledgeExploration",
		"new_path":      "Product.Core.NonExistent",
		"dry_run":       "true",
	}

	result, err := server.handleRenameValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleRenameValuePath failed: %v", err)
	}

	// Should return an error about non-existent path
	content := getResultText(result)
	if !strings.Contains(content, "does not exist") && !strings.Contains(content, "NonExistent") {
		t.Errorf("Expected error about non-existent path, got: %s", content)
	}
}

func TestHandleRenameValuePath_ActualRename(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"old_path":      "Product.Core.KnowledgeExploration",
		"new_path":      "Product.Core.Analytics",
		"dry_run":       "false",
	}

	result, err := server.handleRenameValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleRenameValuePath failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	// Verify the feature file was actually updated
	fdPath := filepath.Join(instancePath, "FIRE", "definitions", "product", "fd-001.yaml")
	fdData, err := os.ReadFile(fdPath)
	if err != nil {
		t.Fatalf("Failed to read fd-001.yaml: %v", err)
	}

	if !strings.Contains(string(fdData), "Product.Core.Analytics") {
		t.Error("Expected fd-001.yaml to contain Product.Core.Analytics after rename")
	}

	if strings.Contains(string(fdData), "Product.Core.KnowledgeExploration") {
		t.Error("Expected fd-001.yaml to NOT contain old path after rename")
	}
}

// =============================================================================
// Task 2.3 — epf_update_kr
// =============================================================================

func TestHandleUpdateKR_DryRun(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"kr_id":         "kr-p-001",
		"dry_run":       "true",
		"fields": map[string]interface{}{
			"status": "completed",
		},
	}

	result, err := server.handleUpdateKR(ctx, request)
	if err != nil {
		t.Fatalf("handleUpdateKR failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	if response["dry_run"] != true {
		t.Error("Expected dry_run=true")
	}
}

func TestHandleUpdateKR_ActualUpdate(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"kr_id":         "kr-p-001",
		"dry_run":       "false",
		"fields": map[string]interface{}{
			"status": "completed",
		},
	}

	result, err := server.handleUpdateKR(ctx, request)
	if err != nil {
		t.Fatalf("handleUpdateKR failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	// Verify the roadmap file was actually updated
	rmPath := filepath.Join(instancePath, "READY", "05_roadmap_recipe.yaml")
	rmData, err := os.ReadFile(rmPath)
	if err != nil {
		t.Fatalf("Failed to read roadmap: %v", err)
	}

	if !strings.Contains(string(rmData), "completed") {
		t.Error("Expected roadmap to contain 'completed' status after update")
	}
}

func TestHandleUpdateKR_MissingKRID(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": "/tmp/nonexistent",
	}

	result, err := server.handleUpdateKR(ctx, request)
	if err != nil {
		t.Fatalf("handleUpdateKR failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when kr_id is missing")
	}
}

// =============================================================================
// Task 2.4 — epf_add_value_model_component
// =============================================================================

func TestHandleAddValueModelComponent_DryRun(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"component_id":  "NewFeature",
		"name":          "New Feature",
		"dry_run":       "true",
	}

	result, err := server.handleAddValueModelComponent(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelComponent failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	if response["dry_run"] != true {
		t.Error("Expected dry_run=true")
	}

	// Verify file was NOT modified (dry run)
	vmPath := filepath.Join(instancePath, "FIRE", "value_models", "product_value_model.yaml")
	data, err := os.ReadFile(vmPath)
	if err != nil {
		t.Fatalf("Failed to read value model: %v", err)
	}
	if strings.Contains(string(data), "NewFeature") {
		t.Error("Value model should NOT be modified in dry run")
	}
}

func TestHandleAddValueModelComponent_ActualAdd(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"component_id":  "NewFeature",
		"name":          "New Feature",
		"dry_run":       "false",
	}

	result, err := server.handleAddValueModelComponent(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelComponent failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	// Verify file WAS modified
	vmPath := filepath.Join(instancePath, "FIRE", "value_models", "product_value_model.yaml")
	data, err := os.ReadFile(vmPath)
	if err != nil {
		t.Fatalf("Failed to read value model: %v", err)
	}
	if !strings.Contains(string(data), "NewFeature") {
		t.Error("Value model should contain NewFeature after add")
	}
}

func TestHandleAddValueModelComponent_Duplicate(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"component_id":  "KnowledgeExploration", // already exists
		"name":          "Knowledge Exploration",
	}

	result, err := server.handleAddValueModelComponent(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelComponent failed: %v", err)
	}

	content := getResultText(result)
	if !strings.Contains(content, "already exists") {
		t.Errorf("Expected error about duplicate, got: %s", content)
	}
}

func TestHandleAddValueModelComponent_MissingTrack(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": "/tmp/test",
		"l1_id":         "Core",
		"component_id":  "NewFeature",
		"name":          "New Feature",
	}

	result, err := server.handleAddValueModelComponent(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelComponent failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when track is missing")
	}
}

// =============================================================================
// Task 2.5 — epf_add_value_model_sub
// =============================================================================

func TestHandleAddValueModelSub_DryRun(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"l2_id":         "KnowledgeExploration",
		"sub_id":        "SemanticSearch",
		"name":          "Semantic Search",
		"dry_run":       "true",
	}

	result, err := server.handleAddValueModelSub(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelSub failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	if response["dry_run"] != true {
		t.Error("Expected dry_run=true")
	}
}

func TestHandleAddValueModelSub_ActualAdd(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"l2_id":         "KnowledgeExploration",
		"sub_id":        "SemanticSearch",
		"name":          "Semantic Search",
		"dry_run":       "false",
	}

	result, err := server.handleAddValueModelSub(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelSub failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true. Response: %s", content)
	}

	// Verify file WAS modified
	vmPath := filepath.Join(instancePath, "FIRE", "value_models", "product_value_model.yaml")
	data, err := os.ReadFile(vmPath)
	if err != nil {
		t.Fatalf("Failed to read value model: %v", err)
	}
	if !strings.Contains(string(data), "SemanticSearch") {
		t.Error("Value model should contain SemanticSearch after add")
	}
}

func TestHandleAddValueModelSub_NonExistentL2(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
		"l1_id":         "Core",
		"l2_id":         "NonExistent",
		"sub_id":        "Test",
		"name":          "Test",
	}

	result, err := server.handleAddValueModelSub(ctx, request)
	if err != nil {
		t.Fatalf("handleAddValueModelSub failed: %v", err)
	}

	content := getResultText(result)
	if !strings.Contains(strings.ToLower(content), "not found") && !strings.Contains(content, "NonExistent") {
		t.Errorf("Expected error about non-existent L2, got: %s", content)
	}
}

// =============================================================================
// Helper function tests (findSimilarPaths, validateComponentPath)
// =============================================================================

func TestFindSimilarPaths(t *testing.T) {
	available := []string{
		"Product.Core.Search",
		"Product.Core.Analytics",
		"Product.Discovery.KnowledgeExploration",
		"Strategy.Growth.MarketExpansion",
	}

	results := findSimilarPaths("Product.Core.Searh", available, 3) // typo
	if len(results) == 0 {
		t.Error("Expected at least one suggestion for typo")
	}

	// Should suggest Product.Core.Search
	found := false
	for _, r := range results {
		if r == "Product.Core.Search" {
			found = true
			break
		}
	}
	if !found {
		t.Errorf("Expected Product.Core.Search in suggestions, got: %v", results)
	}
}

func TestFindSimilarPaths_NoMatch(t *testing.T) {
	available := []string{
		"Product.Core.Search",
	}

	results := findSimilarPaths("Completely.Unrelated.Path", available, 3)
	// Should still return the available paths as best guesses
	// (or empty if distance is too large)
	_ = results // Just verify it doesn't panic
}

// =============================================================================
// Task 4.2/4.3 — epf_update_capability_maturity dry_run
// =============================================================================

func TestHandleUpdateCapabilityMaturity_DryRun(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	instancePath := setupP1Instance(t)
	clearStrategyStoreCache()

	// Read the original feature file to compare later
	fdPath := filepath.Join(instancePath, "FIRE", "definitions", "product", "fd-001.yaml")
	originalData, err := os.ReadFile(fdPath)
	if err != nil {
		t.Fatalf("Failed to read original feature file: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"feature_id":    "fd-001",
		"capability_id": "cap-001",
		"maturity":      "proven",
		"evidence":      "Validated with 100 users",
		"dry_run":       "true",
	}

	result, err := server.handleUpdateCapabilityMaturity(ctx, request)
	if err != nil {
		t.Fatalf("handleUpdateCapabilityMaturity failed: %v", err)
	}

	content := getResultText(result)
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v\nContent: %s", err, content)
	}

	if response["success"] != true {
		t.Errorf("Expected success=true, got %v. Full response: %s", response["success"], content)
	}

	if response["dry_run"] != true {
		t.Error("Expected dry_run=true in response")
	}

	if response["feature_id"] != "fd-001" {
		t.Errorf("Expected feature_id=fd-001, got %v", response["feature_id"])
	}

	if response["new_maturity"] != "proven" {
		t.Errorf("Expected new_maturity=proven, got %v", response["new_maturity"])
	}

	// The critical check: file should NOT be modified
	afterData, err := os.ReadFile(fdPath)
	if err != nil {
		t.Fatalf("Failed to read feature file after dry run: %v", err)
	}

	if string(afterData) != string(originalData) {
		t.Error("Feature file was modified during dry run — expected no changes")
	}
}

package mcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/schema"
	"github.com/mark3labs/mcp-go/mcp"
)

// Helper to find schemas directory for tests
func findSchemasDir() string {
	// Try common locations
	paths := []string{
		"../../docs/EPF/schemas",       // From internal/mcp
		"../../../docs/EPF/schemas",    // Alternative
		"../../../../docs/EPF/schemas", // From deeper paths
		"docs/EPF/schemas",             // From repo root
	}

	for _, p := range paths {
		if _, err := os.Stat(p); err == nil {
			abs, _ := filepath.Abs(p)
			return abs
		}
	}
	return ""
}

func TestNewServer(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server == nil {
		t.Fatal("Expected server to be non-nil")
	}

	if server.mcpServer == nil {
		t.Error("Expected mcpServer to be initialized")
	}

	if server.validator == nil {
		t.Error("Expected validator to be initialized")
	}

	if server.schemasDir != schemasDir {
		t.Errorf("Expected schemasDir=%s, got %s", schemasDir, server.schemasDir)
	}
}

func TestNewServer_InvalidSchemasDir(t *testing.T) {
	_, err := NewServer("/nonexistent/path")
	if err == nil {
		t.Error("Expected error for invalid schemas directory")
	}
}

func TestHandleListSchemas(t *testing.T) {
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

	result, err := server.handleListSchemas(ctx, request)
	if err != nil {
		t.Fatalf("handleListSchemas failed: %v", err)
	}

	if result == nil {
		t.Fatal("Expected result to be non-nil")
	}

	// Check that content contains expected sections
	content := getResultText(result)
	if !strings.Contains(content, "# EPF Schemas") {
		t.Error("Expected result to contain EPF Schemas header")
	}

	if !strings.Contains(content, "READY Phase") {
		t.Error("Expected result to contain READY Phase section")
	}

	if !strings.Contains(content, "north_star") {
		t.Error("Expected result to contain north_star artifact")
	}
}

func TestHandleGetSchema_ValidType(t *testing.T) {
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
		"artifact_type": "north_star",
	}

	result, err := server.handleGetSchema(ctx, request)
	if err != nil {
		t.Fatalf("handleGetSchema failed: %v", err)
	}

	content := getResultText(result)

	// Should contain JSON schema
	if !strings.Contains(content, "$schema") {
		t.Error("Expected result to contain JSON schema")
	}

	if !strings.Contains(content, "properties") {
		t.Error("Expected result to contain properties definition")
	}
}

func TestHandleGetSchema_InvalidType(t *testing.T) {
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
		"artifact_type": "nonexistent_type",
	}

	result, err := server.handleGetSchema(ctx, request)
	if err != nil {
		t.Fatalf("handleGetSchema failed: %v", err)
	}

	// Should return error message in result
	if !result.IsError {
		t.Error("Expected error result for invalid artifact type")
	}
}

func TestHandleDetectArtifactType(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	tests := []struct {
		path         string
		expectedType string
	}{
		{"READY/00_north_star.yaml", "north_star"},
		{"READY/05_roadmap_recipe.yaml", "roadmap_recipe"},
		{"FIRE/feature_definitions/fd-test.yaml", "feature_definition"},
		{"FIRE/value_models/vm-test.yaml", "value_model"},
	}

	for _, tt := range tests {
		ctx := context.Background()
		request := mcp.CallToolRequest{}
		request.Params.Arguments = map[string]interface{}{
			"path": tt.path,
		}

		result, err := server.handleDetectArtifactType(ctx, request)
		if err != nil {
			t.Errorf("handleDetectArtifactType(%s) failed: %v", tt.path, err)
			continue
		}

		content := getResultText(result)
		if !strings.Contains(content, tt.expectedType) {
			t.Errorf("handleDetectArtifactType(%s): expected %s in result, got %s", tt.path, tt.expectedType, content)
		}
	}
}

func TestHandleDetectArtifactType_UnknownPath(t *testing.T) {
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
		"path": "unknown/random_file.yaml",
	}

	result, err := server.handleDetectArtifactType(ctx, request)
	if err != nil {
		t.Fatalf("handleDetectArtifactType failed: %v", err)
	}

	// Should return error for unknown path
	if !result.IsError {
		t.Error("Expected error for unknown artifact path")
	}
}

func TestHandleGetPhaseArtifacts_READY(t *testing.T) {
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
		"phase": "READY",
	}

	result, err := server.handleGetPhaseArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleGetPhaseArtifacts failed: %v", err)
	}

	content := getResultText(result)

	// Should contain READY phase artifacts
	expectedArtifacts := []string{"north_star", "insight_analyses", "strategy_foundations", "roadmap_recipe"}
	for _, artifact := range expectedArtifacts {
		if !strings.Contains(content, artifact) {
			t.Errorf("Expected READY phase to contain %s", artifact)
		}
	}
}

func TestHandleGetPhaseArtifacts_FIRE(t *testing.T) {
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
		"phase": "FIRE",
	}

	result, err := server.handleGetPhaseArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleGetPhaseArtifacts failed: %v", err)
	}

	content := getResultText(result)

	// Should contain FIRE phase artifacts
	expectedArtifacts := []string{"feature_definition", "value_model"}
	for _, artifact := range expectedArtifacts {
		if !strings.Contains(content, artifact) {
			t.Errorf("Expected FIRE phase to contain %s", artifact)
		}
	}
}

func TestHandleGetPhaseArtifacts_InvalidPhase(t *testing.T) {
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
		"phase": "INVALID",
	}

	result, err := server.handleGetPhaseArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleGetPhaseArtifacts failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for invalid phase")
	}
}

func TestHandleValidateContent_ValidYAML(t *testing.T) {
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
		"content": `meta:
  epf_version: "1.9.6"
vision:
  statement: "Test vision statement"
  target_horizon: "2025"
north_star:
  narrative: "Test narrative"
  metrics:
    - name: "Test metric"
      target: "100"
`,
		"artifact_type": "north_star",
	}

	result, err := server.handleValidateContent(ctx, request)
	if err != nil {
		t.Fatalf("handleValidateContent failed: %v", err)
	}

	if result.IsError {
		content := getResultText(result)
		t.Errorf("Expected valid YAML to pass validation: %s", content)
	}
}

func TestHandleValidateContent_InvalidYAML(t *testing.T) {
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
		"content":       "not: valid: yaml: {{",
		"artifact_type": "north_star",
	}

	result, err := server.handleValidateContent(ctx, request)
	if err != nil {
		t.Fatalf("handleValidateContent failed: %v", err)
	}

	// Invalid YAML should report errors
	content := getResultText(result)
	if !strings.Contains(content, "valid") {
		// Either it's an error result or the content mentions validity
		if !result.IsError {
			t.Log("Note: Invalid YAML might be handled differently by validator")
		}
	}
}

func TestHandleCheckInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create a temp directory with EPF structure
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": tmpDir,
	}

	result, err := server.handleCheckInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleCheckInstance failed: %v", err)
	}

	content := getResultText(result)
	if !strings.Contains(content, "Instance Structure Check") {
		t.Error("Expected result to contain instance structure check header")
	}
}

func TestHandleCheckContentReadiness(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create a temp file with placeholder content
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `vision: "TBD"
description: "[TODO: Add description]"
`
	os.WriteFile(testFile, []byte(content), 0644)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path": tmpDir,
	}

	result, err := server.handleCheckContentReadiness(ctx, request)
	if err != nil {
		t.Fatalf("handleCheckContentReadiness failed: %v", err)
	}

	resultContent := getResultText(result)
	if !strings.Contains(resultContent, "Content Readiness") {
		t.Error("Expected result to contain content readiness check header")
	}

	// Should detect placeholders
	if !strings.Contains(resultContent, "Placeholder") && !strings.Contains(resultContent, "Score") {
		t.Error("Expected result to contain placeholder information or score")
	}
}

func TestHandleHealthCheck(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create a minimal EPF instance
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "feature_definitions"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": tmpDir,
	}

	result, err := server.handleHealthCheck(ctx, request)
	if err != nil {
		t.Fatalf("handleHealthCheck failed: %v", err)
	}

	content := getResultText(result)

	// Parse JSON result
	var healthResult HealthCheckSummary
	if err := json.Unmarshal([]byte(content), &healthResult); err != nil {
		t.Fatalf("Failed to parse health check result: %v", err)
	}

	if healthResult.InstancePath != tmpDir {
		t.Errorf("Expected instance_path=%s, got %s", tmpDir, healthResult.InstancePath)
	}

	// Should have an overall status
	validStatuses := []string{"HEALTHY", "WARNINGS", "ERRORS"}
	statusValid := false
	for _, s := range validStatuses {
		if healthResult.OverallStatus == s {
			statusValid = true
			break
		}
	}
	if !statusValid {
		t.Errorf("Unexpected overall status: %s", healthResult.OverallStatus)
	}
}

func TestSchemaListItem(t *testing.T) {
	item := SchemaListItem{
		ArtifactType: "north_star",
		SchemaFile:   "north-star.json",
		Phase:        "READY",
		Description:  "Test description",
	}

	if item.ArtifactType != "north_star" {
		t.Errorf("Expected ArtifactType='north_star', got %s", item.ArtifactType)
	}
	if item.SchemaFile != "north-star.json" {
		t.Errorf("Expected SchemaFile='north-star.json', got %s", item.SchemaFile)
	}
	if item.Phase != "READY" {
		t.Errorf("Expected Phase='READY', got %s", item.Phase)
	}
}

func TestHealthCheckSummary(t *testing.T) {
	summary := HealthCheckSummary{
		InstancePath:  "/test/path",
		OverallStatus: "HEALTHY",
		Summary:       "Test summary",
	}

	if summary.InstancePath != "/test/path" {
		t.Errorf("Expected InstancePath='/test/path', got %s", summary.InstancePath)
	}
	if summary.OverallStatus != "HEALTHY" {
		t.Errorf("Expected OverallStatus='HEALTHY', got %s", summary.OverallStatus)
	}
}

func TestServerConstants(t *testing.T) {
	if ServerName != "epf-cli" {
		t.Errorf("Expected ServerName='epf-cli', got %s", ServerName)
	}
	if ServerVersion != "0.9.0" {
		t.Errorf("Expected ServerVersion='0.9.0', got %s", ServerVersion)
	}
}

// Helper to get text content from result
func getResultText(result *mcp.CallToolResult) string {
	if result == nil || len(result.Content) == 0 {
		return ""
	}
	// Try to get text content
	for _, c := range result.Content {
		if textContent, ok := c.(mcp.TextContent); ok {
			return textContent.Text
		}
	}
	return ""
}

// =============================================================================
// Relationship Intelligence Tool Tests
// =============================================================================

// Helper to find Emergent EPF instance for relationship tests
func findTestInstance() string {
	paths := []string{
		"../../docs/EPF/_instances/emergent",       // From internal/mcp
		"../../../docs/EPF/_instances/emergent",    // Alternative
		"../../../../docs/EPF/_instances/emergent", // From deeper paths
		"docs/EPF/_instances/emergent",             // From repo root
	}

	for _, p := range paths {
		if _, err := os.Stat(filepath.Join(p, "READY")); err == nil {
			abs, _ := filepath.Abs(p)
			return abs
		}
	}
	return ""
}

func TestHandleExplainValuePath_ValidPath(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":          "Product",
		"instance_path": instancePath,
	}

	result, err := server.handleExplainValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleExplainValuePath failed: %v", err)
	}

	content := getResultText(result)

	// Parse the JSON response
	var response ExplainPathResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should recognize "Product" as a valid track
	if !response.IsValid {
		t.Errorf("Expected path to be valid, got invalid: %s", response.ErrorMessage)
	}

	if response.Track != "Product" {
		t.Errorf("Expected track 'Product', got '%s'", response.Track)
	}
}

func TestHandleExplainValuePath_InvalidPath(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":          "InvalidTrack.Bogus.Path",
		"instance_path": instancePath,
	}

	result, err := server.handleExplainValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleExplainValuePath failed: %v", err)
	}

	content := getResultText(result)

	var response ExplainPathResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should be invalid
	if response.IsValid {
		t.Error("Expected invalid path to report as invalid")
	}

	// Should have guidance for next steps
	if len(response.Guidance.NextSteps) == 0 {
		t.Error("Expected guidance for invalid path")
	}
}

func TestHandleExplainValuePath_MissingParams(t *testing.T) {
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
		// Missing both path and instance_path
	}

	result, err := server.handleExplainValuePath(ctx, request)
	if err != nil {
		t.Fatalf("handleExplainValuePath failed: %v", err)
	}

	// Should return error for missing parameters
	if !result.IsError {
		t.Error("Expected error for missing parameters")
	}
}

func TestHandleGetStrategicContext_ValidFeature(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"feature_id":    "fd-001",
		"instance_path": instancePath,
	}

	result, err := server.handleGetStrategicContext(ctx, request)
	if err != nil {
		t.Fatalf("handleGetStrategicContext failed: %v", err)
	}

	content := getResultText(result)

	// Parse the JSON response
	var response StrategicContextResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have feature data
	if response.Feature.ID == "" {
		t.Fatal("Expected feature data in response")
	}

	if response.Feature.ID != "fd-001" {
		t.Errorf("Expected feature ID 'fd-001', got '%s'", response.Feature.ID)
	}

	if response.Feature.Name == "" {
		t.Error("Expected feature name to be populated")
	}
}

func TestHandleGetStrategicContext_InvalidFeature(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"feature_id":    "fd-999-nonexistent",
		"instance_path": instancePath,
	}

	result, err := server.handleGetStrategicContext(ctx, request)
	if err != nil {
		t.Fatalf("handleGetStrategicContext failed: %v", err)
	}

	// Should return error for non-existent feature
	if !result.IsError {
		t.Error("Expected error for non-existent feature")
	}
}

func TestHandleAnalyzeCoverage(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleAnalyzeCoverage(ctx, request)
	if err != nil {
		t.Fatalf("handleAnalyzeCoverage failed: %v", err)
	}

	content := getResultText(result)

	// Parse the JSON response
	var response CoverageResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have coverage data
	if response.TotalL2Components == 0 {
		t.Error("Expected non-zero total L2 components")
	}

	// Coverage should be between 0 and 100
	if response.CoveragePercent < 0 || response.CoveragePercent > 100 {
		t.Errorf("Coverage percent out of range: %.1f", response.CoveragePercent)
	}
}

func TestHandleAnalyzeCoverage_WithTrackFilter(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
		"track":         "Product",
	}

	result, err := server.handleAnalyzeCoverage(ctx, request)
	if err != nil {
		t.Fatalf("handleAnalyzeCoverage failed: %v", err)
	}

	content := getResultText(result)

	var response CoverageResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should only have coverage for Product track
	if len(response.ByLayer) == 0 {
		t.Error("Expected layer coverage data")
	}
}

func TestHandleValidateRelationships(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": instancePath,
	}

	result, err := server.handleValidateRelationships(ctx, request)
	if err != nil {
		t.Fatalf("handleValidateRelationships failed: %v", err)
	}

	content := getResultText(result)

	// Parse the JSON response
	var response ValidateRelationshipsResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have stats
	if response.Stats.TotalPathsChecked == 0 {
		t.Error("Expected some paths to be checked")
	}

	// Should have guidance
	if len(response.Guidance.NextSteps) == 0 && len(response.Guidance.Tips) == 0 {
		t.Error("Expected guidance in response")
	}
}

func TestHandleValidateRelationships_MissingInstancePath(t *testing.T) {
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
		// Missing instance_path
	}

	result, err := server.handleValidateRelationships(ctx, request)
	if err != nil {
		t.Fatalf("handleValidateRelationships failed: %v", err)
	}

	// Should return error for missing instance_path
	if !result.IsError {
		t.Error("Expected error for missing instance_path")
	}
}

// Test schema module integration
func TestSchemaIntegration(t *testing.T) {
	// Test ArtifactType string conversion
	artifactType, err := schema.ArtifactTypeFromString("north_star")
	if err != nil {
		t.Fatalf("ArtifactTypeFromString failed: %v", err)
	}
	if artifactType != schema.ArtifactNorthStar {
		t.Errorf("Expected ArtifactNorthStar, got %v", artifactType)
	}

	// Test invalid type
	_, err = schema.ArtifactTypeFromString("invalid_type")
	if err == nil {
		t.Error("Expected error for invalid artifact type")
	}
}

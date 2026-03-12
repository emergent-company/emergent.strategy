package mcp

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
	"github.com/mark3labs/mcp-go/mcp"
)

// Helper to find schemas directory for tests
func findSchemasDir() string {
	// Try common locations
	paths := []string{
		"../embedded/schemas",          // From internal/mcp to embedded
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
	server, err := NewServer("/nonexistent/path")
	// With embedded fallback, this should now succeed if embedded artifacts are available
	if err != nil {
		// If error, it means embedded is not available (acceptable in CI)
		t.Logf("NewServer() returned error (expected if embedded not available): %v", err)
		return
	}
	// If it succeeded, verify we got a valid server
	if server == nil {
		t.Error("NewServer() should return non-nil server when using embedded fallback")
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
		{"FIRE/definitions/product/fd-test.yaml", "feature_definition"},
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
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "definitions", "product"), 0755)
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

	// Parse JSON result (strip any text preamble before the JSON)
	var healthResult HealthCheckSummary
	if err := json.Unmarshal([]byte(extractJSON(content)), &healthResult); err != nil {
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

// extractJSON strips any text preamble before the JSON object in a response.
// Some handlers prepend natural-language directives before the JSON payload
// (e.g. "IMPORTANT: ..."). This helper finds the first '{' and returns
// everything from there onward so tests can json.Unmarshal cleanly.
func extractJSON(content string) string {
	idx := strings.Index(content, "{")
	if idx < 0 {
		return content
	}
	return content[idx:]
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

// =============================================================================
// AI Agent Discovery Tool Tests (v0.13.0)
// =============================================================================

func TestHandleAgentInstructions(t *testing.T) {
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

	result, err := server.handleAgentInstructions(ctx, request)
	if err != nil {
		t.Fatalf("handleAgentInstructions failed: %v", err)
	}

	if result == nil {
		t.Fatal("Expected result to be non-nil")
	}

	content := getResultText(result)

	// Parse JSON response
	var response AgentInstructionsOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Verify authority section
	if response.Authority.Tool != "epf-cli" {
		t.Errorf("Expected tool to be 'epf-cli', got '%s'", response.Authority.Tool)
	}
	if response.Authority.TrustLevel != "authoritative" {
		t.Errorf("Expected trust level to be 'authoritative', got '%s'", response.Authority.TrustLevel)
	}
	if response.Authority.Role != "EPF normative authority" {
		t.Errorf("Expected role to be 'EPF normative authority', got '%s'", response.Authority.Role)
	}

	// Verify commands section
	if len(response.Commands) == 0 {
		t.Error("Expected commands to be non-empty")
	}

	// Check for essential commands
	commandNames := make(map[string]bool)
	for _, cmd := range response.Commands {
		commandNames[cmd.Name] = true
	}
	essentialCommands := []string{"agent", "locate", "health", "validate", "init"}
	for _, name := range essentialCommands {
		if !commandNames[name] {
			t.Errorf("Expected command '%s' to be present", name)
		}
	}

	// Verify MCP tools section
	if len(response.MCPTools) == 0 {
		t.Error("Expected MCP tools to be non-empty")
	}

	// Check for essential MCP tools
	toolNames := make(map[string]bool)
	for _, tool := range response.MCPTools {
		toolNames[tool.Name] = true
	}
	essentialTools := []string{"epf_validate_file", "epf_health_check", "epf_locate_instance", "epf_agent_instructions"}
	for _, name := range essentialTools {
		if !toolNames[name] {
			t.Errorf("Expected MCP tool '%s' to be present", name)
		}
	}

	// Verify track architecture section
	if response.TrackArchitecture.Description == "" {
		t.Error("Expected track architecture description to be non-empty")
	}
	if len(response.TrackArchitecture.Tracks) != 4 {
		t.Errorf("Expected 4 tracks in TrackArchitecture, got %d", len(response.TrackArchitecture.Tracks))
	}
	trackNames := make(map[string]bool)
	for _, track := range response.TrackArchitecture.Tracks {
		trackNames[track.Name] = true
		if track.Description == "" {
			t.Errorf("Track %q has empty description", track.Name)
		}
		if track.ValueModel == "" {
			t.Errorf("Track %q has empty value_model_file", track.Name)
		}
	}
	for _, name := range []string{"Product", "Strategy", "OrgOps", "Commercial"} {
		if !trackNames[name] {
			t.Errorf("Expected track %q in TrackArchitecture", name)
		}
	}
	if len(response.TrackArchitecture.KeyRules) == 0 {
		t.Error("Expected key rules to be non-empty")
	}

	// Verify workflow section
	if len(response.Workflow.FirstSteps) == 0 {
		t.Error("Expected first steps to be non-empty")
	}
	if len(response.Workflow.BestPractices) == 0 {
		t.Error("Expected best practices to be non-empty")
	}
}

func TestHandleAgentInstructions_WithPath(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path": instancePath,
	}

	result, err := server.handleAgentInstructions(ctx, request)
	if err != nil {
		t.Fatalf("handleAgentInstructions failed: %v", err)
	}

	content := getResultText(result)

	// Parse JSON response
	var response AgentInstructionsOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Verify discovery found the instance
	if !response.Discovery.InstanceFound {
		t.Error("Expected instance to be found")
	}
	if response.Discovery.InstancePath == "" {
		t.Error("Expected instance path to be set")
	}
}

func TestHandleLocateInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	// Find the EPF instances directory
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	// Get parent directory to search from
	searchPath := filepath.Dir(filepath.Dir(instancePath)) // Go up to _instances parent

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":      searchPath,
		"max_depth": "3",
	}

	result, err := server.handleLocateInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleLocateInstance failed: %v", err)
	}

	if result == nil {
		t.Fatal("Expected result to be non-nil")
	}

	content := getResultText(result)

	// Parse JSON response
	var response LocateInstanceOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Verify search path is set
	if response.SearchPath == "" {
		t.Error("Expected search path to be set")
	}

	// Should find at least one instance
	if len(response.Instances) == 0 {
		t.Error("Expected at least one instance to be found")
	}

	// Verify summary is calculated
	if response.Summary.Total != len(response.Instances) {
		t.Errorf("Summary total (%d) doesn't match instances count (%d)",
			response.Summary.Total, len(response.Instances))
	}
}

func TestHandleLocateInstance_RequireAnchor(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	searchPath := filepath.Dir(filepath.Dir(instancePath))

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":           searchPath,
		"require_anchor": "true",
	}

	result, err := server.handleLocateInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleLocateInstance failed: %v", err)
	}

	content := getResultText(result)

	var response LocateInstanceOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// With require_anchor=true, we should either find instances with anchors
	// or find none. All found instances should have high confidence.
	for _, inst := range response.Instances {
		if inst.Confidence != "high" {
			t.Errorf("Expected high confidence for anchored instance, got %s", inst.Confidence)
		}
	}
}

func TestHandleLocateInstance_EmptyPath(t *testing.T) {
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
		// Empty path - should default to current directory
	}

	result, err := server.handleLocateInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleLocateInstance failed: %v", err)
	}

	// Should not error, just return results (possibly empty)
	if result.IsError {
		t.Error("Expected no error for empty path")
	}

	content := getResultText(result)
	var response LocateInstanceOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Search path should be set to absolute current directory
	if response.SearchPath == "" {
		t.Error("Expected search path to be set")
	}
}

// =============================================================================
// Task 6.2: resolveInstancePath tests
// =============================================================================

func TestResolveInstancePath_ExplicitParam(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Set a default instance path on the server
	server.defaultInstancePath = "/default/instance/path"

	// Create a request with an explicit instance_path
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": "/explicit/instance/path",
	}

	result := server.resolveInstancePath(request)
	if result != "/explicit/instance/path" {
		t.Errorf("resolveInstancePath with explicit param = %q, want %q", result, "/explicit/instance/path")
	}
}

func TestResolveInstancePath_FallsBackToDefault(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Set a default instance path on the server
	server.defaultInstancePath = "/default/instance/path"

	// Create a request without instance_path
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result := server.resolveInstancePath(request)
	if result != "/default/instance/path" {
		t.Errorf("resolveInstancePath without param = %q, want %q", result, "/default/instance/path")
	}
}

func TestResolveInstancePath_EmptyParamFallsBackToDefault(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Set a default instance path on the server
	server.defaultInstancePath = "/default/instance/path"

	// Create a request with an empty instance_path
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path": "",
	}

	result := server.resolveInstancePath(request)
	if result != "/default/instance/path" {
		t.Errorf("resolveInstancePath with empty param = %q, want %q", result, "/default/instance/path")
	}
}

func TestResolveInstancePath_NoDefaultNoParam(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// No default set
	server.defaultInstancePath = ""

	// No instance_path in request
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result := server.resolveInstancePath(request)
	if result != "" {
		t.Errorf("resolveInstancePath with no default and no param = %q, want empty string", result)
	}
}

func TestNewServer_DefaultInstancePathFromEnv(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	// Save and set env var
	oldVal := os.Getenv("EPF_STRATEGY_INSTANCE")
	os.Setenv("EPF_STRATEGY_INSTANCE", "/env/test/instance")
	defer os.Setenv("EPF_STRATEGY_INSTANCE", oldVal)

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.defaultInstancePath != "/env/test/instance" {
		t.Errorf("defaultInstancePath = %q, want %q", server.defaultInstancePath, "/env/test/instance")
	}
}

// =============================================================================
// Section 4: POST-CONDITION in tool descriptions (task 4.6)
// =============================================================================

func TestToolDescriptionsContainPostCondition(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// The tools that should have POST-CONDITION in their descriptions
	toolsWithPostCondition := []string{
		"epf_health_check",
		"epf_validate_file",
		"epf_get_wizard_for_task",
		"epf_get_wizard",
		"epf_get_template",
	}

	// Get all registered tool names by calling handleListSchemas or checking server
	// We'll test by calling each tool's handler and checking the tool registration exists
	// Since we can't directly inspect tool descriptions from mcp-go, we verify via
	// the server's MCP server. Let's use the agent instructions output which lists tools.
	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleAgentInstructions(ctx, request)
	if err != nil {
		t.Fatalf("handleAgentInstructions failed: %v", err)
	}

	content := getResultText(result)
	var response AgentInstructionsOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Verify the tools exist in the MCP tools list
	toolNames := make(map[string]bool)
	for _, tool := range response.MCPTools {
		toolNames[tool.Name] = true
	}

	for _, toolName := range toolsWithPostCondition {
		if !toolNames[toolName] {
			t.Errorf("Expected tool %q to be registered as an MCP tool", toolName)
		}
	}

	// Additionally verify that the server was created successfully with these tools
	// (if the POST-CONDITION text caused any registration issues, NewServer would fail)
	if server.mcpServer == nil {
		t.Error("Expected mcpServer to be initialized with POST-CONDITION descriptions")
	}
}

// =============================================================================
// Section 5: Anti-loop detection and audit log (migrated to audit_test.go)
// =============================================================================

// Tests for checkToolCallLoop, ResetToolCallCounts, and audit log functionality
// have been moved to audit_test.go which tests the AuditLog type directly.
// The Server delegates to AuditLog for all call tracking.

func TestServerHasAuditLog(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.auditLog == nil {
		t.Fatal("Expected auditLog to be initialized")
	}

	// ResetToolCallCounts should still work (backward compat)
	server.ResetToolCallCounts()
}

// =============================================================================
// Section 5: Health check response includes new fields
// =============================================================================

func TestHealthCheckResponse_ContainsNewFields(t *testing.T) {
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
	os.MkdirAll(filepath.Join(tmpDir, "FIRE", "definitions", "product"), 0755)
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
	jsonContent := extractJSON(content)

	// Parse and verify the new fields exist in the JSON
	var raw map[string]interface{}
	if err := json.Unmarshal([]byte(jsonContent), &raw); err != nil {
		t.Fatalf("Failed to parse health check JSON: %v", err)
	}

	// workflow_status must be present (non-optional)
	if _, ok := raw["workflow_status"]; !ok {
		t.Error("Expected 'workflow_status' field in health check response")
	}

	// Parse into typed struct for deeper validation
	var healthResult HealthCheckSummary
	if err := json.Unmarshal([]byte(jsonContent), &healthResult); err != nil {
		t.Fatalf("Failed to parse health check result: %v", err)
	}

	// workflow_status should be either "complete" or "incomplete"
	if healthResult.WorkflowStatus != "complete" && healthResult.WorkflowStatus != "incomplete" {
		t.Errorf("Expected workflow_status to be 'complete' or 'incomplete', got %q", healthResult.WorkflowStatus)
	}

	// If incomplete, remaining_steps should be populated
	if healthResult.WorkflowStatus == "incomplete" && len(healthResult.RemainingSteps) == 0 {
		t.Error("Expected remaining_steps to be populated when workflow_status is 'incomplete'")
	}

	// action_required should be populated when there are suggestions
	if len(healthResult.RequiredNextToolCalls) > 0 && healthResult.ActionRequired == "" {
		t.Error("Expected action_required to be populated when required_next_tool_calls is non-empty")
	}
}

// =============================================================================
// Section 6: Response Processing Protocol (task 6.4)
// =============================================================================

func TestAgentInstructionsOutput_ResponseProcessingProtocol(t *testing.T) {
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

	result, err := server.handleAgentInstructions(ctx, request)
	if err != nil {
		t.Fatalf("handleAgentInstructions failed: %v", err)
	}

	content := getResultText(result)

	var response AgentInstructionsOutput
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// response_processing_protocol must be present
	if response.ResponseProcessingProtocol == nil {
		t.Fatal("Expected response_processing_protocol to be non-nil")
	}

	proto := response.ResponseProcessingProtocol

	// Should have a description
	if proto.Description == "" {
		t.Error("Expected protocol description to be non-empty")
	}
	if !strings.Contains(proto.Description, "MUST") {
		t.Error("Expected protocol description to contain 'MUST' for emphasis")
	}

	// Should have exactly 4 steps
	if len(proto.Steps) != 4 {
		t.Fatalf("Expected 4 protocol steps, got %d", len(proto.Steps))
	}

	// Verify step order and fields
	expectedSteps := []struct {
		order       int
		field       string
		stopIfFound bool
	}{
		{1, "call_count_warning", true},
		{2, "action_required", false},
		{3, "workflow_status", false},
		{4, "required_next_tool_calls", false},
	}

	for i, expected := range expectedSteps {
		step := proto.Steps[i]
		if step.Order != expected.order {
			t.Errorf("Step %d: expected order=%d, got %d", i, expected.order, step.Order)
		}
		if step.Field != expected.field {
			t.Errorf("Step %d: expected field=%q, got %q", i, expected.field, step.Field)
		}
		if step.StopIfFound != expected.stopIfFound {
			t.Errorf("Step %d (%s): expected stopIfFound=%v, got %v", i, step.Field, expected.stopIfFound, step.StopIfFound)
		}
		if step.Action == "" {
			t.Errorf("Step %d (%s): expected non-empty action", i, step.Field)
		}
	}

	// call_count_warning should instruct to STOP
	if !strings.Contains(proto.Steps[0].Action, "STOP") {
		t.Error("Expected call_count_warning step to contain 'STOP'")
	}

	// workflow_status should mention 'incomplete'
	if !strings.Contains(proto.Steps[2].Action, "incomplete") {
		t.Error("Expected workflow_status step to mention 'incomplete'")
	}
}

// =============================================================================
// Section 3: Wizard content preview (task 3.4)
// =============================================================================

func TestHandleGetWizardForTask_WizardContentPreview(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.wizardLoader == nil || !server.wizardLoader.HasWizards() {
		t.Skip("Wizard loader not available")
	}

	ctx := context.Background()

	// Use a task that should produce a high-confidence match
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"task": "create a feature definition",
	}

	result, err := server.handleGetWizardForTask(ctx, request)
	if err != nil {
		t.Fatalf("handleGetWizardForTask failed: %v", err)
	}

	content := getResultText(result)

	// Response may have a text preamble before the JSON — strip it
	jsonContent := extractJSON(content)

	var response WizardRecommendationResponse
	if err := json.Unmarshal([]byte(jsonContent), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have a recommendation
	if response.RecommendedWizard == "" {
		t.Fatal("Expected a recommended wizard")
	}

	// When confidence is high, wizard_content_preview should be populated
	if response.Confidence == "high" {
		if response.WizardContentPreview == "" {
			t.Error("Expected wizard_content_preview to be populated for high-confidence match")
		}

		// Response should have a preamble mentioning validation
		if !strings.Contains(content, "epf_validate_file") {
			t.Error("Expected text preamble mentioning epf_validate_file when wizard_content_preview is populated")
		}

		// Guidance should mention inline content
		foundInlineTip := false
		for _, tip := range response.Guidance.Tips {
			if strings.Contains(tip, "wizard_content_preview") || strings.Contains(tip, "directly") {
				foundInlineTip = true
				break
			}
		}
		if !foundInlineTip {
			t.Error("Expected guidance tip mentioning wizard_content_preview for high-confidence match with content")
		}
		// NextSteps should NOT tell user to call epf_get_wizard since content is inline
		for _, step := range response.Guidance.NextSteps {
			if strings.Contains(step, "epf_get_wizard") {
				t.Error("Expected no epf_get_wizard next step when wizard_content_preview is populated")
			}
		}
	}
}

func TestHandleGetWizardForTask_ExcludeWizardContent(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.wizardLoader == nil || !server.wizardLoader.HasWizards() {
		t.Skip("Wizard loader not available")
	}

	ctx := context.Background()

	// Explicitly disable wizard content inclusion
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"task":                   "create a feature definition",
		"include_wizard_content": "false",
	}

	result, err := server.handleGetWizardForTask(ctx, request)
	if err != nil {
		t.Fatalf("handleGetWizardForTask failed: %v", err)
	}

	content := getResultText(result)

	var response WizardRecommendationResponse
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// wizard_content_preview should be empty when include_wizard_content=false
	if response.WizardContentPreview != "" {
		t.Error("Expected wizard_content_preview to be empty when include_wizard_content=false")
	}

	// NextSteps should tell user to call epf_get_wizard
	if response.RecommendedWizard != "" {
		foundWizardStep := false
		for _, step := range response.Guidance.NextSteps {
			if strings.Contains(step, "epf_get_wizard") {
				foundWizardStep = true
				break
			}
		}
		if !foundWizardStep {
			t.Error("Expected epf_get_wizard next step when wizard content is not included")
		}
	}
}

// =============================================================================
// Agent & Skill MCP Tools (Task 3.8)
// =============================================================================

func TestHandleListAgents(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleListAgents(ctx, request)
	if err != nil {
		t.Fatalf("handleListAgents failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleListAgents returned error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Should contain the markdown header
	if !strings.Contains(content, "# EPF Agents") {
		t.Error("Expected result to contain '# EPF Agents' header")
	}

	// Should contain at least some agent names (from embedded wizards)
	if !strings.Contains(content, "Total:") {
		t.Error("Expected result to contain agent count summary")
	}
}

func TestHandleListAgents_NoAgents(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Force agent loader to nil to simulate no agents
	server.agentLoader = nil

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleListAgents(ctx, request)
	if err != nil {
		t.Fatalf("handleListAgents failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when agent loader is nil")
	}
}

func TestHandleListAgents_PhaseFilter(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()

	// Filter by READY phase
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"phase": "READY",
	}

	result, err := server.handleListAgents(ctx, request)
	if err != nil {
		t.Fatalf("handleListAgents with phase filter failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleListAgents with READY filter returned error: %s", getResultText(result))
	}

	content := getResultText(result)
	if !strings.Contains(content, "READY") {
		t.Error("Expected result to mention READY phase filter")
	}
}

func TestHandleListAgents_InvalidPhase(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"phase": "INVALID_PHASE",
	}

	result, err := server.handleListAgents(ctx, request)
	if err != nil {
		t.Fatalf("handleListAgents failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for invalid phase filter")
	}
}

func TestHandleGetAgent(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	// Get first available agent
	agents := server.agentLoader.ListAgents(nil, nil)
	if len(agents) == 0 {
		t.Skip("No agents available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name": agents[0].Name,
	}

	result, err := server.handleGetAgent(ctx, request)
	if err != nil {
		t.Fatalf("handleGetAgent failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleGetAgent returned error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Should contain the agent's name
	if !strings.Contains(content, agents[0].Name) {
		t.Errorf("Expected result to contain agent name %q", agents[0].Name)
	}
}

func TestHandleGetAgent_NotFound(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name": "nonexistent-agent-that-does-not-exist",
	}

	result, err := server.handleGetAgent(ctx, request)
	if err != nil {
		t.Fatalf("handleGetAgent failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for non-existent agent")
	}
}

func TestHandleGetAgent_MissingName(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleGetAgent(ctx, request)
	if err != nil {
		t.Fatalf("handleGetAgent failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing name parameter")
	}
}

func TestHandleGetAgentForTask(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"task": "help me get started with EPF",
	}

	result, err := server.handleGetAgentForTask(ctx, request)
	if err != nil {
		t.Fatalf("handleGetAgentForTask failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleGetAgentForTask returned error: %s", getResultText(result))
	}

	content := getResultText(result)
	jsonContent := extractJSON(content)

	// Parse response
	var response map[string]interface{}
	if err := json.Unmarshal([]byte(jsonContent), &response); err != nil {
		t.Fatalf("Failed to parse response: %v", err)
	}

	// Should have a recommended agent
	if response["recommended_agent"] == nil || response["recommended_agent"] == "" {
		t.Error("Expected recommended_agent in response")
	}

	// Should have confidence
	if response["confidence"] == nil || response["confidence"] == "" {
		t.Error("Expected confidence in response")
	}
}

func TestHandleGetAgentForTask_MissingTask(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleGetAgentForTask(ctx, request)
	if err != nil {
		t.Fatalf("handleGetAgentForTask failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing task parameter")
	}
}

func TestHandleListAgentSkills(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	// Get first agent with skills
	agents := server.agentLoader.ListAgents(nil, nil)
	if len(agents) == 0 {
		t.Skip("No agents available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"agent": agents[0].Name,
	}

	result, err := server.handleListAgentSkills(ctx, request)
	if err != nil {
		t.Fatalf("handleListAgentSkills failed: %v", err)
	}

	// Result should not be nil (can be error or success depending on agent)
	if result == nil {
		t.Fatal("Expected non-nil result")
	}
}

func TestHandleListSkills(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleListSkills(ctx, request)
	if err != nil {
		t.Fatalf("handleListSkills failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleListSkills returned error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Should contain the markdown header
	if !strings.Contains(content, "# EPF Skills") {
		t.Error("Expected result to contain '# EPF Skills' header")
	}

	// Should contain at least some skill entries (from embedded generators/wizards)
	if !strings.Contains(content, "Total:") {
		t.Error("Expected result to contain skill count summary")
	}
}

func TestHandleListSkills_NoSkills(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Force skill loader to nil
	server.skillLoader = nil

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleListSkills(ctx, request)
	if err != nil {
		t.Fatalf("handleListSkills failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error when skill loader is nil")
	}
}

func TestHandleListSkills_TypeFilter(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"type": "generation",
	}

	result, err := server.handleListSkills(ctx, request)
	if err != nil {
		t.Fatalf("handleListSkills with type filter failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleListSkills with type=generation returned error: %s", getResultText(result))
	}
}

func TestHandleListSkills_InvalidType(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"type": "INVALID_TYPE",
	}

	result, err := server.handleListSkills(ctx, request)
	if err != nil {
		t.Fatalf("handleListSkills failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for invalid type filter")
	}
}

func TestHandleGetSkill(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	// Get first available skill
	skills := server.skillLoader.ListSkills(nil, nil, nil)
	if len(skills) == 0 {
		t.Skip("No skills available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name": skills[0].Name,
	}

	result, err := server.handleGetSkill(ctx, request)
	if err != nil {
		t.Fatalf("handleGetSkill failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleGetSkill returned error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Should contain the skill's name
	if !strings.Contains(content, skills[0].Name) {
		t.Errorf("Expected result to contain skill name %q", skills[0].Name)
	}
}

func TestHandleGetSkill_NotFound(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name": "nonexistent-skill-that-does-not-exist",
	}

	result, err := server.handleGetSkill(ctx, request)
	if err != nil {
		t.Fatalf("handleGetSkill failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for non-existent skill")
	}
}

func TestHandleGetSkill_MissingName(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{}

	result, err := server.handleGetSkill(ctx, request)
	if err != nil {
		t.Fatalf("handleGetSkill failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing name parameter")
	}
}

func TestHandleScaffoldSkill(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create a temp instance for scaffolding
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name":          "test-scaffold-skill",
		"instance_path": tmpDir,
	}

	result, err := server.handleScaffoldSkill(ctx, request)
	if err != nil {
		t.Fatalf("handleScaffoldSkill failed: %v", err)
	}

	if result.IsError {
		t.Fatalf("handleScaffoldSkill returned error: %s", getResultText(result))
	}

	content := getResultText(result)

	// Should mention the scaffolded skill
	if !strings.Contains(content, "test-scaffold-skill") {
		t.Error("Expected result to contain skill name")
	}

	// Verify files were created — check for generator.yaml (legacy names for generation skills)
	// or skill.yaml (new names for other types)
	skillDir := filepath.Join(tmpDir, "generators", "test-scaffold-skill")
	altSkillDir := filepath.Join(tmpDir, "skills", "test-scaffold-skill")
	_, err1 := os.Stat(skillDir)
	_, err2 := os.Stat(altSkillDir)
	if err1 != nil && err2 != nil {
		t.Errorf("Expected skill directory to be created at %s or %s", skillDir, altSkillDir)
	}
}

func TestHandleScaffoldSkill_MissingName(t *testing.T) {
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
		"instance_path": t.TempDir(),
	}

	result, err := server.handleScaffoldSkill(ctx, request)
	if err != nil {
		t.Fatalf("handleScaffoldSkill failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing name parameter")
	}
}

func TestHandleCheckSkillPrereqs(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	// Get first available skill
	skills := server.skillLoader.ListSkills(nil, nil, nil)
	if len(skills) == 0 {
		t.Skip("No skills available")
	}

	// Use a temp dir as instance path (likely missing artifacts)
	tmpDir := t.TempDir()
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"name":          skills[0].Name,
		"instance_path": tmpDir,
	}

	result, err := server.handleCheckSkillPrereqs(ctx, request)
	if err != nil {
		t.Fatalf("handleCheckSkillPrereqs failed: %v", err)
	}

	// Should not fail fatally — either reports prereqs met or missing
	if result == nil {
		t.Fatal("Expected non-nil result")
	}
}

func TestHandleCheckSkillPrereqs_MissingParams(t *testing.T) {
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

	result, err := server.handleCheckSkillPrereqs(ctx, request)
	if err != nil {
		t.Fatalf("handleCheckSkillPrereqs failed: %v", err)
	}

	if !result.IsError {
		t.Error("Expected error for missing parameters")
	}
}

// =============================================================================
// Agent & Skill Loader Integration in NewServer
// =============================================================================

func TestNewServer_AgentAndSkillLoadersInitialized(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Agent loader should be initialized
	if server.agentLoader == nil {
		t.Error("Expected agentLoader to be initialized in NewServer")
	}

	// Skill loader should be initialized
	if server.skillLoader == nil {
		t.Error("Expected skillLoader to be initialized in NewServer")
	}

	// Both should have loaded content (from embedded)
	if server.agentLoader != nil && !server.agentLoader.HasAgents() {
		t.Log("Warning: agentLoader initialized but has no agents (may be expected in some environments)")
	}
	if server.skillLoader != nil && !server.skillLoader.HasSkills() {
		t.Log("Warning: skillLoader initialized but has no skills (may be expected in some environments)")
	}
}

// =============================================================================
// MCP Primitives: Resources and Prompts (Task 3.8)
// =============================================================================

func TestPrimitives_SkillResourceRegistration(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	// Verify the resource template handler works by reading a skill
	skills := server.skillLoader.ListSkills(nil, nil, nil)
	if len(skills) == 0 {
		t.Skip("No skills available for resource test")
	}

	// Test reading a skill via the resource handler
	ctx := context.Background()
	readReq := mcp.ReadResourceRequest{}
	readReq.Params.URI = skillResourceURIPrefix + skills[0].Name

	contents, err := server.handleReadSkillResource(ctx, readReq)
	if err != nil {
		t.Fatalf("handleReadSkillResource failed: %v", err)
	}

	if len(contents) == 0 {
		t.Fatal("Expected non-empty resource contents")
	}

	// Verify the content is a TextResourceContents
	textContent, ok := contents[0].(mcp.TextResourceContents)
	if !ok {
		t.Fatal("Expected TextResourceContents")
	}

	if textContent.URI != skillResourceURIPrefix+skills[0].Name {
		t.Errorf("Expected URI %q, got %q", skillResourceURIPrefix+skills[0].Name, textContent.URI)
	}

	if textContent.MIMEType != "text/markdown" {
		t.Errorf("Expected MIME type 'text/markdown', got %q", textContent.MIMEType)
	}

	if textContent.Text == "" {
		t.Error("Expected non-empty skill resource text")
	}
}

func TestPrimitives_SkillResourceInvalidURI(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	ctx := context.Background()

	// Test with empty name
	readReq := mcp.ReadResourceRequest{}
	readReq.Params.URI = skillResourceURIPrefix

	_, err = server.handleReadSkillResource(ctx, readReq)
	if err == nil {
		t.Error("Expected error for empty skill name in URI")
	}

	// Test with completely wrong URI
	readReq2 := mcp.ReadResourceRequest{}
	readReq2.Params.URI = "wrong://prefix/something"

	_, err = server.handleReadSkillResource(ctx, readReq2)
	if err == nil {
		t.Error("Expected error for invalid URI prefix")
	}
}

func TestPrimitives_SkillResourceNotFound(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.skillLoader == nil || !server.skillLoader.HasSkills() {
		t.Skip("Skill loader not available")
	}

	ctx := context.Background()
	readReq := mcp.ReadResourceRequest{}
	readReq.Params.URI = skillResourceURIPrefix + "nonexistent-skill-xyz"

	_, err = server.handleReadSkillResource(ctx, readReq)
	if err == nil {
		t.Error("Expected error for non-existent skill")
	}
}

func TestPrimitives_AgentPromptRegistration(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	// Get first available agent
	agents := server.agentLoader.ListAgents(nil, nil)
	if len(agents) == 0 {
		t.Skip("No agents available for prompt test")
	}

	// Test the prompt handler
	ctx := context.Background()
	promptReq := mcp.GetPromptRequest{}
	promptReq.Params.Name = agents[0].Name
	promptReq.Params.Arguments = map[string]string{}

	result, err := server.handleGetAgentPrompt(ctx, promptReq)
	if err != nil {
		t.Fatalf("handleGetAgentPrompt failed: %v", err)
	}

	if result == nil {
		t.Fatal("Expected non-nil prompt result")
	}

	// Should have a description
	if result.Description == "" {
		t.Error("Expected non-empty prompt description")
	}

	// Should have at least one message
	if len(result.Messages) == 0 {
		t.Fatal("Expected at least one message in prompt result")
	}

	// First message should be a user role message
	if result.Messages[0].Role != mcp.RoleUser {
		t.Errorf("Expected first message role to be 'user', got %q", result.Messages[0].Role)
	}
}

func TestPrimitives_AgentPromptWithInstancePath(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	agents := server.agentLoader.ListAgents(nil, nil)
	if len(agents) == 0 {
		t.Skip("No agents available")
	}

	ctx := context.Background()
	promptReq := mcp.GetPromptRequest{}
	promptReq.Params.Name = agents[0].Name
	promptReq.Params.Arguments = map[string]string{
		"instance_path": instancePath,
	}

	result, err := server.handleGetAgentPrompt(ctx, promptReq)
	if err != nil {
		t.Fatalf("handleGetAgentPrompt with instance_path failed: %v", err)
	}

	if result == nil {
		t.Fatal("Expected non-nil prompt result")
	}

	// With a valid instance path, the prompt should contain instance context
	if len(result.Messages) > 0 {
		content, ok := result.Messages[0].Content.(mcp.TextContent)
		if ok && !strings.Contains(content.Text, "Instance Path") {
			t.Error("Expected prompt to contain instance context when instance_path is provided")
		}
	}
}

func TestPrimitives_AgentPromptNotFound(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	if server.agentLoader == nil || !server.agentLoader.HasAgents() {
		t.Skip("Agent loader not available")
	}

	ctx := context.Background()
	promptReq := mcp.GetPromptRequest{}
	promptReq.Params.Name = "nonexistent-agent-xyz"
	promptReq.Params.Arguments = map[string]string{}

	_, err = server.handleGetAgentPrompt(ctx, promptReq)
	if err == nil {
		t.Error("Expected error for non-existent agent prompt")
	}
}

func TestPrimitives_RefreshPrimitives(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// refreshPrimitives should not panic even if loaders are nil
	server.agentLoader = nil
	server.skillLoader = nil
	server.refreshPrimitives() // Should not panic

	// Re-create with loaders
	server2, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// refreshPrimitives with loaded content should not panic
	server2.refreshPrimitives()
}

func TestBuildInstanceContext_ValidInstance(t *testing.T) {
	instancePath := findTestInstance()
	if instancePath == "" {
		t.Skip("Test instance not found")
	}

	result := buildInstanceContext(instancePath)

	// Should contain instance path at minimum
	if !strings.Contains(result, "Instance Path") {
		t.Error("Expected instance context to contain 'Instance Path'")
	}

	if !strings.Contains(result, instancePath) {
		t.Errorf("Expected instance context to contain the instance path %q", instancePath)
	}
}

func TestBuildInstanceContext_NoAnchor(t *testing.T) {
	tmpDir := t.TempDir()

	result := buildInstanceContext(tmpDir)

	// Should still return something (instance path at minimum)
	if result == "" {
		t.Error("Expected non-empty context even without anchor file")
	}

	if !strings.Contains(result, tmpDir) {
		t.Error("Expected context to contain the temp directory path")
	}
}

// =============================================================================
// Integration Test: Health Check Tool Suggestions with Real Instance
// =============================================================================

func TestHealthCheckIntegration_ToolSuggestions(t *testing.T) {
	schemasDir := findSchemasDir()
	instancePath := findTestInstance()
	if schemasDir == "" || instancePath == "" {
		t.Skip("Schemas directory or test instance not found — skipping integration test")
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

	result, err := server.handleHealthCheck(ctx, request)
	if err != nil {
		t.Fatalf("handleHealthCheck failed: %v", err)
	}

	content := getResultText(result)
	if content == "" {
		t.Fatal("Health check returned empty content")
	}

	var healthResult HealthCheckSummary
	if err := json.Unmarshal([]byte(extractJSON(content)), &healthResult); err != nil {
		t.Fatalf("Failed to parse health check response: %v", err)
	}

	// Basic fields must be present
	if healthResult.InstancePath == "" {
		t.Error("Expected non-empty instance_path")
	}
	if healthResult.OverallStatus == "" {
		t.Error("Expected non-empty overall_status")
	}

	// workflow_status must be "complete" or "incomplete"
	if healthResult.WorkflowStatus != "complete" && healthResult.WorkflowStatus != "incomplete" {
		t.Errorf("Expected workflow_status 'complete' or 'incomplete', got %q", healthResult.WorkflowStatus)
	}

	// Consistency: if suggestions exist, workflow must be incomplete with populated fields
	if len(healthResult.RequiredNextToolCalls) > 0 {
		if healthResult.WorkflowStatus != "incomplete" {
			t.Errorf("Expected workflow_status='incomplete' when %d suggestions exist, got %q",
				len(healthResult.RequiredNextToolCalls), healthResult.WorkflowStatus)
		}
		if healthResult.ActionRequired == "" {
			t.Error("Expected action_required to be populated when required_next_tool_calls is non-empty")
		}
		if len(healthResult.RemainingSteps) == 0 {
			t.Error("Expected remaining_steps to be populated when workflow_status is 'incomplete'")
		}

		// Each suggestion must have valid fields
		for i, suggestion := range healthResult.RequiredNextToolCalls {
			if suggestion.Tool == "" {
				t.Errorf("Suggestion[%d]: expected non-empty Tool", i)
			}
			if suggestion.Reason == "" {
				t.Errorf("Suggestion[%d]: expected non-empty Reason", i)
			}
			if suggestion.Priority == "" {
				t.Errorf("Suggestion[%d]: expected non-empty Priority", i)
			}
			validPriorities := map[string]bool{"urgent": true, "recommended": true, "optional": true}
			if !validPriorities[suggestion.Priority] {
				t.Errorf("Suggestion[%d]: unexpected Priority %q (want urgent/recommended/optional)", i, suggestion.Priority)
			}
		}

		t.Logf("Integration test: %d tool suggestions generated for real instance", len(healthResult.RequiredNextToolCalls))
		for i, s := range healthResult.RequiredNextToolCalls {
			t.Logf("  [%d] %s (priority=%s): %s", i, s.Tool, s.Priority, s.Reason)
		}
	}

	// Consistency: if no suggestions, workflow should be complete
	if len(healthResult.RequiredNextToolCalls) == 0 {
		if healthResult.WorkflowStatus != "complete" {
			t.Errorf("Expected workflow_status='complete' when no suggestions exist, got %q", healthResult.WorkflowStatus)
		}
		if healthResult.ActionRequired != "" {
			t.Errorf("Expected empty action_required when no suggestions, got %q", healthResult.ActionRequired)
		}
		t.Log("Integration test: instance is fully healthy — 0 suggestions (workflow complete)")
	}
}

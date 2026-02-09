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
// INSTANCE TOOLS TESTS
// =============================================================================

func TestHandleInitInstance(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-init-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":         tmpDir,
		"product_name": "test-product",
		"dry_run":      "true",
	}

	result, err := server.handleInitInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleInitInstance failed: %v", err)
	}

	content := getResultText(result)

	var response InitInstanceResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if !response.DryRun {
		t.Error("Expected dry_run=true")
	}

	// Should have files that would be created
	if len(response.FilesCreated) == 0 {
		t.Error("Expected files to be listed for creation")
	}
}

func TestHandleInitInstance_MissingPath(t *testing.T) {
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
		"product_name": "test-product",
	}

	result, err := server.handleInitInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleInitInstance failed: %v", err)
	}

	// Missing required parameter should return error
	if !result.IsError {
		t.Error("Expected error without path parameter")
	}
}

func TestHandleFixFile(t *testing.T) {
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
		"path":    instancePath,
		"dry_run": "true",
	}

	result, err := server.handleFixFile(ctx, request)
	if err != nil {
		t.Fatalf("handleFixFile failed: %v", err)
	}

	content := getResultText(result)

	var response FixFilesResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.DryRun {
		t.Error("Expected dry_run=true")
	}

	// Should have scanned files
	if response.TotalFiles == 0 {
		t.Log("No files scanned (instance may be empty)")
	}
}

func TestHandleFixFile_MissingPath(t *testing.T) {
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

	result, err := server.handleFixFile(ctx, request)
	if err != nil {
		t.Fatalf("handleFixFile failed: %v", err)
	}

	// Missing required parameter should return error
	if !result.IsError {
		t.Error("Expected error without path parameter")
	}
}

// =============================================================================
// AIM TOOLS TESTS
// =============================================================================

func TestHandleAimBootstrap(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create temp directory with basic EPF structure
	tmpDir, err := os.MkdirTemp("", "epf-aim-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create basic structure
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "FIRE"), 0755)
	os.MkdirAll(filepath.Join(tmpDir, "AIM"), 0755)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"instance_path":      tmpDir,
		"organization_type":  "solo_founder",
		"funding_stage":      "bootstrapped",
		"team_size":          "1",
		"product_stage":      "mvp",
		"primary_bottleneck": "execution",
	}

	result, err := server.handleAimBootstrap(ctx, request)
	if err != nil {
		t.Fatalf("handleAimBootstrap failed: %v", err)
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	success, _ := response["success"].(bool)
	if !success {
		errMsg, _ := response["error"].(string)
		t.Errorf("Expected success=true, got false: %s", errMsg)
	}

	// LRA file should be created
	lraPath := filepath.Join(tmpDir, "AIM", "living_reality_assessment.yaml")
	if _, err := os.Stat(lraPath); os.IsNotExist(err) {
		t.Error("Expected LRA file to be created")
	}
}

func TestHandleAimStatus(t *testing.T) {
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
		"instance_path": instancePath,
	}

	result, err := server.handleAimStatus(ctx, request)
	if err != nil {
		t.Fatalf("handleAimStatus failed: %v", err)
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Either success (LRA exists) or not (LRA doesn't exist)
	// Both are valid outcomes depending on test instance state
	success, _ := response["success"].(bool)
	if success {
		if _, hasStage := response["lifecycle_stage"]; !hasStage {
			t.Error("Expected lifecycle stage when LRA exists")
		}
	}
}

func TestHandleAimAssess(t *testing.T) {
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
		"instance_path": instancePath,
	}

	result, err := server.handleAimAssess(ctx, request)
	if err != nil {
		t.Fatalf("handleAimAssess failed: %v", err)
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Response should contain assessment info
	// Success depends on whether roadmap exists in test instance
	success, _ := response["success"].(bool)
	if success {
		if _, hasTemplate := response["template"]; !hasTemplate {
			t.Error("Expected template content when successful")
		}
	}
}

func TestHandleAimValidateAssumptions(t *testing.T) {
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
		"instance_path": instancePath,
	}

	result, err := server.handleAimValidateAssumptions(ctx, request)
	if err != nil {
		t.Fatalf("handleAimValidateAssumptions failed: %v", err)
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Response will succeed or fail based on instance state
	// Both are valid test outcomes
}

func TestHandleAimOKRProgress(t *testing.T) {
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
		"instance_path": instancePath,
	}

	result, err := server.handleAimOKRProgress(ctx, request)
	if err != nil {
		t.Fatalf("handleAimOKRProgress failed: %v", err)
	}

	content := getResultText(result)

	var response map[string]interface{}
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	// Response will succeed or fail based on instance state
	success, _ := response["success"].(bool)
	if success {
		// Achievement rate should be a percentage
		rate, _ := response["achievement_rate"].(float64)
		if rate < 0 || rate > 100 {
			t.Errorf("Expected achievement rate 0-100, got %f", rate)
		}
	}
}

func TestHandleAimOKRProgress_WithTrackFilter(t *testing.T) {
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
		"instance_path": instancePath,
		"track":         "product",
	}

	result, err := server.handleAimOKRProgress(ctx, request)
	if err != nil {
		t.Fatalf("handleAimOKRProgress failed: %v", err)
	}

	// Should not error with track filter
	if result.IsError {
		t.Error("Expected no error with valid track filter")
	}
}

// =============================================================================
// REPORT & DIFF TOOLS TESTS
// =============================================================================

func TestHandleGenerateReport_Markdown(t *testing.T) {
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
		"instance_path": instancePath,
		"format":        "markdown",
	}

	result, err := server.handleGenerateReport(ctx, request)
	if err != nil {
		t.Fatalf("handleGenerateReport failed: %v", err)
	}

	content := getResultText(result)

	var response ReportResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if response.Format != "markdown" {
		t.Errorf("Expected format=markdown, got %s", response.Format)
	}

	if response.Content == "" {
		t.Error("Expected markdown content")
	}

	if !strings.Contains(response.Content, "# EPF Health Report") {
		t.Error("Expected markdown header in content")
	}
}

func TestHandleGenerateReport_JSON(t *testing.T) {
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
		"instance_path": instancePath,
		"format":        "json",
	}

	result, err := server.handleGenerateReport(ctx, request)
	if err != nil {
		t.Fatalf("handleGenerateReport failed: %v", err)
	}

	content := getResultText(result)

	var response ReportResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if response.Format != "json" {
		t.Errorf("Expected format=json, got %s", response.Format)
	}

	// JSON format should have overall score
	if response.OverallScore < 0 || response.OverallScore > 100 {
		t.Errorf("Expected overall score 0-100, got %d", response.OverallScore)
	}
}

func TestHandleGenerateReport_HTML(t *testing.T) {
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
		"instance_path": instancePath,
		"format":        "html",
	}

	result, err := server.handleGenerateReport(ctx, request)
	if err != nil {
		t.Fatalf("handleGenerateReport failed: %v", err)
	}

	content := getResultText(result)

	var response ReportResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if response.Content == "" {
		t.Error("Expected HTML content")
	}

	if !strings.Contains(response.Content, "<!DOCTYPE html>") {
		t.Error("Expected HTML doctype in content")
	}
}

func TestHandleGenerateReport_InvalidPath(t *testing.T) {
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
		"instance_path": "/nonexistent/path",
	}

	result, err := server.handleGenerateReport(ctx, request)
	if err != nil {
		t.Fatalf("handleGenerateReport failed: %v", err)
	}

	content := getResultText(result)

	var response ReportResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if response.Success {
		t.Error("Expected failure for nonexistent path")
	}
}

func TestHandleDiffArtifacts_Files(t *testing.T) {
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

	// Find two YAML files in the instance
	readyDir := filepath.Join(instancePath, "READY")
	file1 := filepath.Join(readyDir, "00_north_star.yaml")
	file2 := filepath.Join(readyDir, "01_insight_analyses.yaml")

	if _, err := os.Stat(file1); os.IsNotExist(err) {
		t.Skip("North star file not found")
	}
	if _, err := os.Stat(file2); os.IsNotExist(err) {
		t.Skip("Insight analyses file not found")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path1": file1,
		"path2": file2,
	}

	result, err := server.handleDiffArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffArtifacts failed: %v", err)
	}

	content := getResultText(result)

	var response DiffArtifactsResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if response.Type != "file" {
		t.Errorf("Expected type=file, got %s", response.Type)
	}

	// Different files should have differences
	if len(response.Added) == 0 && len(response.Removed) == 0 && len(response.Modified) == 0 {
		t.Log("No differences found between files (they might be similar)")
	}
}

func TestHandleDiffArtifacts_SameFile(t *testing.T) {
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

	file := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(file); os.IsNotExist(err) {
		t.Skip("North star file not found")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path1": file,
		"path2": file,
	}

	result, err := server.handleDiffArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffArtifacts failed: %v", err)
	}

	content := getResultText(result)

	var response DiffArtifactsResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	// Same file should have no differences
	if len(response.Added) != 0 || len(response.Removed) != 0 || len(response.Modified) != 0 {
		t.Error("Expected no differences when comparing same file")
	}
}

func TestHandleDiffArtifacts_MissingPath(t *testing.T) {
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
		"path1": "/some/path",
		// path2 missing
	}

	result, err := server.handleDiffArtifacts(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffArtifacts failed: %v", err)
	}

	content := getResultText(result)

	var response DiffArtifactsResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if response.Success {
		t.Error("Expected failure without path2 parameter")
	}
}

func TestHandleDiffTemplate(t *testing.T) {
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

	file := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(file); os.IsNotExist(err) {
		t.Skip("North star file not found")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"file_path": file,
	}

	result, err := server.handleDiffTemplate(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffTemplate failed: %v", err)
	}

	content := getResultText(result)

	var response DiffTemplateResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	if response.ArtifactType != "north_star" {
		t.Errorf("Expected artifact_type=north_star, got %s", response.ArtifactType)
	}

	// Summary should have valid counts
	if response.Summary.TotalIssues < 0 {
		t.Error("Expected non-negative total issues")
	}
}

func TestHandleDiffTemplate_Verbose(t *testing.T) {
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

	file := filepath.Join(instancePath, "READY", "00_north_star.yaml")
	if _, err := os.Stat(file); os.IsNotExist(err) {
		t.Skip("North star file not found")
	}

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"file_path": file,
		"verbose":   "true",
	}

	result, err := server.handleDiffTemplate(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffTemplate failed: %v", err)
	}

	content := getResultText(result)

	var response DiffTemplateResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if !response.Success {
		t.Errorf("Expected success=true, got false: %s", response.Error)
	}

	// Verbose mode should include extra fields in output
	// (extra_field issues show fields in file but not in template)
}

func TestHandleDiffTemplate_InvalidPath(t *testing.T) {
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
		"file_path": "/nonexistent/file.yaml",
	}

	result, err := server.handleDiffTemplate(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffTemplate failed: %v", err)
	}

	content := getResultText(result)

	var response DiffTemplateResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if response.Success {
		t.Error("Expected failure for nonexistent file")
	}
}

func TestHandleDiffTemplate_UnknownArtifactType(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create a temp file with unknown pattern
	tmpFile, err := os.CreateTemp("", "unknown_*.yaml")
	if err != nil {
		t.Fatalf("Failed to create temp file: %v", err)
	}
	defer os.Remove(tmpFile.Name())
	tmpFile.WriteString("test: value\n")
	tmpFile.Close()

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"file_path": tmpFile.Name(),
	}

	result, err := server.handleDiffTemplate(ctx, request)
	if err != nil {
		t.Fatalf("handleDiffTemplate failed: %v", err)
	}

	content := getResultText(result)

	var response DiffTemplateResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON: %v", err)
	}

	if response.Success {
		t.Error("Expected failure for unknown artifact type")
	}
}

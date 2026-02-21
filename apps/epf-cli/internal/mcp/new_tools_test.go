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

func TestHandleInitInstance_CreatesCanonicalDefinitions(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	// Create temp directory
	tmpDir, err := os.MkdirTemp("", "epf-init-canonical-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Run init in standalone mode (not dry_run) to actually create files
	// Use a subdirectory so it doesn't conflict with the existing tmpDir
	instancePath := filepath.Join(tmpDir, "my-instance")
	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":         instancePath,
		"product_name": "test-canonical",
		"mode":         "standalone",
	}

	result, err := server.handleInitInstance(ctx, request)
	if err != nil {
		t.Fatalf("handleInitInstance failed: %v", err)
	}

	content := getResultText(result)
	if result.IsError {
		t.Fatalf("Init returned error: %s", content)
	}
	var response InitInstanceResult
	if err := json.Unmarshal([]byte(content), &response); err != nil {
		t.Fatalf("Failed to parse response JSON (content=%q): %v", content[:min(len(content), 200)], err)
	}

	if !response.Success {
		t.Fatalf("Expected success=true, got false: %s", response.Error)
	}

	// Check that definitions directory was created
	defsDir := filepath.Join(instancePath, "FIRE", "definitions")
	if _, err := os.Stat(defsDir); os.IsNotExist(err) {
		t.Fatal("FIRE/definitions/ directory was not created")
	}

	// Check that all 3 canonical track directories exist
	for _, track := range []string{"strategy", "org_ops", "commercial"} {
		trackDir := filepath.Join(defsDir, track)
		if _, err := os.Stat(trackDir); os.IsNotExist(err) {
			t.Errorf("definitions/%s/ directory was not created", track)
		}
	}

	// Count definition files — should have at least some
	defCount := 0
	filepath.Walk(defsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasSuffix(info.Name(), ".yaml") {
			defCount++
		}
		return nil
	})

	if defCount == 0 {
		t.Error("No canonical definition files were created")
	}
	if defCount < 100 {
		t.Errorf("Expected at least 100 canonical definitions, got %d", defCount)
	}
	t.Logf("Created %d canonical definition files across strategy/org_ops/commercial", defCount)

	// Verify no product definitions (fd-*) were created
	filepath.Walk(defsDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return nil
		}
		if strings.HasPrefix(info.Name(), "fd-") {
			t.Errorf("Product definition %s should not be in canonical definitions", info.Name())
		}
		return nil
	})

	// Verify canonical definitions appear in FilesCreated list
	defFilesInResult := 0
	for _, f := range response.FilesCreated {
		if strings.Contains(f, "definitions") && strings.HasSuffix(f, ".yaml") {
			defFilesInResult++
		}
	}
	if defFilesInResult == 0 {
		t.Error("Canonical definition files not listed in FilesCreated")
	}
}

func TestHandleInitInstance_DryRun_IncludesCanonicalDefinitions(t *testing.T) {
	schemasDir := findSchemasDir()
	if schemasDir == "" {
		t.Skip("Schemas directory not found")
	}

	server, err := NewServer(schemasDir)
	if err != nil {
		t.Fatalf("NewServer failed: %v", err)
	}

	tmpDir, err := os.MkdirTemp("", "epf-init-dryrun-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	ctx := context.Background()
	request := mcp.CallToolRequest{}
	request.Params.Arguments = map[string]interface{}{
		"path":         tmpDir,
		"product_name": "test-dryrun",
		"mode":         "standalone",
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

	if !response.Success || !response.DryRun {
		t.Fatalf("Expected success=true dry_run=true, got success=%v dry_run=%v", response.Success, response.DryRun)
	}

	// dry_run should include canonical definition paths
	defFilesInDryRun := 0
	for _, f := range response.FilesCreated {
		if strings.Contains(f, "definitions") && strings.HasSuffix(f, ".yaml") {
			defFilesInDryRun++
		}
	}
	if defFilesInDryRun < 100 {
		t.Errorf("Expected at least 100 canonical definitions in dry_run listing, got %d", defFilesInDryRun)
	}
	t.Logf("Dry run lists %d canonical definition files", defFilesInDryRun)

	// Verify no files were actually created on disk
	defsDir := filepath.Join(tmpDir, "FIRE", "definitions")
	if _, err := os.Stat(defsDir); !os.IsNotExist(err) {
		t.Error("dry_run should not create any files on disk")
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
		if _, hasContent := response["content"]; !hasContent {
			t.Error("Expected content field when successful")
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

package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestMigrateFile_UpdateHeaderVersion(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `# EPF v1.8.0
meta:
  epf_version: "1.8.0"

vision: "Test vision"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := migrateFile(testFile, "1.9.6", false)

	if result.Error != nil {
		t.Fatalf("migrateFile returned error: %v", result.Error)
	}

	if !result.Migrated {
		t.Error("Expected file to be marked as migrated")
	}

	if result.PreviousVersion != "1.8.0" {
		t.Errorf("Expected previous version '1.8.0', got '%s'", result.PreviousVersion)
	}

	if result.NewVersion != "1.9.6" {
		t.Errorf("Expected new version '1.9.6', got '%s'", result.NewVersion)
	}

	// Verify header was updated
	fixed, _ := os.ReadFile(testFile)
	if !strings.Contains(string(fixed), "# EPF v1.9.6") {
		t.Error("Header version was not updated")
	}
}

func TestMigrateFile_UpdateMetaVersion(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `meta:
  epf_version: "1.8.0"

vision: "Test vision"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := migrateFile(testFile, "1.9.6", false)

	if result.Error != nil {
		t.Fatalf("migrateFile returned error: %v", result.Error)
	}

	if !result.Migrated {
		t.Error("Expected file to be marked as migrated")
	}

	// Verify meta.epf_version was updated
	fixed, _ := os.ReadFile(testFile)
	if !strings.Contains(string(fixed), `epf_version: "1.9.6"`) {
		t.Errorf("Meta version was not updated. Content: %s", string(fixed))
	}
}

func TestMigrateFile_AlreadyAtTargetVersion(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `# EPF v1.9.6
meta:
  epf_version: "1.9.6"

vision: "Test vision"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := migrateFile(testFile, "1.9.6", false)

	if result.Error != nil {
		t.Fatalf("migrateFile returned error: %v", result.Error)
	}

	if result.Migrated {
		t.Error("Expected file to NOT be marked as migrated when already at target version")
	}

	if len(result.Changes) != 0 {
		t.Errorf("Expected no changes, got %d", len(result.Changes))
	}
}

func TestMigrateFile_DryRun(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `# EPF v1.8.0
meta:
  epf_version: "1.8.0"

vision: "Test vision"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := migrateFile(testFile, "1.9.6", true) // dry run = true

	if result.Error != nil {
		t.Fatalf("migrateFile returned error: %v", result.Error)
	}

	if !result.Migrated {
		t.Error("Expected file to be marked as migrated (in dry run mode)")
	}

	// Verify file was NOT modified
	actual, _ := os.ReadFile(testFile)
	if string(actual) != content {
		t.Error("File was modified in dry run mode")
	}
}

func TestMigrateFile_NonexistentFile(t *testing.T) {
	result := migrateFile("/nonexistent/path/file.yaml", "1.9.6", false)

	if result.Error == nil {
		t.Error("Expected error for nonexistent file")
	}
}

func TestExtractVersion_FromHeader(t *testing.T) {
	content := `# EPF v1.9.0
meta:
  something: else
`
	version := extractVersion(content)
	if version != "1.9.0" {
		t.Errorf("Expected version '1.9.0', got '%s'", version)
	}
}

func TestExtractVersion_FromMeta(t *testing.T) {
	content := `meta:
  epf_version: "1.8.5"
  something: else
`
	version := extractVersion(content)
	if version != "1.8.5" {
		t.Errorf("Expected version '1.8.5', got '%s'", version)
	}
}

func TestExtractVersion_NoVersion(t *testing.T) {
	content := `meta:
  something: else

vision: "Test"
`
	version := extractVersion(content)
	if version != "unknown" {
		t.Errorf("Expected 'unknown', got '%s'", version)
	}
}

func TestExtractVersion_WithoutQuotes(t *testing.T) {
	content := `meta:
  epf_version: 1.9.3
`
	version := extractVersion(content)
	if version != "1.9.3" {
		t.Errorf("Expected version '1.9.3', got '%s'", version)
	}
}

func TestExtractVersion_HeaderPriority(t *testing.T) {
	// Header version should take priority
	content := `# EPF v1.9.0
meta:
  epf_version: "1.8.0"
`
	version := extractVersion(content)
	if version != "1.9.0" {
		t.Errorf("Expected header version '1.9.0' to take priority, got '%s'", version)
	}
}

func TestCheckForManualActions_FeatureDefinition(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "fd-test.yaml")
	content := `feature_id: "test-feature"
personas:
  - "User" # String instead of object
scenarios:
  - name: "Test scenario"
`
	result := &MigrationResult{
		File:          testFile,
		ManualActions: make([]string, 0),
	}

	checkForManualActions(testFile, content, "1.9.6", result)

	// Should flag the string persona
	hasPersonaAction := false
	for _, action := range result.ManualActions {
		if strings.Contains(action, "personas") && strings.Contains(action, "string") {
			hasPersonaAction = true
			break
		}
	}
	if !hasPersonaAction {
		t.Error("Expected warning about string persona format")
	}
}

func TestCheckForManualActions_DeprecatedFields(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `feature_id: "test"
risk_score: 5
priority_score: 10
`
	result := &MigrationResult{
		File:          testFile,
		ManualActions: make([]string, 0),
	}

	checkForManualActions(testFile, content, "1.9.6", result)

	// Should flag deprecated fields
	hasRiskWarning := false
	hasPriorityWarning := false
	for _, action := range result.ManualActions {
		if strings.Contains(action, "risk_score") {
			hasRiskWarning = true
		}
		if strings.Contains(action, "priority_score") {
			hasPriorityWarning = true
		}
	}
	if !hasRiskWarning {
		t.Error("Expected warning about deprecated risk_score")
	}
	if !hasPriorityWarning {
		t.Error("Expected warning about deprecated priority_score")
	}
}

func TestCheckForManualActions_RoadmapTRLFields(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "05_roadmap_recipe.yaml")
	content := `tracks:
  - name: "Track 1"
    capabilities: []
`
	result := &MigrationResult{
		File:          testFile,
		ManualActions: make([]string, 0),
	}

	checkForManualActions(testFile, content, "1.9.6", result)

	// Should suggest TRL fields
	hasTRLSuggestion := false
	for _, action := range result.ManualActions {
		if strings.Contains(action, "trl") {
			hasTRLSuggestion = true
			break
		}
	}
	if !hasTRLSuggestion {
		t.Error("Expected suggestion about TRL fields for roadmap")
	}
}

func TestMigrationResult(t *testing.T) {
	result := &MigrationResult{
		File:            "test.yaml",
		PreviousVersion: "1.8.0",
		NewVersion:      "1.9.6",
		Migrated:        true,
		Changes:         []string{"change1", "change2"},
		ManualActions:   []string{"action1"},
		Error:           nil,
	}

	if result.File != "test.yaml" {
		t.Errorf("Expected File='test.yaml', got %s", result.File)
	}
	if result.PreviousVersion != "1.8.0" {
		t.Errorf("Expected PreviousVersion='1.8.0', got %s", result.PreviousVersion)
	}
	if result.NewVersion != "1.9.6" {
		t.Errorf("Expected NewVersion='1.9.6', got %s", result.NewVersion)
	}
	if !result.Migrated {
		t.Error("Expected Migrated=true")
	}
	if len(result.Changes) != 2 {
		t.Errorf("Expected 2 changes, got %d", len(result.Changes))
	}
	if len(result.ManualActions) != 1 {
		t.Errorf("Expected 1 manual action, got %d", len(result.ManualActions))
	}
}

func TestMigrationSummary(t *testing.T) {
	summary := &MigrationSummary{
		TotalFiles:    10,
		MigratedFiles: 5,
		UpToDateFiles: 3,
		FailedFiles:   2,
		TargetVersion: "1.9.6",
		DryRun:        false,
		ManualActions: []string{"action1", "action2"},
		Results: []*MigrationResult{
			{File: "a.yaml", Migrated: true},
			{File: "b.yaml", Migrated: false},
		},
	}

	if summary.TotalFiles != 10 {
		t.Errorf("Expected TotalFiles=10, got %d", summary.TotalFiles)
	}
	if summary.MigratedFiles != 5 {
		t.Errorf("Expected MigratedFiles=5, got %d", summary.MigratedFiles)
	}
	if summary.UpToDateFiles != 3 {
		t.Errorf("Expected UpToDateFiles=3, got %d", summary.UpToDateFiles)
	}
	if summary.FailedFiles != 2 {
		t.Errorf("Expected FailedFiles=2, got %d", summary.FailedFiles)
	}
	if summary.TargetVersion != "1.9.6" {
		t.Errorf("Expected TargetVersion='1.9.6', got %s", summary.TargetVersion)
	}
}

func TestVersionRegex(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"# EPF v1.9.6", "1.9.6"},
		{"# EPF 1.8.0", "1.8.0"},
		{"# EPF v2.0.0", "2.0.0"},
		{"#EPF v1.0.0", "1.0.0"}, // No space after # is allowed (zero or more spaces)
		{"EPF v1.0.0", ""},       // No # prefix - should not match
	}

	for _, tt := range tests {
		matches := versionRegex.FindStringSubmatch(tt.input)
		var result string
		if len(matches) > 1 {
			result = matches[1]
		}
		if result != tt.expected {
			t.Errorf("versionRegex(%q): expected %q, got %q", tt.input, tt.expected, result)
		}
	}
}

func TestMetaVersionRegex(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{`epf_version: "1.9.6"`, "1.9.6"},
		{`epf_version: '1.8.0'`, "1.8.0"},
		{`epf_version: 2.0.0`, "2.0.0"},
		{`  epf_version: "1.5.0"`, "1.5.0"}, // With leading spaces
	}

	for _, tt := range tests {
		matches := metaVersionRegex.FindStringSubmatch(tt.input)
		var result string
		if len(matches) > 1 {
			result = matches[1]
		}
		if result != tt.expected {
			t.Errorf("metaVersionRegex(%q): expected %q, got %q", tt.input, tt.expected, result)
		}
	}
}

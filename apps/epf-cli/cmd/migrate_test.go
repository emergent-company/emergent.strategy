package cmd

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/emergent-company/emergent-strategy/apps/epf-cli/internal/schema"
)

// --- Test helpers ---

// helperMigrateFile calls migrateFile with a pre-populated result (simulating the old API).
// This keeps existing tests working without needing a real schemaVersionResolver.
func helperMigrateFile(path, targetVersion string, dryRun bool) *MigrationResult {
	result := &MigrationResult{
		File:          path,
		NewVersion:    targetVersion,
		ArtifactType:  "test",
		Changes:       make([]string, 0),
		ManualActions: make([]string, 0),
	}
	return migrateFile(path, targetVersion, dryRun, result)
}

// mockResolver implements schemaVersionResolver for testing.
type mockResolver struct {
	artifactTypes  map[string]schema.ArtifactType
	schemaVersions map[schema.ArtifactType]string
}

func (m *mockResolver) DetectArtifactType(path string) (schema.ArtifactType, error) {
	base := filepath.Base(path)
	if at, ok := m.artifactTypes[base]; ok {
		return at, nil
	}
	return "", fmt.Errorf("unknown artifact type for %s", base)
}

func (m *mockResolver) GetSchemaVersion(artifactType schema.ArtifactType) (string, error) {
	if v, ok := m.schemaVersions[artifactType]; ok {
		return v, nil
	}
	return "", fmt.Errorf("no schema version for %s", artifactType)
}

// --- Existing tests (updated for new migrateFile signature) ---

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

	result := helperMigrateFile(testFile, "1.9.6", false)

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

	result := helperMigrateFile(testFile, "1.9.6", false)

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

	result := helperMigrateFile(testFile, "1.9.6", false)

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

	result := helperMigrateFile(testFile, "1.9.6", true) // dry run = true

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
	result := helperMigrateFile("/nonexistent/path/file.yaml", "1.9.6", false)

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
		SkippedFiles:  1,
		FailedFiles:   1,
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
	if summary.SkippedFiles != 1 {
		t.Errorf("Expected SkippedFiles=1, got %d", summary.SkippedFiles)
	}
	if summary.FailedFiles != 1 {
		t.Errorf("Expected FailedFiles=1, got %d", summary.FailedFiles)
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

// --- New tests for per-artifact versioning and no-downgrade logic ---

func TestMigrateFile_NoDowngrade(t *testing.T) {
	// THE KEY BUG: file at 2.12.0 should NOT be downgraded to 2.1.0
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `# EPF v2.12.0
meta:
  epf_version: "2.12.0"

vision: "Test vision"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := helperMigrateFile(testFile, "2.1.0", false)

	if result.Error != nil {
		t.Fatalf("migrateFile returned error: %v", result.Error)
	}

	if result.Migrated {
		t.Error("Expected file to NOT be migrated (would be a downgrade from 2.12.0 to 2.1.0)")
	}

	if !result.Skipped {
		t.Error("Expected file to be marked as skipped (downgrade prevention)")
	}

	if !strings.Contains(result.SkipReason, "not downgrading") {
		t.Errorf("Expected skip reason to mention 'not downgrading', got: %s", result.SkipReason)
	}

	// Verify file was NOT modified
	actual, _ := os.ReadFile(testFile)
	if string(actual) != content {
		t.Error("File content was modified despite downgrade prevention")
	}
}

func TestMigrateFile_NoDowngrade_SameMajorHigherMinor(t *testing.T) {
	// 1.13.0 should NOT be downgraded to 1.9.0
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := `# EPF v1.13.0
meta:
  epf_version: "1.13.0"
`
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := helperMigrateFile(testFile, "1.9.0", false)

	if result.Migrated {
		t.Error("Expected file to NOT be migrated (downgrade from 1.13.0 to 1.9.0)")
	}
	if !result.Skipped {
		t.Error("Expected file to be skipped (downgrade prevention)")
	}
}

func TestMigrateFileWithResolver_SkipsNonSchemaFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create _meta.yaml (not a schema-backed artifact)
	metaFile := filepath.Join(tmpDir, "_meta.yaml")
	content := `epf_version: "2.12.0"
product_name: "Test"
`
	if err := os.WriteFile(metaFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	resolver := &mockResolver{
		artifactTypes:  map[string]schema.ArtifactType{},
		schemaVersions: map[schema.ArtifactType]string{},
	}

	result := migrateFileWithResolver(metaFile, resolver, false)

	if !result.Skipped {
		t.Error("Expected _meta.yaml to be skipped (not a schema-backed artifact)")
	}
	if result.Migrated {
		t.Error("Expected _meta.yaml to NOT be migrated")
	}
	if !strings.Contains(result.SkipReason, "not a schema-backed artifact") {
		t.Errorf("Expected skip reason about non-schema artifact, got: %s", result.SkipReason)
	}
}

func TestMigrateFileWithResolver_SkipsEpfYaml(t *testing.T) {
	tmpDir := t.TempDir()

	epfFile := filepath.Join(tmpDir, "_epf.yaml")
	content := `epf_version: "2.12.0"
instance_name: "test"
`
	if err := os.WriteFile(epfFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	resolver := &mockResolver{
		artifactTypes:  map[string]schema.ArtifactType{},
		schemaVersions: map[schema.ArtifactType]string{},
	}

	result := migrateFileWithResolver(epfFile, resolver, false)

	if !result.Skipped {
		t.Error("Expected _epf.yaml to be skipped")
	}
}

func TestMigrateFileWithResolver_PerArtifactVersioning(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a north_star file at version 1.10.0
	nsFile := filepath.Join(tmpDir, "00_north_star.yaml")
	nsContent := `# EPF v1.10.0
meta:
  epf_version: "1.10.0"

vision: "Test"
`
	if err := os.WriteFile(nsFile, []byte(nsContent), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	// Create a feature def file at version 1.10.0
	fdFile := filepath.Join(tmpDir, "fd-test.yaml")
	fdContent := `# EPF v1.10.0
meta:
  epf_version: "1.10.0"

feature_id: "test"
`
	if err := os.WriteFile(fdFile, []byte(fdContent), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	resolver := &mockResolver{
		artifactTypes: map[string]schema.ArtifactType{
			"00_north_star.yaml": schema.ArtifactNorthStar,
			"fd-test.yaml":       schema.ArtifactFeatureDefinition,
		},
		schemaVersions: map[schema.ArtifactType]string{
			schema.ArtifactNorthStar:         "1.13.0", // north_star schema version
			schema.ArtifactFeatureDefinition: "2.1.0",  // feature_definition schema version
		},
	}

	// North star: 1.10.0 -> 1.13.0 (upgrade)
	nsResult := migrateFileWithResolver(nsFile, resolver, true)
	if nsResult.Skipped {
		t.Errorf("Expected north_star to not be skipped, got: %s", nsResult.SkipReason)
	}
	if !nsResult.Migrated {
		t.Error("Expected north_star to be migrated from 1.10.0 to 1.13.0")
	}
	if nsResult.NewVersion != "1.13.0" {
		t.Errorf("Expected north_star target version '1.13.0', got '%s'", nsResult.NewVersion)
	}

	// Feature def: 1.10.0 -> 2.1.0 (upgrade)
	fdResult := migrateFileWithResolver(fdFile, resolver, true)
	if fdResult.Skipped {
		t.Errorf("Expected feature_def to not be skipped, got: %s", fdResult.SkipReason)
	}
	if !fdResult.Migrated {
		t.Error("Expected feature_def to be migrated from 1.10.0 to 2.1.0")
	}
	if fdResult.NewVersion != "2.1.0" {
		t.Errorf("Expected feature_def target version '2.1.0', got '%s'", fdResult.NewVersion)
	}
}

func TestMigrateFileWithResolver_NoDowngradeWithResolver(t *testing.T) {
	// THE EXACT BUG SCENARIO: _meta.yaml at 2.12.0 with schema version 2.1.0
	// This should be skipped because _meta.yaml is not a schema-backed artifact.
	// But also test the case where a real artifact is at a higher version.
	tmpDir := t.TempDir()

	// North star at 2.0.0 but schema is 1.13.0 — should not downgrade
	nsFile := filepath.Join(tmpDir, "00_north_star.yaml")
	nsContent := `# EPF v2.0.0
meta:
  epf_version: "2.0.0"

vision: "Test"
`
	if err := os.WriteFile(nsFile, []byte(nsContent), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	resolver := &mockResolver{
		artifactTypes: map[string]schema.ArtifactType{
			"00_north_star.yaml": schema.ArtifactNorthStar,
		},
		schemaVersions: map[schema.ArtifactType]string{
			schema.ArtifactNorthStar: "1.13.0",
		},
	}

	result := migrateFileWithResolver(nsFile, resolver, false)

	if result.Migrated {
		t.Error("Expected file NOT to be migrated (would downgrade from 2.0.0 to 1.13.0)")
	}
	if !result.Skipped {
		t.Error("Expected file to be skipped (downgrade prevention)")
	}

	// Verify file was NOT modified
	actual, _ := os.ReadFile(nsFile)
	if string(actual) != nsContent {
		t.Error("File was modified despite downgrade prevention")
	}
}

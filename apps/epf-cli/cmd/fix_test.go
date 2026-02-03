package cmd

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestFixFile_TrailingWhitespace(t *testing.T) {
	// Create temp file with trailing whitespace
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value   \nanother: test  \n"
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	// Run fix
	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if !result.Fixed {
		t.Error("Expected file to be marked as fixed")
	}

	if len(result.Changes) == 0 {
		t.Error("Expected changes to be recorded")
	}

	hasWhitespaceChange := false
	for _, change := range result.Changes {
		if strings.Contains(change, "whitespace") {
			hasWhitespaceChange = true
			break
		}
	}
	if !hasWhitespaceChange {
		t.Error("Expected trailing whitespace fix to be recorded")
	}

	// Verify content was fixed
	fixed, _ := os.ReadFile(testFile)
	if strings.Contains(string(fixed), "   \n") {
		t.Error("Trailing whitespace was not removed")
	}
}

func TestFixFile_CRLFLineEndings(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value\r\nanother: test\r\n"
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if !result.Fixed {
		t.Error("Expected file to be marked as fixed")
	}

	hasCRLFChange := false
	for _, change := range result.Changes {
		if strings.Contains(change, "CRLF") || strings.Contains(change, "line ending") {
			hasCRLFChange = true
			break
		}
	}
	if !hasCRLFChange {
		t.Error("Expected CRLF fix to be recorded")
	}

	// Verify CRLF was removed
	fixed, _ := os.ReadFile(testFile)
	if strings.Contains(string(fixed), "\r\n") {
		t.Error("CRLF line endings were not normalized")
	}
}

func TestFixFile_TabsToSpaces(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key:\n\tvalue: test\n"
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if !result.Fixed {
		t.Error("Expected file to be marked as fixed")
	}

	hasTabChange := false
	for _, change := range result.Changes {
		if strings.Contains(change, "tab") {
			hasTabChange = true
			break
		}
	}
	if !hasTabChange {
		t.Error("Expected tab conversion to be recorded")
	}

	// Verify tabs were converted
	fixed, _ := os.ReadFile(testFile)
	if strings.Contains(string(fixed), "\t") {
		t.Error("Tabs were not converted to spaces")
	}
}

func TestFixFile_MissingNewline(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value" // No trailing newline
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if !result.Fixed {
		t.Error("Expected file to be marked as fixed")
	}

	hasNewlineChange := false
	for _, change := range result.Changes {
		if strings.Contains(change, "newline") {
			hasNewlineChange = true
			break
		}
	}
	if !hasNewlineChange {
		t.Error("Expected newline addition to be recorded")
	}

	// Verify newline was added
	fixed, _ := os.ReadFile(testFile)
	if !strings.HasSuffix(string(fixed), "\n") {
		t.Error("Missing newline was not added")
	}
}

func TestFixFile_DryRun(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value   \n" // Has trailing whitespace
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, true) // dry run = true

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if !result.Fixed {
		t.Error("Expected file to be marked as fixed (in dry run mode)")
	}

	// Verify file was NOT modified
	actual, _ := os.ReadFile(testFile)
	if string(actual) != content {
		t.Error("File was modified in dry run mode")
	}
}

func TestFixFile_NoChangesNeeded(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value\nanother: test\n" // Already correct
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	if result.Fixed {
		t.Error("Expected file to NOT be marked as fixed when no changes needed")
	}

	if len(result.Changes) != 0 {
		t.Errorf("Expected no changes, got %d", len(result.Changes))
	}
}

func TestFixFile_NonexistentFile(t *testing.T) {
	result := fixFile("/nonexistent/path/file.yaml", false)

	if result.Error == nil {
		t.Error("Expected error for nonexistent file")
	}
}

func TestTryAddMetaVersion_MissingMeta(t *testing.T) {
	content := `vision: "Test vision"
north_star: "Test north star"
`
	result := &FixResult{Changes: make([]string, 0)}
	fixed := tryAddMetaVersion(content, result)

	if !strings.Contains(fixed, "meta:") {
		t.Error("Expected meta section to be added")
	}

	if !strings.Contains(fixed, "epf_version") {
		t.Error("Expected epf_version to be added")
	}

	hasMetaChange := false
	for _, change := range result.Changes {
		if strings.Contains(change, "meta") {
			hasMetaChange = true
			break
		}
	}
	if !hasMetaChange {
		t.Error("Expected meta addition to be recorded in changes")
	}
}

func TestTryAddMetaVersion_MetaExistsNoVersion(t *testing.T) {
	content := `meta:
  author: "test"

vision: "Test vision"
`
	result := &FixResult{Changes: make([]string, 0)}
	fixed := tryAddMetaVersion(content, result)

	if !strings.Contains(fixed, "epf_version") {
		t.Error("Expected epf_version to be added to existing meta")
	}
}

func TestTryAddMetaVersion_AlreadyHasVersion(t *testing.T) {
	content := `meta:
  epf_version: "1.9.0"

vision: "Test vision"
`
	result := &FixResult{Changes: make([]string, 0)}
	fixed := tryAddMetaVersion(content, result)

	// Should not modify if version already exists
	if len(result.Changes) != 0 {
		t.Error("Expected no changes when epf_version already exists")
	}

	// Content should be unchanged
	if fixed != content {
		t.Error("Content should not be modified when version already exists")
	}
}

func TestTryAddMetaVersion_NonEPFFile(t *testing.T) {
	content := `name: "Some random YAML"
config:
  value: 123
`
	result := &FixResult{Changes: make([]string, 0)}
	fixed := tryAddMetaVersion(content, result)

	// Should not add meta to non-EPF files
	if strings.Contains(fixed, "epf_version") && !strings.Contains(content, "epf_version") {
		t.Error("Should not add epf_version to non-EPF YAML files")
	}
}

func TestFixFile_MultipleTrailingNewlines(t *testing.T) {
	tmpDir := t.TempDir()
	testFile := filepath.Join(tmpDir, "test.yaml")
	content := "key: value\n\n\n\n" // Multiple trailing newlines
	if err := os.WriteFile(testFile, []byte(content), 0644); err != nil {
		t.Fatalf("Failed to write test file: %v", err)
	}

	result := fixFile(testFile, false)

	if result.Error != nil {
		t.Fatalf("fixFile returned error: %v", result.Error)
	}

	// Verify only one trailing newline
	fixed, _ := os.ReadFile(testFile)
	if string(fixed) != "key: value\n" {
		t.Errorf("Expected single trailing newline, got: %q", string(fixed))
	}
}

func TestFixSummary(t *testing.T) {
	summary := &FixSummary{
		TotalFiles: 10,
		FixedFiles: 3,
		TotalFixes: 5,
		DryRun:     false,
		Results: []*FixResult{
			{File: "a.yaml", Fixed: true, Changes: []string{"change1", "change2"}},
			{File: "b.yaml", Fixed: false, Changes: []string{}},
			{File: "c.yaml", Fixed: true, Changes: []string{"change3"}},
		},
	}

	if summary.TotalFiles != 10 {
		t.Errorf("Expected TotalFiles=10, got %d", summary.TotalFiles)
	}
	if summary.FixedFiles != 3 {
		t.Errorf("Expected FixedFiles=3, got %d", summary.FixedFiles)
	}
	if summary.TotalFixes != 5 {
		t.Errorf("Expected TotalFixes=5, got %d", summary.TotalFixes)
	}
}

func TestFixResult(t *testing.T) {
	result := &FixResult{
		File:    "test.yaml",
		Fixed:   true,
		Changes: []string{"change1", "change2"},
		Error:   nil,
	}

	if result.File != "test.yaml" {
		t.Errorf("Expected File='test.yaml', got %s", result.File)
	}
	if !result.Fixed {
		t.Error("Expected Fixed=true")
	}
	if len(result.Changes) != 2 {
		t.Errorf("Expected 2 changes, got %d", len(result.Changes))
	}
}

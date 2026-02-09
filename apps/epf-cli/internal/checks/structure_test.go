package checks

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDetectRepoTypeProduct(t *testing.T) {
	// Create temp directory structure for product repo
	tmpDir := t.TempDir()

	// Create _instances/product/READY structure
	instancePath := filepath.Join(tmpDir, "_instances", "test-product", "READY")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatal(err)
	}

	// Create a dummy file
	if err := os.WriteFile(filepath.Join(instancePath, "00_north_star.yaml"), []byte("vision: test"), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeProduct {
		t.Errorf("Expected RepoTypeProduct, got %s", result.RepoType)
	}

	if !result.Valid {
		t.Errorf("Expected valid result, got invalid: %s", result.Message)
	}
}

func TestDetectRepoTypeCanonical(t *testing.T) {
	// Create temp directory structure for canonical EPF
	tmpDir := t.TempDir()

	// Create canonical markers
	canonicalDirs := []string{"schemas", "templates", "wizards"}
	for _, dir := range canonicalDirs {
		if err := os.MkdirAll(filepath.Join(tmpDir, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}

	// Create CANONICAL_PURITY_RULES.md
	if err := os.WriteFile(filepath.Join(tmpDir, "CANONICAL_PURITY_RULES.md"), []byte("rules"), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeCanonical {
		t.Errorf("Expected RepoTypeCanonical, got %s", result.RepoType)
	}
}

func TestDetectCanonicalContentInProduct(t *testing.T) {
	// Create temp directory structure - product repo with canonical content
	tmpDir := t.TempDir()

	// Create _instances/product structure (product repo marker)
	instancePath := filepath.Join(tmpDir, "_instances", "test-product", "READY")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatal(err)
	}

	// Add canonical content that should NOT be here
	if err := os.MkdirAll(filepath.Join(tmpDir, "schemas"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "schemas", "test.json"), []byte("{}"), 0644); err != nil {
		t.Fatal(err)
	}

	if err := os.MkdirAll(filepath.Join(tmpDir, "templates"), 0755); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeProduct {
		t.Errorf("Expected RepoTypeProduct, got %s", result.RepoType)
	}

	if result.Valid {
		t.Error("Expected invalid result due to canonical content in product repo")
	}

	if result.Severity != SeverityCritical {
		t.Errorf("Expected SeverityCritical, got %s", result.Severity)
	}

	// Check that issues were detected
	issues := result.GetCanonicalContentIssues()
	if len(issues) == 0 {
		t.Error("Expected canonical content issues to be detected")
	}
}

func TestDetectInstanceInCanonical(t *testing.T) {
	// Create temp directory structure for canonical EPF with instances
	tmpDir := t.TempDir()

	// Create canonical markers
	canonicalDirs := []string{"schemas", "templates", "wizards"}
	for _, dir := range canonicalDirs {
		if err := os.MkdirAll(filepath.Join(tmpDir, dir), 0755); err != nil {
			t.Fatal(err)
		}
	}

	if err := os.WriteFile(filepath.Join(tmpDir, "CANONICAL_PURITY_RULES.md"), []byte("rules"), 0644); err != nil {
		t.Fatal(err)
	}

	// Add _instances with actual instances (should NOT be here in canonical)
	instancePath := filepath.Join(tmpDir, "_instances", "some-product", "READY")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeCanonical {
		t.Errorf("Expected RepoTypeCanonical, got %s", result.RepoType)
	}

	if result.Valid {
		t.Error("Expected invalid result due to instances in canonical EPF")
	}

	if result.Severity != SeverityCritical {
		t.Errorf("Expected SeverityCritical, got %s", result.Severity)
	}
}

func TestCleanProductRepo(t *testing.T) {
	// Create temp directory structure for clean product repo
	tmpDir := t.TempDir()

	// Create only _instances structure
	instancePath := filepath.Join(tmpDir, "_instances", "my-product", "READY")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatal(err)
	}

	firePath := filepath.Join(tmpDir, "_instances", "my-product", "FIRE", "feature_definitions")
	if err := os.MkdirAll(firePath, 0755); err != nil {
		t.Fatal(err)
	}

	// Add AGENTS.md and README.md (allowed)
	if err := os.WriteFile(filepath.Join(tmpDir, "AGENTS.md"), []byte("# Agent Instructions"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(tmpDir, "README.md"), []byte("# EPF"), 0644); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeProduct {
		t.Errorf("Expected RepoTypeProduct, got %s", result.RepoType)
	}

	if !result.Valid {
		t.Errorf("Expected valid result for clean product repo, got: %s", result.Message)
	}
}

func TestDirectInstancePath(t *testing.T) {
	// Test when health check is run directly on an instance path
	tmpDir := t.TempDir()

	// Create instance structure directly
	readyPath := filepath.Join(tmpDir, "READY")
	firePath := filepath.Join(tmpDir, "FIRE", "feature_definitions")
	if err := os.MkdirAll(readyPath, 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(firePath, 0755); err != nil {
		t.Fatal(err)
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.RepoType != RepoTypeProduct {
		t.Errorf("Expected RepoTypeProduct when checking instance directly, got %s", result.RepoType)
	}
}

func TestCanonicalFilesInProduct(t *testing.T) {
	// Test detection of canonical files in product repo
	tmpDir := t.TempDir()

	// Create _instances structure
	instancePath := filepath.Join(tmpDir, "_instances", "test", "READY")
	if err := os.MkdirAll(instancePath, 0755); err != nil {
		t.Fatal(err)
	}

	// Add canonical files that should not be here
	canonicalFiles := []string{
		"VERSION",
		"CANONICAL_PURITY_RULES.md",
		"integration_specification.yaml",
	}
	for _, file := range canonicalFiles {
		if err := os.WriteFile(filepath.Join(tmpDir, file), []byte("content"), 0644); err != nil {
			t.Fatal(err)
		}
	}

	checker := NewStructureChecker(tmpDir)
	result := checker.Check()

	if result.Valid {
		t.Error("Expected invalid result due to canonical files in product repo")
	}

	// Should have canonical_files_in_product issue
	found := false
	for _, issue := range result.Issues {
		if issue.Type == "canonical_files_in_product" {
			found = true
			if issue.ItemCount != 3 {
				t.Errorf("Expected 3 canonical files, got %d", issue.ItemCount)
			}
		}
	}
	if !found {
		t.Error("Expected canonical_files_in_product issue")
	}
}

func TestHasCriticalStructureIssues(t *testing.T) {
	result := &StructureResult{
		Valid:    false,
		Severity: SeverityCritical,
	}

	if !result.HasCriticalStructureIssues() {
		t.Error("Expected HasCriticalStructureIssues to return true")
	}

	result.Valid = true
	if result.HasCriticalStructureIssues() {
		t.Error("Expected HasCriticalStructureIssues to return false when valid")
	}

	result.Valid = false
	result.Severity = SeverityWarning
	if result.HasCriticalStructureIssues() {
		t.Error("Expected HasCriticalStructureIssues to return false for non-critical severity")
	}
}

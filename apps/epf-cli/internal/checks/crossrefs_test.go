package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCrossRefExcludesCanonicalDefinitions verifies that cross-reference
// checking only looks at fd-* files, not canonical definitions (sd-*, pd-*, cd-*).
func TestCrossRefExcludesCanonicalDefinitions(t *testing.T) {
	tmpDir := t.TempDir()

	// Create FIRE/definitions/product with one product feature
	fdDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	os.MkdirAll(fdDir, 0755)
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(`id: "fd-001"
name: "Product Feature"
dependencies:
  requires: []
`), 0644)

	// Create READY/definitions with canonical definitions that have "dependencies"
	// These should NOT be checked
	defDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy")
	os.MkdirAll(defDir, 0755)
	os.WriteFile(filepath.Join(defDir, "sd-001.yaml"), []byte(`id: "sd-001"
name: "Strategy Def"
dependencies:
  requires:
    - id: "nonexistent-feature"
      reason: "Should not be checked"
`), 0644)

	// Check only FIRE dir (normal usage)
	checker := NewCrossReferenceChecker(filepath.Join(tmpDir, "FIRE"))
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Should only find fd-001
	if result.TotalFeatures != 1 {
		t.Errorf("Expected 1 feature, got %d", result.TotalFeatures)
	}

	// No broken links (fd-001 has empty requires)
	if len(result.BrokenLinks) != 0 {
		t.Errorf("Expected 0 broken links, got %d", len(result.BrokenLinks))
	}
}

// TestCrossRefFromInstanceRoot verifies canonical defs in READY/ are excluded
// when checking from the instance root.
func TestCrossRefFromInstanceRoot(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a canonical definition in READY
	defDir := filepath.Join(tmpDir, "FIRE", "definitions", "org_ops")
	os.MkdirAll(defDir, 0755)
	os.WriteFile(filepath.Join(defDir, "pd-001.yaml"), []byte(`id: "pd-001"
name: "OrgOps Def"
`), 0644)

	// No definitions/product dir
	checker := NewCrossReferenceChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Should find 0 features (pd-001 doesn't match fd-* prefix)
	if result.TotalFeatures != 0 {
		t.Errorf("Expected 0 features (canonical excluded), got %d", result.TotalFeatures)
	}
}

// TestVersionCheckerSkipsCanonicalDefinitions verifies that the version
// checker does not scan FIRE/definitions/ for canonical artifacts.
func TestVersionCheckerSkipsCanonicalDefinitions(t *testing.T) {
	tmpDir := t.TempDir()

	// Create READY/ with a canonical definition (should be skipped)
	defDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy")
	os.MkdirAll(defDir, 0755)
	os.WriteFile(filepath.Join(defDir, "sd-001.yaml"), []byte(`meta:
  epf_version: "1.0.0"
id: "sd-001"
name: "Strategy Def"
`), 0644)

	// Create a real READY artifact (should be detected)
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)
	os.WriteFile(filepath.Join(tmpDir, "READY", "00_north_star.yaml"), []byte(`meta:
  epf_version: "2.0.0"
vision: "Test"
`), 0644)

	checker := NewVersionAlignmentChecker(tmpDir, "")
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Should only find the north_star, not sd-001
	if result.TotalArtifacts != 1 {
		t.Errorf("Expected 1 artifact (north_star only), got %d", result.TotalArtifacts)
		for _, r := range result.Results {
			t.Logf("  Found: %s (%s)", r.File, r.ArtifactType)
		}
	}
}

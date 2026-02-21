package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestFeatureQualityExcludesCanonicalDefinitions verifies that the feature
// quality checker only checks fd-* files and files in definitions/product/,
// not canonical definitions (sd-*, pd-*, cd-*) in definitions/.
func TestFeatureQualityExcludesCanonicalDefinitions(t *testing.T) {
	tmpDir := t.TempDir()

	// Create FIRE/definitions/product with a product feature
	fdDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	os.MkdirAll(fdDir, 0755)
	productFD := `id: "fd-001"
name: "Product Feature"
slug: "product-feature"
status: "draft"
definition:
  job_to_be_done: "When I need something, I want to do it, so I can achieve it."
  solution_approach: "We will build a solution"
  personas:
    - id: "p-1"
      name: "Test User"
      narrative: "This is a test persona narrative that has enough content to pass the minimum length check for the quality checker."
`
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(productFD), 0644)

	// Create READY/definitions with canonical definitions
	defDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy")
	os.MkdirAll(defDir, 0755)
	canonicalDef := `id: "sd-001"
name: "Strategy Definition"
slug: "strategy-definition"
active: false
definition:
  description: "TBD"
`
	os.WriteFile(filepath.Join(defDir, "sd-001.yaml"), []byte(canonicalDef), 0644)

	defDir2 := filepath.Join(tmpDir, "FIRE", "definitions", "org_ops")
	os.MkdirAll(defDir2, 0755)
	os.WriteFile(filepath.Join(defDir2, "pd-001.yaml"), []byte(`id: "pd-001"
name: "OrgOps Definition"
active: false
`), 0644)

	// Check from instance root — should only find the fd-001 feature
	checker := NewFeatureQualityChecker(tmpDir)
	summary, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if summary.TotalFeatures != 1 {
		t.Errorf("Expected 1 feature (fd-001 only), got %d", summary.TotalFeatures)
	}

	if len(summary.Results) != 1 {
		t.Fatalf("Expected 1 result, got %d", len(summary.Results))
	}

	if summary.Results[0].FeatureID != "fd-001" {
		t.Errorf("Expected feature ID 'fd-001', got %q", summary.Results[0].FeatureID)
	}
}

// TestFeatureQualityExcludesCanonicalPrefixes verifies sd-*, pd-*, cd-* files
// outside of definitions/product/ are not checked.
func TestFeatureQualityExcludesCanonicalPrefixes(t *testing.T) {
	tmpDir := t.TempDir()

	// Create canonical definition files directly in READY/
	readyDir := filepath.Join(tmpDir, "READY")
	os.MkdirAll(readyDir, 0755)

	for _, prefix := range []string{"sd-001", "pd-002", "cd-003"} {
		content := `id: "` + prefix + `"
name: "Canonical Def"
active: false
`
		os.WriteFile(filepath.Join(readyDir, prefix+".yaml"), []byte(content), 0644)
	}

	checker := NewFeatureQualityChecker(tmpDir)
	summary, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if summary.TotalFeatures != 0 {
		t.Errorf("Expected 0 features (canonical defs should be excluded), got %d", summary.TotalFeatures)
	}
}

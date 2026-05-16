package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestFeatureQualityChecksAllTracks verifies that the feature quality checker
// checks definitions from all tracks (product, strategy, org_ops, commercial).
func TestFeatureQualityChecksAllTracks(t *testing.T) {
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

	// Create strategy definitions
	sdDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy")
	os.MkdirAll(sdDir, 0755)
	strategyDef := `id: "sd-001"
name: "Strategy Definition"
slug: "strategy-definition"
status: "draft"
definition:
  job_to_be_done: "When defining strategy, I want clear direction, so I can align the team."
  solution_approach: "We will create frameworks"
  personas:
    - id: "p-1"
      name: "Strategist"
      narrative: "This is a strategy persona narrative that has enough content to pass the minimum length check for quality."
`
	os.WriteFile(filepath.Join(sdDir, "sd-001.yaml"), []byte(strategyDef), 0644)

	// Create commercial definitions
	cdDir := filepath.Join(tmpDir, "FIRE", "definitions", "commercial")
	os.MkdirAll(cdDir, 0755)
	commercialDef := `id: "cd-001"
name: "Commercial Definition"
slug: "commercial-definition"
status: "draft"
definition:
  job_to_be_done: "When selling, I want to reach customers, so I can close deals."
  solution_approach: "We will build sales tooling"
  personas:
    - id: "p-1"
      name: "Sales Rep"
      narrative: "This is a commercial persona narrative that has enough content to pass the minimum length check for quality."
`
	os.WriteFile(filepath.Join(cdDir, "cd-001.yaml"), []byte(commercialDef), 0644)

	// Check from instance root — should find definitions from all tracks
	checker := NewFeatureQualityChecker(tmpDir)
	summary, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if summary.TotalFeatures != 3 {
		t.Errorf("Expected 3 features (fd-001, sd-001, cd-001), got %d", summary.TotalFeatures)
		for _, r := range summary.Results {
			t.Logf("  Found: %s (%s)", r.FeatureID, r.File)
		}
	}
}

// TestFeatureQualitySkipsNonDefinitionFiles verifies that non-definition files
// (files not matching fd-*, sd-*, pd-*, cd-* and not in definitions/ directories)
// are not checked.
func TestFeatureQualitySkipsNonDefinitionFiles(t *testing.T) {
	tmpDir := t.TempDir()

	// Create some non-definition YAML files in READY/
	readyDir := filepath.Join(tmpDir, "READY")
	os.MkdirAll(readyDir, 0755)

	// These should NOT be checked — they don't have definition prefixes
	for _, name := range []string{"00_north_star.yaml", "value_model.yaml", "random.yaml"} {
		content := `id: "not-a-definition"
name: "Not a definition"
`
		os.WriteFile(filepath.Join(readyDir, name+".yaml"), []byte(content), 0644)
	}

	checker := NewFeatureQualityChecker(tmpDir)
	summary, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if summary.TotalFeatures != 0 {
		t.Errorf("Expected 0 features (non-definition files should be excluded), got %d", summary.TotalFeatures)
	}
}

// TestFeatureQualityDirectoryLevelCheck verifies that when given a specific
// track directory, only that track's definitions are checked.
func TestFeatureQualityDirectoryLevelCheck(t *testing.T) {
	tmpDir := t.TempDir()

	// Create definitions in product and commercial tracks
	fdDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	os.MkdirAll(fdDir, 0755)
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(`id: "fd-001"
name: "Product Feature"
slug: "product-feature"
status: "draft"
definition:
  job_to_be_done: "Test"
  solution_approach: "Test"
  personas:
    - id: "p-1"
      name: "Test"
      narrative: "Test narrative"
`), 0644)

	cdDir := filepath.Join(tmpDir, "FIRE", "definitions", "commercial")
	os.MkdirAll(cdDir, 0755)
	os.WriteFile(filepath.Join(cdDir, "cd-001.yaml"), []byte(`id: "cd-001"
name: "Commercial Feature"
slug: "commercial-feature"
status: "draft"
definition:
  job_to_be_done: "Test"
  solution_approach: "Test"
  personas:
    - id: "p-1"
      name: "Test"
      narrative: "Test narrative"
`), 0644)

	// When pointing to a specific track directory, should only find that track
	checker := NewFeatureQualityChecker(fdDir)
	summary, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if summary.TotalFeatures != 1 {
		t.Errorf("Expected 1 feature when checking product/ only, got %d", summary.TotalFeatures)
	}
}

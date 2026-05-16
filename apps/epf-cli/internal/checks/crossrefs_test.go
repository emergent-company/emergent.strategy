package checks

import (
	"os"
	"path/filepath"
	"testing"
)

// TestCrossRefChecksAllTracks verifies that cross-reference checking validates
// definitions from all tracks (product, strategy, org_ops, commercial).
func TestCrossRefChecksAllTracks(t *testing.T) {
	tmpDir := t.TempDir()

	// Create FIRE/definitions/product with one product feature
	fdDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	os.MkdirAll(fdDir, 0755)
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(`id: "fd-001"
name: "Product Feature"
dependencies:
  requires: []
`), 0644)

	// Create strategy definition that references product feature
	sdDir := filepath.Join(tmpDir, "FIRE", "definitions", "strategy")
	os.MkdirAll(sdDir, 0755)
	os.WriteFile(filepath.Join(sdDir, "sd-001.yaml"), []byte(`id: "sd-001"
name: "Strategy Def"
dependencies:
  requires:
    - id: "fd-001"
      reason: "Cross-track dependency"
`), 0644)

	// Check the FIRE directory
	checker := NewCrossReferenceChecker(filepath.Join(tmpDir, "FIRE"))
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Should find both fd-001 and sd-001
	if result.TotalFeatures != 2 {
		t.Errorf("Expected 2 features (fd-001 + sd-001), got %d", result.TotalFeatures)
	}

	// No broken links — sd-001 references fd-001 which exists
	if len(result.BrokenLinks) != 0 {
		t.Errorf("Expected 0 broken links, got %d", len(result.BrokenLinks))
		for _, bl := range result.BrokenLinks {
			t.Logf("  Broken: %s -> %s (%s)", bl.SourceFeatureID, bl.TargetID, bl.Message)
		}
	}
}

// TestCrossRefDetectsBrokenCrossTrackDependency verifies that a broken
// cross-track dependency reference is properly detected.
func TestCrossRefDetectsBrokenCrossTrackDependency(t *testing.T) {
	tmpDir := t.TempDir()

	// Create a commercial definition with a broken cross-track reference
	cdDir := filepath.Join(tmpDir, "FIRE", "definitions", "commercial")
	os.MkdirAll(cdDir, 0755)
	os.WriteFile(filepath.Join(cdDir, "cd-001.yaml"), []byte(`id: "cd-001"
name: "Commercial Def"
dependencies:
  requires:
    - id: "nonexistent-feature"
      reason: "Should be detected as broken"
`), 0644)

	checker := NewCrossReferenceChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	if result.TotalFeatures != 1 {
		t.Errorf("Expected 1 feature (cd-001), got %d", result.TotalFeatures)
	}

	if len(result.BrokenLinks) != 1 {
		t.Errorf("Expected 1 broken link, got %d", len(result.BrokenLinks))
	}
}

// TestCrossRefFromInstanceRootFindsAllTracks verifies that checking from the
// instance root finds definitions across all tracks.
func TestCrossRefFromInstanceRootFindsAllTracks(t *testing.T) {
	tmpDir := t.TempDir()

	// Create an org_ops definition
	pdDir := filepath.Join(tmpDir, "FIRE", "definitions", "org_ops")
	os.MkdirAll(pdDir, 0755)
	os.WriteFile(filepath.Join(pdDir, "pd-001.yaml"), []byte(`id: "pd-001"
name: "OrgOps Def"
`), 0644)

	// Create a product definition
	fdDir := filepath.Join(tmpDir, "FIRE", "definitions", "product")
	os.MkdirAll(fdDir, 0755)
	os.WriteFile(filepath.Join(fdDir, "fd-001.yaml"), []byte(`id: "fd-001"
name: "Product Def"
`), 0644)

	checker := NewCrossReferenceChecker(tmpDir)
	result, err := checker.Check()
	if err != nil {
		t.Fatalf("Check() error: %v", err)
	}

	// Should find both pd-001 and fd-001
	if result.TotalFeatures != 2 {
		t.Errorf("Expected 2 features (pd-001 + fd-001), got %d", result.TotalFeatures)
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

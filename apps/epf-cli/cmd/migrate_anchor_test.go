package cmd

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/eyedea-io/emergent/apps/epf-cli/internal/anchor"
)

func TestMigrateAnchor_LegacyInstance(t *testing.T) {
	// Create a temporary legacy instance
	tmpDir, err := os.MkdirTemp("", "epf-migrate-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create legacy structure (READY/FIRE/AIM but no _epf.yaml)
	for _, dir := range []string{"READY", "FIRE", "AIM"} {
		if err := os.MkdirAll(filepath.Join(tmpDir, dir), 0755); err != nil {
			t.Fatalf("Failed to create %s directory: %v", dir, err)
		}
	}

	// Create _meta.yaml with product info
	metaContent := `instance:
  product_name: "test-legacy-product"
  epf_version: "2.10.0"
  description: "Test legacy instance"
`
	if err := os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(metaContent), 0644); err != nil {
		t.Fatalf("Failed to create _meta.yaml: %v", err)
	}

	t.Run("is legacy instance", func(t *testing.T) {
		if !anchor.IsLegacyInstance(tmpDir) {
			t.Error("Expected directory to be detected as legacy instance")
		}
	})

	t.Run("infer from legacy", func(t *testing.T) {
		inferred, err := anchor.InferFromLegacy(tmpDir)
		if err != nil {
			t.Fatalf("InferFromLegacy failed: %v", err)
		}

		if inferred.ProductName != "test-legacy-product" {
			t.Errorf("ProductName = %q, want %q", inferred.ProductName, "test-legacy-product")
		}
		if inferred.EPFVersion != "2.10.0" {
			t.Errorf("EPFVersion = %q, want %q", inferred.EPFVersion, "2.10.0")
		}
		if inferred.Structure.Type != "phased" {
			t.Errorf("Structure.Type = %q, want %q", inferred.Structure.Type, "phased")
		}
	})

	t.Run("create anchor file", func(t *testing.T) {
		inferred, err := anchor.InferFromLegacy(tmpDir)
		if err != nil {
			t.Fatalf("InferFromLegacy failed: %v", err)
		}

		err = inferred.Save(tmpDir)
		if err != nil {
			t.Fatalf("Save failed: %v", err)
		}

		// Verify anchor file exists
		anchorPath := filepath.Join(tmpDir, "_epf.yaml")
		if _, err := os.Stat(anchorPath); os.IsNotExist(err) {
			t.Error("Anchor file not created")
		}

		// Verify it's valid
		result := anchor.ValidateFile(tmpDir)
		if !result.Valid {
			t.Errorf("Anchor validation failed: %v", result.Errors)
		}
	})

	t.Run("no longer legacy after migration", func(t *testing.T) {
		if anchor.IsLegacyInstance(tmpDir) {
			t.Error("Instance should not be detected as legacy after migration")
		}
		if !anchor.Exists(tmpDir) {
			t.Error("Anchor should exist after migration")
		}
	})
}

func TestMigrateAnchor_NotLegacyInstance(t *testing.T) {
	// Create a temporary directory that's not an EPF instance
	tmpDir, err := os.MkdirTemp("", "epf-not-epf-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create a random file (not EPF structure)
	if err := os.WriteFile(filepath.Join(tmpDir, "random.txt"), []byte("hello"), 0644); err != nil {
		t.Fatalf("Failed to create file: %v", err)
	}

	t.Run("not detected as legacy", func(t *testing.T) {
		if anchor.IsLegacyInstance(tmpDir) {
			t.Error("Directory without EPF structure should not be detected as legacy instance")
		}
	})
}

func TestMigrateAnchor_AlreadyHasAnchor(t *testing.T) {
	// Create a temporary instance with anchor
	tmpDir, err := os.MkdirTemp("", "epf-has-anchor-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create anchor file
	a := anchor.NewWithOptions("test-product", "Test instance", "2.12.0")
	if err := a.Save(tmpDir); err != nil {
		t.Fatalf("Failed to create anchor: %v", err)
	}

	t.Run("anchor exists", func(t *testing.T) {
		if !anchor.Exists(tmpDir) {
			t.Error("Anchor should exist")
		}
	})

	t.Run("not legacy", func(t *testing.T) {
		if anchor.IsLegacyInstance(tmpDir) {
			t.Error("Instance with anchor should not be detected as legacy")
		}
	})
}

func TestMigrateAnchor_PartialLegacyStructure(t *testing.T) {
	// Create instance with only some EPF directories
	tmpDir, err := os.MkdirTemp("", "epf-partial-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Only create READY (not enough markers)
	os.MkdirAll(filepath.Join(tmpDir, "READY"), 0755)

	t.Run("single directory not detected", func(t *testing.T) {
		if anchor.IsLegacyInstance(tmpDir) {
			t.Error("Single EPF directory should not be enough to detect as legacy")
		}
	})

	// Add _meta.yaml to reach threshold
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte("instance:\n  product_name: test"), 0644)

	t.Run("two markers detected as legacy", func(t *testing.T) {
		if !anchor.IsLegacyInstance(tmpDir) {
			t.Error("Two EPF markers should be detected as legacy instance")
		}
	})
}

func TestMigrateAnchor_FlatStructure(t *testing.T) {
	// Create legacy flat structure (no READY/FIRE/AIM)
	tmpDir, err := os.MkdirTemp("", "epf-flat-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	// Create _meta.yaml only (flat structure)
	metaContent := `epf_version: "1.0.0"
instance_name: "flat-product"
`
	os.WriteFile(filepath.Join(tmpDir, "_meta.yaml"), []byte(metaContent), 0644)

	t.Run("flat structure with meta not detected", func(t *testing.T) {
		// With only _meta.yaml, it's not enough (needs 2 markers)
		if anchor.IsLegacyInstance(tmpDir) {
			t.Error("Single _meta.yaml should not be enough to detect as legacy")
		}
	})
}
